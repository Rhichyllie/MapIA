import { describe, expect, it } from "vitest";
import { validateGraphSnapshotInvariants } from "./graph-invariants";

function createBaseSnapshot() {
  return {
    nodes: [
      {
        id: "8f0f4805-5f98-471c-a074-67c196419b15",
        projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        kind: "entity" as const,
        label: " User ",
        position: { x: 10, y: 20 },
        data: {},
        externalRefs: [],
      },
      {
        id: "64c948e5-da1a-4c7f-9351-678f013720f9",
        projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        kind: "page" as const,
        label: "Profile",
        position: { x: 40, y: 60 },
        data: {},
        externalRefs: [],
      },
    ],
    edges: [
      {
        id: "0dc56b95-fd65-48b7-bb8d-7402c0dd92e2",
        projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        sourceNodeId: "8f0f4805-5f98-471c-a074-67c196419b15",
        targetNodeId: "64c948e5-da1a-4c7f-9351-678f013720f9",
        kind: "references" as const,
        label: " owns ",
        data: {},
        externalRefs: [],
      },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

describe("validateGraphSnapshotInvariants", () => {
  it("normalizes labels and returns valid snapshot", () => {
    const snapshot = validateGraphSnapshotInvariants(createBaseSnapshot());

    expect(snapshot.nodes[0].label).toBe("User");
    expect(snapshot.edges[0].label).toBe("owns");
  });

  it("rejects orphan edges", () => {
    const base = createBaseSnapshot();
    base.edges[0].targetNodeId = "4373ec49-cb5e-4fea-a66d-c0bb4bed8fa0";

    expect(() => validateGraphSnapshotInvariants(base)).toThrow(
      /source\/target deve existir/i,
    );
  });

  it("rejects duplicate node ids", () => {
    const base = createBaseSnapshot();
    base.nodes.push({
      ...base.nodes[0],
      label: "Duplicado",
    });

    expect(() => validateGraphSnapshotInvariants(base)).toThrow(/Node ID duplicado/i);
  });

  it("rejects duplicate edge ids", () => {
    const base = createBaseSnapshot();
    base.edges.push({
      ...base.edges[0],
      sourceNodeId: "64c948e5-da1a-4c7f-9351-678f013720f9",
      targetNodeId: "8f0f4805-5f98-471c-a074-67c196419b15",
      label: "reverse",
    });

    expect(() => validateGraphSnapshotInvariants(base)).toThrow(/Edge ID duplicado/i);
  });

  it("rejects non-finite node positions", () => {
    const base = createBaseSnapshot();
    base.nodes[0].position.x = Number.POSITIVE_INFINITY;

    expect(() => validateGraphSnapshotInvariants(base)).toThrow(/numeros finitos/i);
  });

  it("rejects empty edge endpoints", () => {
    const base = createBaseSnapshot() as typeof createBaseSnapshot extends () => infer T
      ? T
      : never;

    (base.edges[0] as { sourceNodeId: string }).sourceNodeId = "";

    expect(() => validateGraphSnapshotInvariants(base)).toThrow(
      /source e target/i,
    );
  });

  it("rejects duplicate exact edges", () => {
    const base = createBaseSnapshot();
    base.edges.push({
      ...base.edges[0],
      id: "95f36fef-1b8e-4ceb-b35f-6779f2857496",
      label: "dup",
    });

    expect(() => validateGraphSnapshotInvariants(base)).toThrow(
      /Edge duplicada/i,
    );
  });

  it("normalizes supported diagram layout metadata", () => {
    const base = createBaseSnapshot();
    const snapshot = validateGraphSnapshotInvariants({
      ...base,
      diagramType: "tree",
      layoutOptions: {
        type: "tree",
        direction: "left-right",
        nodeSpacingX: 300,
        nodeSpacingY: 180,
      },
    });

    expect(snapshot.diagramType).toBe("tree");
    expect(snapshot.layoutOptions).toMatchObject({
      type: "tree",
      direction: "left-right",
      nodeSpacingX: 300,
      nodeSpacingY: 180,
    });
  });

  it("accepts and normalizes creation assistant layout policy metadata", () => {
    const base = createBaseSnapshot();
    const snapshot = validateGraphSnapshotInvariants({
      ...base,
      rootNodeName: "  Arquitetura Geral  ",
      allowReapplyLayout: false,
    });

    expect(snapshot.rootNodeName).toBe("Arquitetura Geral");
    expect(snapshot.allowReapplyLayout).toBe(false);
  });
});
