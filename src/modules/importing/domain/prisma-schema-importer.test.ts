import { describe, expect, it } from "vitest";
import {
  findPrimaryImportedExternalRef,
  isImportedExternalRef,
  isImportedExternalRefFromSystem,
} from "./external-refs";
import { importPrismaSchemaToGraphSnapshot } from "./prisma-schema-importer";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";

function expectNoDuplicateExternalRefs(externalRefs: Array<{ externalId: string }>) {
  expect(new Set(externalRefs.map((ref) => ref.externalId)).size).toBe(
    externalRefs.length,
  );
}

function expectImportedRefQuality(
  externalRef: unknown,
  expectedSystem: "prisma" | "postgres",
) {
  expect(isImportedExternalRef(externalRef as never)).toBe(true);
  expect(
    isImportedExternalRefFromSystem(externalRef as never, expectedSystem),
  ).toBe(true);

  const ref = externalRef as {
    metadata: unknown;
    locator: { sourceKind: string };
    system: string;
  };

  expect(ref.metadata).not.toBeNull();
  expect(typeof ref.metadata).toBe("object");
  expect(ref.system).toBe(expectedSystem);
  expect(ref.locator.sourceKind).toBe(
    expectedSystem === "prisma" ? "prisma-schema-file" : "postgres-live",
  );
}

function cloneSnapshotJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("importPrismaSchemaToGraphSnapshot", () => {
  it("imports a simple Prisma schema into nodes and deduplicated relation edges", () => {
    const schemaText = `
      datasource db {
        provider = "postgresql"
        url      = env("DATABASE_URL")
      }

      model User {
        id    String @id @default(cuid())
        email String @unique
        posts Post[]
      }

      model Post {
        id       String  @id @default(cuid())
        title    String
        authorId String?
        author   User?   @relation(fields: [authorId], references: [id])
      }
    `;

    const result = importPrismaSchemaToGraphSnapshot({ projectId, schemaText });

    expect(result.summary).toEqual({
      modelsCount: 2,
      relationsCount: 1,
      scalarFieldsCount: 5,
    });
    expect(result.snapshot.nodes).toHaveLength(2);
    expect(result.snapshot.edges).toHaveLength(1);
    expect(result.snapshot.viewport.zoom).toBe(1);
    expect(result.snapshot.diagramType).toBe("erd");

    const userNode = result.snapshot.nodes.find((node) => node.label === "User");
    const postNode = result.snapshot.nodes.find((node) => node.label === "Post");

    expect(userNode).toBeTruthy();
    expect(postNode).toBeTruthy();
    expect(userNode?.kind).toBe("entity");
    expect(userNode?.data).toMatchObject({
      modelName: "User",
      tableName: "User",
      source: "prisma-schema",
    });
    expect(postNode?.data).toMatchObject({
      modelName: "Post",
      tableName: "Post",
      source: "prisma-schema",
    });

    const userFields = (userNode?.data.fields as Array<Record<string, unknown>>) ?? [];
    expect(userFields.map((field) => field.name)).toEqual(["id", "email"]);
    expect(userFields).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        name: "id",
        type: "string",
        flags: ["PK", "NOT_NULL", "DEFAULT"],
      }),
      expect.objectContaining({
        id: expect.any(String),
        name: "email",
        type: "string",
        flags: ["UQ", "NOT_NULL"],
      }),
    ]);
    expect(userFields.every((field) => !("isId" in field))).toBe(true);
    expect(userFields.every((field) => !("isUnique" in field))).toBe(true);

    const postFields = (postNode?.data.fields as Array<Record<string, unknown>>) ?? [];
    expect(postFields.map((field) => field.name)).toEqual(["id", "title", "authorId"]);
    expect(postFields).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        name: "id",
        type: "string",
        flags: ["PK", "NOT_NULL", "DEFAULT"],
      }),
      expect.objectContaining({
        id: expect.any(String),
        name: "title",
        type: "string",
        flags: ["NOT_NULL"],
      }),
      expect.objectContaining({
        id: expect.any(String),
        name: "authorId",
        type: "string",
        flags: ["NULLABLE", "FK"],
      }),
    ]);

    const edge = result.snapshot.edges[0];
    expect(edge.kind).toBe("references");
    expect(edge.label).toBeDefined();
    expect(edge.data).toMatchObject({
      source: "prisma-schema",
      sourceFieldName: "author",
      name: "author",
      cardinality: {
        minSource: 0,
        maxSource: 1,
        minTarget: 0,
        maxTarget: "N",
      },
      materialization: {
        mode: "fk",
        dependentSide: "source",
        fk: {
          dependentEntityId: postNode!.id,
          fkFieldIds: [postFields[2]!.id],
          referencesEntityId: userNode!.id,
          referencesFieldIds: [userFields[0]!.id],
        },
      },
    });
    expect(postFields[2]).toMatchObject({
      references: {
        entityId: userNode!.id,
        relationEdgeId: edge.id,
      },
    });
    expect(new Set([edge.sourceNodeId, edge.targetNodeId])).toEqual(
      new Set([userNode!.id, postNode!.id]),
    );
  });

  it("imports models without relations as nodes only", () => {
    const schemaText = `
      model Workspace {
        id   String @id
        name String
      }

      model Project {
        id   String @id
        name String
      }
    `;

    const result = importPrismaSchemaToGraphSnapshot({ projectId, schemaText });

    expect(result.snapshot.nodes).toHaveLength(2);
    expect(result.snapshot.edges).toHaveLength(0);
    expect(result.summary).toMatchObject({
      modelsCount: 2,
      relationsCount: 0,
      scalarFieldsCount: 4,
    });
  });

  it("keeps tableName from @@map in node payload", () => {
    const schemaText = `
      model User {
        id String @id

        @@map("users")
      }
    `;

    const result = importPrismaSchemaToGraphSnapshot({ projectId, schemaText });
    expect(result.snapshot.nodes).toHaveLength(1);
    expect(result.snapshot.nodes[0]?.data).toMatchObject({
      modelName: "User",
      tableName: "users",
      source: "prisma-schema",
    });
  });

  it("returns friendly error for empty schema", () => {
    expect(() =>
      importPrismaSchemaToGraphSnapshot({ projectId, schemaText: "   \n\t " }),
    ).toThrow(/schema prisma vazio/i);
  });

  it("returns friendly error for invalid schema parse", () => {
    const schemaText = `
      model User {
        id String @id
        @broken
      }
    `;

    expect(() =>
      importPrismaSchemaToGraphSnapshot({ projectId, schemaText }),
    ).toThrow(/schema prisma invalido/i);
  });

  it("returns friendly error when no models exist", () => {
    const schemaText = `
      datasource db {
        provider = "postgresql"
        url      = env("DATABASE_URL")
      }
    `;

    expect(() =>
      importPrismaSchemaToGraphSnapshot({ projectId, schemaText }),
    ).toThrow(/sem models/i);
  });

  it("deduplicates mirrored relation edges between the same models", () => {
    const schemaText = `
      model Author {
        id    String @id
        books Book[]
      }

      model Book {
        id       String @id
        authorId String
        author   Author @relation(fields: [authorId], references: [id])
      }
    `;

    const result = importPrismaSchemaToGraphSnapshot({ projectId, schemaText });

    expect(result.snapshot.edges).toHaveLength(1);
    expect(result.summary.relationsCount).toBe(1);
  });

  it("generates ExternalRef for imported nodes and edges from prisma schema file", () => {
    const schemaText = `
      model User {
        id    String @id
        posts Post[] @relation("UserPosts")
      }

      model Post {
        id       String @id
        authorId String
        author   User   @relation("UserPosts", fields: [authorId], references: [id])
      }
    `;

    const result = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext: {
        sourceKind: "prisma-schema-file",
        filePath: "prisma\\schema.prisma",
      },
    });

    const userNode = result.snapshot.nodes.find((node) => node.label === "User");
    const edge = result.snapshot.edges[0];
    const userExternalRef = userNode?.externalRefs[0];
    const edgeExternalRef = edge?.externalRefs[0];

    expect(userExternalRef).toMatchObject({
      system: "prisma",
      locator: {
        sourceKind: "prisma-schema-file",
        filePath: "prisma/schema.prisma",
        modelName: "User",
      },
    });
    expect(edgeExternalRef).toMatchObject({
      system: "prisma",
      locator: {
        sourceKind: "prisma-schema-file",
        filePath: "prisma/schema.prisma",
        modelName: "Post",
        fieldName: "author",
        relationName: "UserPosts",
      },
    });
    expect(result.snapshot.nodes.every((node) => Array.isArray(node.externalRefs))).toBe(true);
    expect(result.snapshot.edges.every((item) => Array.isArray(item.externalRefs))).toBe(true);
    expect(result.snapshot.nodes.every((node) => node.externalRefs.length === 1)).toBe(true);
    expect(result.snapshot.edges.every((item) => item.externalRefs.length === 1)).toBe(true);
    result.snapshot.nodes.forEach((node) => expectNoDuplicateExternalRefs(node.externalRefs));
    result.snapshot.edges.forEach((item) => expectNoDuplicateExternalRefs(item.externalRefs));
    result.snapshot.nodes.forEach((node) =>
      node.externalRefs.forEach((ref) => expectImportedRefQuality(ref, "prisma")),
    );
    result.snapshot.edges.forEach((item) =>
      item.externalRefs.forEach((ref) => expectImportedRefQuality(ref, "prisma")),
    );
    expect(findPrimaryImportedExternalRef(userNode?.externalRefs)).toEqual(userExternalRef);
    expect(findPrimaryImportedExternalRef(edge?.externalRefs)).toEqual(edgeExternalRef);
    expect(userNode?.externalRefs).toHaveLength(1);
    expect(edge?.externalRefs).toHaveLength(1);
  });

  it("generates ExternalRef for imported nodes and edges from postgres introspection provenance", () => {
    const schemaText = `
      model Users {
        id Int @id
      }

      model Posts {
        id        Int @id
        author_id Int
        author    Users @relation("fk_public_posts_posts_author_id_fkey", fields: [author_id], references: [id])
      }
    `;

    const result = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext: {
        sourceKind: "postgres-live",
        modelsByModelName: {
          Users: { schema: "public", table: "users" },
          Posts: { schema: "public", table: "posts" },
        },
        relationsByRelationName: {
          fk_public_posts_posts_author_id_fkey: {
            schema: "public",
            table: "posts",
            column: "author_id",
            constraint: "posts_author_id_fkey",
          },
        },
      },
    });

    const postsNode = result.snapshot.nodes.find((node) => node.label === "Posts");
    const edge = result.snapshot.edges[0];
    const nodeExternalRef = postsNode?.externalRefs[0];
    const edgeExternalRef = edge?.externalRefs[0];

    expect(nodeExternalRef).toMatchObject({
      system: "postgres",
      locator: {
        sourceKind: "postgres-live",
        schema: "public",
        table: "posts",
      },
    });
    expect(edgeExternalRef).toMatchObject({
      system: "postgres",
      locator: {
        sourceKind: "postgres-live",
        schema: "public",
        table: "posts",
        column: "author_id",
        constraint: "posts_author_id_fkey",
      },
    });
    expect(Object.keys(nodeExternalRef ?? {}).sort()).toEqual(
      Object.keys(edgeExternalRef ?? {}).sort(),
    );
    expect(result.snapshot.nodes.every((node) => Array.isArray(node.externalRefs))).toBe(true);
    expect(result.snapshot.edges.every((item) => Array.isArray(item.externalRefs))).toBe(true);
    expect(result.snapshot.nodes.every((node) => node.externalRefs.length === 1)).toBe(true);
    expect(result.snapshot.edges.every((item) => item.externalRefs.length === 1)).toBe(true);
    result.snapshot.nodes.forEach((node) => expectNoDuplicateExternalRefs(node.externalRefs));
    result.snapshot.edges.forEach((item) => expectNoDuplicateExternalRefs(item.externalRefs));
    result.snapshot.nodes.forEach((node) =>
      node.externalRefs.forEach((ref) => expectImportedRefQuality(ref, "postgres")),
    );
    result.snapshot.edges.forEach((item) =>
      item.externalRefs.forEach((ref) => expectImportedRefQuality(ref, "postgres")),
    );
    expect(findPrimaryImportedExternalRef(postsNode?.externalRefs)).toEqual(nodeExternalRef);
    expect(findPrimaryImportedExternalRef(edge?.externalRefs)).toEqual(edgeExternalRef);
  });

  it("keeps ExternalRef wrapper shape consistent between prisma file and postgres sources", () => {
    const schemaText = `
      model User {
        id String @id
      }
    `;

    const prismaFileResult = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext: {
        sourceKind: "prisma-schema-file",
        filePath: "prisma/schema.prisma",
      },
    });
    const postgresResult = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext: {
        sourceKind: "postgres-live",
        modelsByModelName: {
          User: { schema: "public", table: "users" },
        },
        relationsByRelationName: {},
      },
    });

    const prismaRef = prismaFileResult.snapshot.nodes[0]?.externalRefs[0];
    const postgresRef = postgresResult.snapshot.nodes[0]?.externalRefs[0];

    expect(Object.keys(prismaRef ?? {}).sort()).toEqual(
      Object.keys(postgresRef ?? {}).sort(),
    );
    expect(prismaRef?.locator).toHaveProperty("sourceKind", "prisma-schema-file");
    expect(postgresRef?.locator).toHaveProperty("sourceKind", "postgres-live");
  });

  it("keeps ExternalRef mapping deterministic for the same input", () => {
    const schemaText = `
      model User {
        id String @id
      }
    `;
    const externalRefContext = {
      sourceKind: "prisma-schema-file" as const,
      filePath: "prisma/schema.prisma",
    };

    const first = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext,
    });
    const second = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext,
    });

    expect(first.snapshot.nodes.map((node) => node.externalRefs)).toEqual(
      second.snapshot.nodes.map((node) => node.externalRefs),
    );
    expect(first.snapshot.edges.map((edge) => edge.externalRefs)).toEqual(
      second.snapshot.edges.map((edge) => edge.externalRefs),
    );
    first.snapshot.nodes.forEach((node) => expectNoDuplicateExternalRefs(node.externalRefs));
    second.snapshot.nodes.forEach((node) => expectNoDuplicateExternalRefs(node.externalRefs));
  });

  it("returns an identical canonical snapshot for the same input and context", () => {
    const schemaText = `
      model User {
        id    String @id
        posts Post[]
      }

      model Post {
        id       String @id
        authorId String
        author   User @relation(fields: [authorId], references: [id])
      }
    `;
    const externalRefContext = {
      sourceKind: "prisma-schema-file" as const,
      filePath: "prisma/schema.prisma",
    };

    const first = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext,
    });
    const second = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext,
    });

    expect(cloneSnapshotJson(first.snapshot)).toEqual(cloneSnapshotJson(second.snapshot));
  });

  it("produces equivalent canonical snapshot when model blocks are reordered", () => {
    const schemaTextA = `
      model User {
        id    String @id
        posts Post[]
      }

      model Post {
        id       String @id
        authorId String
        author   User @relation(fields: [authorId], references: [id])
      }
    `;
    const schemaTextB = `
      model Post {
        id       String @id
        authorId String
        author   User @relation(fields: [authorId], references: [id])
      }

      model User {
        id    String @id
        posts Post[]
      }
    `;
    const externalRefContext = {
      sourceKind: "prisma-schema-file" as const,
      filePath: "prisma/schema.prisma",
    };

    const first = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText: schemaTextA,
      externalRefContext,
    });
    const second = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText: schemaTextB,
      externalRefContext,
    });

    expect(first.summary).toEqual(second.summary);
    expect(cloneSnapshotJson(first.snapshot)).toEqual(cloneSnapshotJson(second.snapshot));
    expect(first.snapshot.nodes.map((node) => node.label)).toEqual(["Post", "User"]);
    expect(first.snapshot.edges).toHaveLength(1);
  });

  it("keeps canonical snapshot externalRefs identical for prisma file path variants", () => {
    const schemaText = `
      model User {
        id String @id
      }
    `;

    const windows = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext: {
        sourceKind: "prisma-schema-file",
        filePath: "prisma\\schema.prisma",
      },
    });
    const posix = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext: {
        sourceKind: "prisma-schema-file",
        filePath: "prisma/schema.prisma",
      },
    });

    expect(cloneSnapshotJson(windows.snapshot)).toEqual(cloneSnapshotJson(posix.snapshot));
  });

  it("imports without context keeping nodes/edges valid with externalRefs as empty arrays", () => {
    const schemaText = `
      model User {
        id    String @id
        posts Post[]
      }

      model Post {
        id       String  @id
        authorId String
        author   User    @relation(fields: [authorId], references: [id])
      }
    `;

    const result = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
    });

    expect(result.snapshot.nodes).toHaveLength(2);
    expect(result.snapshot.edges).toHaveLength(1);
    expect(result.snapshot.nodes.every((node) => Array.isArray(node.externalRefs))).toBe(true);
    expect(result.snapshot.edges.every((edge) => Array.isArray(edge.externalRefs))).toBe(true);
    expect(result.snapshot.nodes.every((node) => node.externalRefs.length === 0)).toBe(true);
    expect(result.snapshot.edges.every((edge) => edge.externalRefs.length === 0)).toBe(true);
    result.snapshot.nodes.forEach((node) =>
      expect(findPrimaryImportedExternalRef(node.externalRefs)).toBeUndefined(),
    );
    result.snapshot.edges.forEach((edge) =>
      expect(findPrimaryImportedExternalRef(edge.externalRefs)).toBeUndefined(),
    );
    expect(result.snapshot.nodes.map((node) => node.label)).toEqual(["Post", "User"]);
    expect(result.snapshot.nodes.every((node) => Array.isArray(node.data.fields))).toBe(true);
  });

  it("imports normally with empty node externalRefs when postgres provenance has no model match", () => {
    const schemaText = `
      model Users {
        id Int @id
      }
    `;

    const result = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext: {
        sourceKind: "postgres-live",
        modelsByModelName: {},
        relationsByRelationName: {},
      },
    });

    expect(result.snapshot.nodes).toHaveLength(1);
    expect(result.snapshot.edges).toHaveLength(0);
    expect(result.snapshot.nodes[0]?.label).toBe("Users");
    expect(result.snapshot.nodes[0]?.externalRefs).toEqual([]);
    expect(findPrimaryImportedExternalRef(result.snapshot.nodes[0]?.externalRefs)).toBeUndefined();
  });

  it("imports normally with empty edge externalRefs when postgres provenance has no relation match", () => {
    const schemaText = `
      model Users {
        id Int @id
        posts Posts[] @relation("fk_public_posts_posts_author_id_fkey")
      }

      model Posts {
        id        Int   @id
        author_id Int
        author    Users @relation("fk_public_posts_posts_author_id_fkey", fields: [author_id], references: [id])
      }
    `;

    const result = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext: {
        sourceKind: "postgres-live",
        modelsByModelName: {
          Users: { schema: "public", table: "users" },
          Posts: { schema: "public", table: "posts" },
        },
        relationsByRelationName: {},
      },
    });

    expect(result.snapshot.nodes).toHaveLength(2);
    expect(result.snapshot.edges).toHaveLength(1);
    expect(result.snapshot.edges[0]?.externalRefs).toEqual([]);
    expect(result.snapshot.nodes.every((node) => node.externalRefs.length === 1)).toBe(true);
    expect(findPrimaryImportedExternalRef(result.snapshot.edges[0]?.externalRefs)).toBeUndefined();
  });

  it("imports normally when postgres provenance matches edge but not nodes", () => {
    const schemaText = `
      model Users {
        id Int @id
        posts Posts[] @relation("fk_public_posts_posts_author_id_fkey")
      }

      model Posts {
        id        Int   @id
        author_id Int
        author    Users @relation("fk_public_posts_posts_author_id_fkey", fields: [author_id], references: [id])
      }
    `;

    const result = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext: {
        sourceKind: "postgres-live",
        modelsByModelName: {},
        relationsByRelationName: {
          fk_public_posts_posts_author_id_fkey: {
            schema: "public",
            table: "posts",
            column: "author_id",
            constraint: "posts_author_id_fkey",
          },
        },
      },
    });

    expect(result.snapshot.nodes).toHaveLength(2);
    expect(result.snapshot.edges).toHaveLength(1);
    expect(result.snapshot.nodes.every((node) => node.externalRefs.length === 0)).toBe(true);
    expect(result.snapshot.edges[0]?.externalRefs).toHaveLength(1);
    expectImportedRefQuality(result.snapshot.edges[0]?.externalRefs[0], "postgres");
  });

  it("keeps canonical edge data shape for named and unnamed relations", () => {
    const schemaText = `
      model User {
        id    String @id
        posts Post[]
      }

      model Post {
        id       String @id
        authorId String
        author   User @relation(fields: [authorId], references: [id])
      }

      model Workspace {
        id      String @id
        members Member[] @relation("WorkspaceMembers")
      }

      model Member {
        id          String @id
        workspaceId String
        workspace   Workspace @relation("WorkspaceMembers", fields: [workspaceId], references: [id])
      }
    `;

    const result = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext: {
        sourceKind: "prisma-schema-file",
        filePath: "prisma/schema.prisma",
      },
    });

    expect(result.snapshot.edges).toHaveLength(2);
    const unnamedEdge = result.snapshot.edges.find(
      (edge) => edge.data.sourceFieldName === "author",
    );
    const namedEdge = result.snapshot.edges.find(
      (edge) => edge.data.sourceFieldName === "workspace",
    );

    expect(unnamedEdge).toBeTruthy();
    expect(namedEdge).toBeTruthy();
    expect(unnamedEdge?.data).not.toHaveProperty("relationName");
    expect(namedEdge?.data).toMatchObject({
      relationName: "WorkspaceMembers",
    });
    expect(result.snapshot.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(result.snapshot.nodes.every((node) => Array.isArray(node.externalRefs))).toBe(true);
    expect(result.snapshot.edges.every((edge) => Array.isArray(edge.externalRefs))).toBe(true);
    result.snapshot.edges.forEach((edge) => {
      expect(edge.data).toMatchObject({
        source: "prisma-schema",
      });
      expect(edge.data).toHaveProperty("sourceFieldName");
      expect(edge.data).toHaveProperty("cardinality");
      expect(Object.values(edge.data).some((value) => typeof value === "undefined")).toBe(
        false,
      );
    });
  });
});
