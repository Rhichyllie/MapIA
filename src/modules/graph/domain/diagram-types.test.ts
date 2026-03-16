import { describe, expect, it } from "vitest";
import {
  applyDiagramLayoutToSnapshot,
  computeDiagramLayoutPositions,
  reapplyLayoutForSnapshot,
} from "./diagram-types";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";

const nodes = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
].map((id, index) => ({
  id,
  projectId,
  kind: "entity" as const,
  label: `Node ${index + 1}`,
  position: { x: 0, y: 0 },
  data: {},
  externalRefs: [],
}));

const edges = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    projectId,
    sourceNodeId: nodes[0].id,
    targetNodeId: nodes[1].id,
    kind: "flows-to" as const,
    data: {},
    externalRefs: [],
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    projectId,
    sourceNodeId: nodes[0].id,
    targetNodeId: nodes[2].id,
    kind: "flows-to" as const,
    data: {},
    externalRefs: [],
  },
  {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    projectId,
    sourceNodeId: nodes[2].id,
    targetNodeId: nodes[3].id,
    kind: "flows-to" as const,
    data: {},
    externalRefs: [],
  },
];

describe("diagram layout engine", () => {
  it("is deterministic for the same input", () => {
    const first = computeDiagramLayoutPositions({
      nodes,
      edges,
      diagramType: "flow",
      options: {
        nodeSpacingX: 320,
        nodeSpacingY: 140,
      },
    });

    const second = computeDiagramLayoutPositions({
      nodes,
      edges,
      diagramType: "flow",
      options: {
        nodeSpacingX: 320,
        nodeSpacingY: 140,
      },
    });

    expect(second).toEqual(first);
  });

  it("keeps children below the parent for tree top-down", () => {
    const positions = computeDiagramLayoutPositions({
      nodes,
      edges,
      diagramType: "tree",
      options: { direction: "top-down", nodeSpacingX: 200, nodeSpacingY: 120 },
    });

    expect(positions[nodes[0].id]?.y).toBe(0);
    expect(positions[nodes[1].id]?.y).toBeGreaterThan(
      positions[nodes[0].id]?.y ?? 0,
    );
    expect(positions[nodes[2].id]?.y).toBeGreaterThan(
      positions[nodes[0].id]?.y ?? 0,
    );
  });

  it("keeps children to the right of the parent for tree left-right", () => {
    const positions = computeDiagramLayoutPositions({
      nodes,
      edges,
      diagramType: "tree",
      options: { direction: "left-right", nodeSpacingX: 220, nodeSpacingY: 120 },
    });

    expect(positions[nodes[0].id]?.x).toBe(0);
    expect(positions[nodes[1].id]?.x).toBeGreaterThan(
      positions[nodes[0].id]?.x ?? 0,
    );
  });

  it("keeps flow levels in increasing x positions", () => {
    const positions = computeDiagramLayoutPositions({
      nodes,
      edges,
      diagramType: "flow",
      options: { nodeSpacingX: 260, nodeSpacingY: 140 },
    });

    expect(positions[nodes[0].id]?.x).toBe(0);
    expect(positions[nodes[1].id]?.x).toBeGreaterThan(
      positions[nodes[0].id]?.x ?? 0,
    );
    expect(positions[nodes[3].id]?.x).toBeGreaterThan(
      positions[nodes[2].id]?.x ?? 0,
    );
  });

  it("supports top-down flow direction", () => {
    const positions = computeDiagramLayoutPositions({
      nodes,
      edges,
      diagramType: "flow",
      options: { direction: "top-down", nodeSpacingX: 260, nodeSpacingY: 140 },
    });

    expect(positions[nodes[0].id]?.y).toBe(0);
    expect(positions[nodes[1].id]?.y).toBeGreaterThan(
      positions[nodes[0].id]?.y ?? 0,
    );
    expect(positions[nodes[3].id]?.y).toBeGreaterThan(
      positions[nodes[2].id]?.y ?? 0,
    );
  });

  it("keeps mindmap root at (0,0) with children away from center", () => {
    const positions = computeDiagramLayoutPositions({
      nodes,
      edges,
      diagramType: "mindmap",
      options: { radialSpacing: 200 },
    });

    const root = positions[nodes[0].id];
    expect(root).toEqual({ x: 0, y: 0 });

    const firstChild = positions[nodes[1].id];
    const radius = Math.hypot(firstChild.x, firstChild.y);
    expect(radius).toBeGreaterThan(0);
  });

  it("reapplies layout for supported types and preserves legacy snapshots", () => {
    const supported = applyDiagramLayoutToSnapshot(
      {
        nodes,
        edges,
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      "flow",
      { nodeSpacingX: 320, nodeSpacingY: 140 },
    );

    expect(supported.diagramType).toBe("flow");
    expect(supported.layoutOptions).toMatchObject({
      type: "flow",
      nodeSpacingX: 320,
    });
    expect(supported.nodes.every((node) => Number.isFinite(node.position.x))).toBe(
      true,
    );

    const legacy = reapplyLayoutForSnapshot({
      nodes,
      edges,
      viewport: { x: 0, y: 0, zoom: 1 },
      diagramType: "graph",
      layoutOptions: { legacy: true },
    });

    expect(legacy.diagramType).toBe("graph");
    expect(legacy.layoutOptions).toEqual({ legacy: true });
    expect(legacy.nodes).toEqual(nodes);
  });
});
