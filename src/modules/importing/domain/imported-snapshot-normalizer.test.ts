import { describe, expect, it } from "vitest";
import { GraphSnapshotSchema } from "@/src/domain";
import {
  normalizeImportedEdgeCanonical,
  normalizeImportedNodeCanonical,
  normalizeImportedSnapshotCanonical,
} from "./imported-snapshot-normalizer";

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

describe("imported-snapshot-normalizer", () => {
  it("normalizes imported snapshot ordering and removes undefined edge data keys", () => {
    const snapshot = GraphSnapshotSchema.parse({
      nodes: [
        {
          id: "3b916116-49e1-4ced-8962-edf93a1a8f94",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          kind: "entity",
          label: "Zeta",
          position: { x: 0, y: 0 },
          data: {
            source: "prisma-schema",
            modelName: "Zeta",
          },
          externalRefs: [
            {
              id: "f92ef928-0acc-4f5d-bd99-f1a46f724b38",
              system: "prisma",
              externalId: "import:prisma-schema-file?b=2",
              locator: { sourceKind: "prisma-schema-file", filePath: "prisma/schema.prisma" },
              metadata: {},
            },
            {
              id: "0dd966ef-213f-49df-a1d4-31ebd7f1b717",
              system: "prisma",
              externalId: "import:prisma-schema-file?a=1",
              locator: { sourceKind: "prisma-schema-file", filePath: "prisma/schema.prisma" },
              metadata: {},
            },
          ],
        },
        {
          id: "0d5f3efa-0a54-49b2-86d0-c1c6a5a2e29f",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          kind: "entity",
          label: "Alpha",
          position: { x: 0, y: 0 },
          data: {
            source: "prisma-schema",
            modelName: "Alpha",
            fields: [
              {
                name: "id",
                type: "String",
                isOptional: false,
                isList: false,
                isId: true,
                isUnique: false,
                ignored: undefined,
              },
            ],
          },
          externalRefs: [],
        },
      ],
      edges: [
        {
          id: "9fb856cb-7c0f-49d7-a7bb-6f18311484fc",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          sourceNodeId: "3b916116-49e1-4ced-8962-edf93a1a8f94",
          targetNodeId: "0d5f3efa-0a54-49b2-86d0-c1c6a5a2e29f",
          kind: "references",
          label: "alpha",
          data: {
            source: "prisma-schema",
            relationName: undefined,
            sourceFieldName: "alpha",
            isList: false,
            isOptional: true,
          },
          externalRefs: [],
        },
      ],
      viewport: { x: 1, y: 2, zoom: 1 },
    });

    const normalized = normalizeImportedSnapshotCanonical(snapshot);

    expect(normalized.nodes.map((node) => node.label)).toEqual(["Alpha", "Zeta"]);
    expect(normalized.nodes[1]?.data).toMatchObject({
      source: "prisma-schema",
      modelName: "Zeta",
      fields: [],
    });
    expect((normalized.nodes[0]?.data.fields as Array<Record<string, unknown>>)[0]).not.toHaveProperty(
      "ignored",
    );
    expect(normalized.nodes[1]?.externalRefs.map((ref) => ref.externalId)).toEqual([
      "import:prisma-schema-file?a=1",
      "import:prisma-schema-file?b=2",
    ]);
    expect(normalized.edges).toHaveLength(1);
    expect(normalized.edges[0]?.data).not.toHaveProperty("relationName");
  });

  it("preserves field and externalRef order when already canonical", () => {
    const node = GraphSnapshotSchema.parse({
      nodes: [
        {
          id: "8f0f4805-5f98-471c-a074-67c196419b15",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          kind: "entity",
          label: "User",
          position: { x: 10, y: 20 },
          data: {
            source: "prisma-schema",
            fields: [
              { name: "id", type: "String", isOptional: false, isList: false, isId: true, isUnique: false },
              { name: "email", type: "String", isOptional: false, isList: false, isId: false, isUnique: true },
            ],
          },
          externalRefs: [
            {
              id: "3f89df65-4418-4c5e-a0f1-8f11944295b0",
              system: "prisma",
              externalId: "import:prisma-schema-file?a=1",
              locator: { sourceKind: "prisma-schema-file", filePath: "prisma/schema.prisma" },
              metadata: {},
            },
          ],
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }).nodes[0]!;

    const normalizedNode = normalizeImportedNodeCanonical(node);

    expect(
      ((normalizedNode.data.fields as Array<Record<string, unknown>>) ?? []).map(
        (field) => field.name,
      ),
    ).toEqual(["id", "email"]);
    expect(normalizedNode.externalRefs.map((ref) => ref.externalId)).toEqual([
      "import:prisma-schema-file?a=1",
    ]);
  });

  it("normalizes edge data and externalRefs with predictable defaults", () => {
    const edge = GraphSnapshotSchema.parse({
      nodes: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          kind: "entity",
          label: "A",
          position: { x: 0, y: 0 },
          data: {},
          externalRefs: [],
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          kind: "entity",
          label: "B",
          position: { x: 0, y: 0 },
          data: {},
          externalRefs: [],
        },
      ],
      edges: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          sourceNodeId: "11111111-1111-4111-8111-111111111111",
          targetNodeId: "22222222-2222-4222-8222-222222222222",
          kind: "references",
          label: "owns",
          data: {
            source: "prisma-schema",
            relationName: undefined,
            sourceFieldName: "owns",
            isList: true,
            isOptional: false,
          },
          externalRefs: [
            {
              id: "55555555-5555-4555-8555-555555555555",
              system: "postgres",
              externalId: "import:postgres-live?b=2",
              locator: { sourceKind: "postgres-live", schema: "public", table: "b" },
              metadata: {},
            },
            {
              id: "44444444-4444-4444-8444-444444444444",
              system: "postgres",
              externalId: "import:postgres-live?a=1",
              locator: { sourceKind: "postgres-live", schema: "public", table: "a" },
              metadata: {},
            },
          ],
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    }).edges[0]!;

    const normalizedEdge = normalizeImportedEdgeCanonical(edge);

    expect(normalizedEdge.externalRefs.map((ref) => ref.externalId)).toEqual([
      "import:postgres-live?a=1",
      "import:postgres-live?b=2",
    ]);
    expect(normalizedEdge.data).toMatchObject({
      source: "prisma-schema",
      sourceFieldName: "owns",
      isList: true,
      isOptional: false,
    });
    expect(normalizedEdge.data).not.toHaveProperty("relationName");
  });

  it("is idempotent for snapshot normalization", () => {
    const snapshot = GraphSnapshotSchema.parse({
      nodes: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          kind: "entity",
          label: "Same",
          position: { x: 1, y: 2 },
          data: {
            source: "prisma-schema",
            fields: [{ name: "id", type: "String", isOptional: false, isList: false, isId: true, isUnique: false }],
          },
          externalRefs: [
            {
              id: "bbbbbbbb-bbbb-4bbb-8bbb-cccccccccccc",
              system: "prisma",
              externalId: "import:prisma-schema-file?b=2",
              locator: { sourceKind: "prisma-schema-file", filePath: "prisma/schema.prisma" },
              metadata: {},
            },
            {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              system: "prisma",
              externalId: "import:prisma-schema-file?a=1",
              locator: { sourceKind: "prisma-schema-file", filePath: "prisma/schema.prisma" },
              metadata: {},
            },
          ],
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          kind: "entity",
          label: "Same",
          position: { x: 3, y: 4 },
          data: { source: "prisma-schema" },
          externalRefs: [],
        },
      ],
      edges: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-dddddddddddd",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          sourceNodeId: "aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb",
          targetNodeId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          kind: "references",
          label: "same",
          data: {
            source: "prisma-schema",
            relationName: undefined,
            sourceFieldName: "same",
            isList: false,
            isOptional: true,
          },
          externalRefs: [],
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    const once = normalizeImportedSnapshotCanonical(snapshot);
    const twice = normalizeImportedSnapshotCanonical(once);

    expect(twice).toEqual(once);
  });

  it("is idempotent for node and edge normalizers", () => {
    const parsed = GraphSnapshotSchema.parse({
      nodes: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-111111111111",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          kind: "entity",
          label: "User",
          position: { x: 0, y: 0 },
          data: {
            source: "prisma-schema",
            fields: [{ name: "id", type: "String", isOptional: false, isList: false, isId: true, isUnique: false }],
          },
          externalRefs: [],
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-222222222222",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          kind: "entity",
          label: "Post",
          position: { x: 0, y: 0 },
          data: {},
          externalRefs: [],
        },
      ],
      edges: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-333333333333",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          sourceNodeId: "aaaaaaaa-aaaa-4aaa-8aaa-111111111111",
          targetNodeId: "aaaaaaaa-aaaa-4aaa-8aaa-222222222222",
          kind: "references",
          label: "posts",
          data: {
            source: "prisma-schema",
            relationName: undefined,
            sourceFieldName: "posts",
            isList: true,
            isOptional: false,
          },
          externalRefs: [],
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    const node = parsed.nodes[0]!;
    const edge = parsed.edges[0]!;

    expect(normalizeImportedNodeCanonical(normalizeImportedNodeCanonical(node))).toEqual(
      normalizeImportedNodeCanonical(node),
    );
    expect(normalizeImportedEdgeCanonical(normalizeImportedEdgeCanonical(edge))).toEqual(
      normalizeImportedEdgeCanonical(edge),
    );
  });

  it("does not mutate snapshot, node or edge inputs", () => {
    const parsed = GraphSnapshotSchema.parse({
      nodes: [
        {
          id: "3b916116-49e1-4ced-8962-edf93a1a8f94",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          kind: "entity",
          label: "Zeta",
          position: { x: 0, y: 0 },
          data: {
            source: "prisma-schema",
            fields: [
              {
                name: "id",
                type: "String",
                isOptional: false,
                isList: false,
                isId: true,
                isUnique: false,
                ignored: undefined,
              },
            ],
          },
          externalRefs: [
            {
              id: "f92ef928-0acc-4f5d-bd99-f1a46f724b38",
              system: "prisma",
              externalId: "import:prisma-schema-file?b=2",
              locator: { sourceKind: "prisma-schema-file", filePath: "prisma/schema.prisma" },
              metadata: {},
            },
            {
              id: "0dd966ef-213f-49df-a1d4-31ebd7f1b717",
              system: "prisma",
              externalId: "import:prisma-schema-file?a=1",
              locator: { sourceKind: "prisma-schema-file", filePath: "prisma/schema.prisma" },
              metadata: {},
            },
          ],
        },
        {
          id: "0d5f3efa-0a54-49b2-86d0-c1c6a5a2e29f",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          kind: "entity",
          label: "Alpha",
          position: { x: 0, y: 0 },
          data: { source: "prisma-schema" },
          externalRefs: [],
        },
      ],
      edges: [
        {
          id: "9fb856cb-7c0f-49d7-a7bb-6f18311484fc",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          sourceNodeId: "3b916116-49e1-4ced-8962-edf93a1a8f94",
          targetNodeId: "0d5f3efa-0a54-49b2-86d0-c1c6a5a2e29f",
          kind: "references",
          label: "alpha",
          data: {
            source: "prisma-schema",
            relationName: undefined,
            sourceFieldName: "alpha",
            isList: false,
            isOptional: true,
          },
          externalRefs: [],
        },
      ],
      viewport: { x: 1, y: 2, zoom: 1 },
    });
    const snapshot = parsed;
    const node = parsed.nodes[0]!;
    const edge = parsed.edges[0]!;

    const snapshotBefore = deepClone(snapshot);
    const nodeBefore = deepClone(node);
    const edgeBefore = deepClone(edge);

    normalizeImportedSnapshotCanonical(snapshot);
    normalizeImportedNodeCanonical(node);
    normalizeImportedEdgeCanonical(edge);

    expect(snapshot).toEqual(snapshotBefore);
    expect(node).toEqual(nodeBefore);
    expect(edge).toEqual(edgeBefore);
  });

  it("uses id as deterministic tie-breaker for nodes and edges", () => {
    const snapshot = GraphSnapshotSchema.parse({
      nodes: [
        {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          kind: "entity",
          label: "Same",
          position: { x: 0, y: 0 },
          data: {},
          externalRefs: [],
        },
        {
          id: "00000000-0000-4000-8000-000000000000",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          kind: "entity",
          label: "Same",
          position: { x: 0, y: 0 },
          data: {},
          externalRefs: [],
        },
      ],
      edges: [
        {
          id: "ffffffff-ffff-4fff-8fff-eeeeeeeeeeee",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          sourceNodeId: "00000000-0000-4000-8000-000000000000",
          targetNodeId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          kind: "references",
          label: "same",
          data: { source: "prisma-schema", sourceFieldName: "same", isList: false, isOptional: false },
          externalRefs: [],
        },
        {
          id: "00000000-0000-4000-8000-eeeeeeeeeeee",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          sourceNodeId: "00000000-0000-4000-8000-000000000000",
          targetNodeId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          kind: "references",
          label: "same",
          data: { source: "prisma-schema", sourceFieldName: "same", isList: false, isOptional: false },
          externalRefs: [],
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    const normalized = normalizeImportedSnapshotCanonical(snapshot);

    expect(normalized.nodes.map((node) => node.id)).toEqual([
      "00000000-0000-4000-8000-000000000000",
      "ffffffff-ffff-4fff-8fff-ffffffffffff",
    ]);
    expect(normalized.edges.map((edge) => edge.id)).toEqual([
      "00000000-0000-4000-8000-eeeeeeeeeeee",
      "ffffffff-ffff-4fff-8fff-eeeeeeeeeeee",
    ]);
  });

  it("returns a schema-safe snapshot after normalization", () => {
    const snapshot = GraphSnapshotSchema.parse({
      nodes: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-111111111111",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          kind: "entity",
          label: "Zeta",
          position: { x: 10, y: 20 },
          data: {
            source: "prisma-schema",
            fields: [
              {
                name: "id",
                type: "String",
                isOptional: false,
                isList: false,
                isId: true,
                isUnique: false,
                transient: undefined,
              },
            ],
          },
          externalRefs: [],
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-222222222222",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          kind: "entity",
          label: "Alpha",
          position: { x: 30, y: 40 },
          data: { source: "prisma-schema" },
          externalRefs: [],
        },
      ],
      edges: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-333333333333",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          sourceNodeId: "aaaaaaaa-aaaa-4aaa-8aaa-111111111111",
          targetNodeId: "aaaaaaaa-aaaa-4aaa-8aaa-222222222222",
          kind: "references",
          label: "alpha",
          data: {
            source: "prisma-schema",
            relationName: undefined,
            sourceFieldName: "alpha",
            isList: false,
            isOptional: true,
          },
          externalRefs: [],
        },
      ],
      viewport: { x: 1, y: 2, zoom: 1 },
    });

    const normalized = normalizeImportedSnapshotCanonical(snapshot);
    const reparsed = GraphSnapshotSchema.parse(normalized);

    expect(reparsed).toEqual(normalized);
    expect(reparsed.edges[0]?.data).not.toHaveProperty("relationName");
    expect(reparsed.viewport).toEqual({ x: 1, y: 2, zoom: 1 });
  });
});
