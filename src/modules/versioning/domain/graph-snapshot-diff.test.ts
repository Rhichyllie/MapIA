import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "@/src/domain";
import { computeGraphSnapshotDiff } from "./graph-snapshot-diff";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";

function createSnapshot(
  overrides: Partial<GraphSnapshot> = {},
): GraphSnapshot {
  return {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    ...overrides,
  };
}

describe("computeGraphSnapshotDiff", () => {
  it("returns no changes when snapshots are structurally equal", () => {
    const snapshot = createSnapshot({
      nodes: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          projectId,
          kind: "note",
          label: "Node A",
          position: { x: 10, y: 20 },
          data: { b: 2, a: 1 },
          externalRefs: [],
        },
      ],
      edges: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          projectId,
          sourceNodeId: "11111111-1111-4111-8111-111111111111",
          targetNodeId: "22222222-2222-4222-8222-222222222222",
          kind: "flows-to",
          label: "liga",
          data: { y: 2, x: 1 },
          externalRefs: [],
        },
      ],
    });

    const sameShapeWithDifferentKeyOrder = createSnapshot({
      nodes: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          projectId,
          kind: "note",
          label: "Node A",
          position: { y: 20, x: 10 },
          data: { a: 1, b: 2 },
          externalRefs: [],
        },
      ],
      edges: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          projectId,
          sourceNodeId: "11111111-1111-4111-8111-111111111111",
          targetNodeId: "22222222-2222-4222-8222-222222222222",
          kind: "flows-to",
          label: "liga",
          data: { x: 1, y: 2 },
          externalRefs: [],
        },
      ],
    });

    const result = computeGraphSnapshotDiff({
      baseSnapshot: snapshot,
      targetSnapshot: sameShapeWithDifferentKeyOrder,
    });

    expect(result).toEqual({
      hasChanges: false,
      nodesAdded: [],
      nodesRemoved: [],
      nodesChanged: [],
      edgesAdded: [],
      edgesRemoved: [],
      edgesChanged: [],
      viewportChanged: false,
      summary: { added: 0, removed: 0, changed: 0 },
    });
  });

  it("detects node/edge additions, removals, changes and viewport diff", () => {
    const baseSnapshot = createSnapshot({
      nodes: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          projectId,
          kind: "note",
          label: "Node A",
          position: { x: 0, y: 0 },
          data: {},
          externalRefs: [],
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          projectId,
          kind: "note",
          label: "Node B",
          position: { x: 20, y: 10 },
          data: {},
          externalRefs: [],
        },
      ],
      edges: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          projectId,
          sourceNodeId: "11111111-1111-4111-8111-111111111111",
          targetNodeId: "22222222-2222-4222-8222-222222222222",
          kind: "flows-to",
          label: "A-B",
          data: {},
          externalRefs: [],
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          projectId,
          sourceNodeId: "22222222-2222-4222-8222-222222222222",
          targetNodeId: "11111111-1111-4111-8111-111111111111",
          kind: "flows-to",
          label: "B-A",
          data: {},
          externalRefs: [],
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    const targetSnapshot = createSnapshot({
      nodes: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          projectId,
          kind: "note",
          label: "Node A (editado)",
          position: { x: 5, y: 0 },
          data: {},
          externalRefs: [],
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          projectId,
          kind: "entity",
          label: "Node C",
          position: { x: 40, y: 20 },
          data: { importance: "high" },
          externalRefs: [],
        },
      ],
      edges: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          projectId,
          sourceNodeId: "11111111-1111-4111-8111-111111111111",
          targetNodeId: "33333333-3333-4333-8333-333333333333",
          kind: "flows-to",
          label: "A-C",
          data: {},
          externalRefs: [],
        },
        {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          projectId,
          sourceNodeId: "33333333-3333-4333-8333-333333333333",
          targetNodeId: "11111111-1111-4111-8111-111111111111",
          kind: "references",
          label: "C-A",
          data: {},
          externalRefs: [],
        },
      ],
      viewport: { x: 10, y: 20, zoom: 1.2 },
    });

    const result = computeGraphSnapshotDiff({
      baseSnapshot,
      targetSnapshot,
    });

    expect(result.hasChanges).toBe(true);
    expect(result.nodesAdded).toEqual(["33333333-3333-4333-8333-333333333333"]);
    expect(result.nodesRemoved).toEqual(["22222222-2222-4222-8222-222222222222"]);
    expect(result.nodesChanged).toEqual(["11111111-1111-4111-8111-111111111111"]);
    expect(result.edgesAdded).toEqual(["cccccccc-cccc-4ccc-8ccc-cccccccccccc"]);
    expect(result.edgesRemoved).toEqual(["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]);
    expect(result.edgesChanged).toEqual(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);
    expect(result.viewportChanged).toBe(true);
    expect(result.summary).toEqual({
      added: 2,
      removed: 2,
      changed: 3,
    });
  });
});
