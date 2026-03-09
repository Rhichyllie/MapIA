import { describe, expect, it } from "vitest";
import {
  findPrimaryImportedExternalRef,
  buildImportedEdgeExternalRefs,
  buildImportedNodeExternalRefs,
  buildPostgresImportedRelationName,
  isImportedExternalRef,
  isImportedExternalRefFromSystem,
} from "./external-refs";

describe("importing/domain/external-refs", () => {
  it("builds a stable wrapper shape for prisma-file node refs", () => {
    const [ref] = buildImportedNodeExternalRefs({
      modelName: "User",
      context: {
        sourceKind: "prisma-schema-file",
        filePath: "prisma/schema.prisma",
      },
    });

    expect(ref).toBeDefined();
    expect(Object.keys(ref ?? {}).sort()).toEqual([
      "externalId",
      "id",
      "locator",
      "metadata",
      "system",
    ]);
    expect(ref?.system).toBe("prisma");
    expect(ref?.externalId).toMatch(/^import:/);
    expect(ref?.metadata).toEqual({});
    expect(ref?.metadata && typeof ref.metadata).toBe("object");
    expect(Array.isArray(ref?.metadata)).toBe(false);
    expect(isImportedExternalRef(ref)).toBe(true);
    expect(isImportedExternalRefFromSystem(ref, "prisma")).toBe(true);
    expect(isImportedExternalRefFromSystem(ref, "postgres")).toBe(false);
  });

  it("is deterministic for the same postgres edge input (same id and externalId)", () => {
    const context = {
      sourceKind: "postgres-live" as const,
      modelsByModelName: {},
      relationsByRelationName: {
        [buildPostgresImportedRelationName({
          schema: "public",
          table: "posts",
          constraint: "posts_author_id_fkey",
        })]: {
          schema: "public",
          table: "posts",
          column: "author_id",
          constraint: "posts_author_id_fkey",
        },
      },
    };

    const first = buildImportedEdgeExternalRefs({
      sourceModelName: "Posts",
      sourceFieldName: "author",
      relationName: buildPostgresImportedRelationName({
        schema: "public",
        table: "posts",
        constraint: "posts_author_id_fkey",
      }),
      context,
    })[0];
    const second = buildImportedEdgeExternalRefs({
      sourceModelName: "Posts",
      sourceFieldName: "author",
      relationName: buildPostgresImportedRelationName({
        schema: "public",
        table: "posts",
        constraint: "posts_author_id_fkey",
      }),
      context,
    })[0];

    expect(first?.id).toBe(second?.id);
    expect(first?.externalId).toBe(second?.externalId);
    expect(first?.locator).toEqual(second?.locator);
    expect(isImportedExternalRef(first)).toBe(true);
    expect(isImportedExternalRefFromSystem(first, "postgres")).toBe(true);
  });

  it("normalizes prisma file path separators without breaking determinism", () => {
    const windows = buildImportedNodeExternalRefs({
      modelName: "User",
      context: {
        sourceKind: "prisma-schema-file",
        filePath: "prisma\\schema.prisma",
      },
    })[0];
    const posix = buildImportedNodeExternalRefs({
      modelName: "User",
      context: {
        sourceKind: "prisma-schema-file",
        filePath: "prisma/schema.prisma",
      },
    })[0];

    expect(windows?.locator).toMatchObject({
      sourceKind: "prisma-schema-file",
      filePath: "prisma/schema.prisma",
      modelName: "User",
    });
    expect(posix?.locator).toMatchObject({
      sourceKind: "prisma-schema-file",
      filePath: "prisma/schema.prisma",
      modelName: "User",
    });
    expect(windows?.externalId).toBe(posix?.externalId);
    expect(windows?.id).toBe(posix?.id);
  });

  it("finds the primary imported ref and ignores non-import refs", () => {
    const imported = buildImportedNodeExternalRefs({
      modelName: "User",
      context: {
        sourceKind: "prisma-schema-file",
        filePath: "prisma/schema.prisma",
      },
    })[0];

    const primary = findPrimaryImportedExternalRef([
      {
        id: "e5bbd3da-bbc3-4dd4-9e8e-f4024fd6fe95",
        system: "manual",
        externalId: "manual:user",
        locator: { sourceKind: "manual-ui" },
        metadata: {},
      },
      imported!,
    ]);

    expect(primary).toEqual(imported);
    expect(findPrimaryImportedExternalRef(undefined)).toBeUndefined();
    expect(findPrimaryImportedExternalRef([])).toBeUndefined();
  });

  it("rejects malformed imported-like refs in guards", () => {
    const malformed = {
      id: "bf90dfd9-9733-4d1c-8b84-0f96d31aebce",
      system: "prisma",
      externalId: "import:prisma-schema-file?sourceKind=prisma-schema-file",
      locator: { sourceKind: "prisma-schema-file" },
      metadata: {},
    };

    expect(isImportedExternalRef(malformed as never)).toBe(false);
    expect(isImportedExternalRefFromSystem(malformed as never, "prisma")).toBe(false);

    const mismatchedSystem = {
      id: "32f304f0-207b-4064-8dea-228568b44a42",
      system: "postgres",
      externalId:
        "import:prisma-schema-file?sourceKind=prisma-schema-file&filePath=prisma%2Fschema.prisma",
      locator: {
        sourceKind: "prisma-schema-file",
        filePath: "prisma/schema.prisma",
      },
      metadata: {},
    };

    expect(isImportedExternalRef(mismatchedSystem as never)).toBe(false);
  });

  it("keeps postgres imported relation naming convention stable", () => {
    expect(
      buildPostgresImportedRelationName({
        schema: "public",
        table: "posts",
        constraint: "posts_author_id_fkey",
      }),
    ).toBe("fk_public_posts_posts_author_id_fkey");
  });
});
