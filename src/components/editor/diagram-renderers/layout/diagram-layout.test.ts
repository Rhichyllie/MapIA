import { describe, expect, it } from "vitest";
import {
  computeInsertPosition,
  computeReflow,
  type DiagramLayoutEdge,
  type DiagramLayoutNode,
} from "./diagram-layout";

function createNode(
  id: string,
  input: {
    x: number;
    y: number;
    kind?: DiagramLayoutNode["kind"];
  },
): DiagramLayoutNode {
  return {
    id,
    kind: input.kind ?? "note",
    position: {
      x: input.x,
      y: input.y,
    },
  };
}

function createEdge(
  id: string,
  input: {
    source: string;
    target: string;
    kind: DiagramLayoutEdge["kind"];
  },
): DiagramLayoutEdge {
  return {
    id,
    sourceNodeId: input.source,
    targetNodeId: input.target,
    kind: input.kind,
  };
}

describe("diagram layout engine", () => {
  it("computes insert position for tree below the selected node", () => {
    const reference = createNode("root", { x: 140, y: 90, kind: "page" });
    const position = computeInsertPosition(
      "tree",
      reference,
      [reference],
      { x: 0, y: 0, zoom: 1, width: 1200, height: 700 },
    );

    expect(position.x).toBe(140);
    expect(position.y).toBeGreaterThan(reference.position.y);
  });

  it("computes insert position for flow to the right", () => {
    const reference = createNode("step", { x: 80, y: -20, kind: "flow-step" });
    const position = computeInsertPosition(
      "flow",
      reference,
      [reference],
      { x: 0, y: 0, zoom: 1 },
    );

    expect(position.x).toBe(360);
    expect(position.y).toBe(-20);
  });

  it("computes insert position for mindmap in free radial angle", () => {
    const root = createNode("root", { x: 0, y: 0, kind: "note" });
    const branch = createNode("branch", { x: 260, y: 0, kind: "note" });
    const position = computeInsertPosition(
      "mindmap",
      root,
      [root, branch],
      { x: 0, y: 0, zoom: 1 },
    );

    const distanceFromRoot = Math.hypot(position.x - root.position.x, position.y - root.position.y);
    expect(distanceFromRoot).toBeGreaterThan(200);
    expect(distanceFromRoot).toBeLessThan(320);
  });

  it("computes insert position for erd avoiding immediate collision", () => {
    const reference = createNode("table_a", { x: 0, y: 0, kind: "entity" });
    const collidingSlot = createNode("table_b", { x: 340, y: 0, kind: "entity" });
    const position = computeInsertPosition(
      "erd",
      reference,
      [reference, collidingSlot],
      { x: 0, y: 0, zoom: 1 },
    );

    expect(position.x).toBeGreaterThanOrEqual(340);
    expect(position.y).not.toBe(0);
  });

  it("uses viewport center fallback when there is no reference node", () => {
    const position = computeInsertPosition(
      "flow",
      null,
      [],
      { x: -180, y: -100, zoom: 1, width: 900, height: 500 },
    );

    expect(position).toEqual({
      x: 630,
      y: 350,
    });
  });

  it("computes tree reflow in top-down levels", () => {
    const nodes = [
      createNode("root", { x: 600, y: 450, kind: "page" }),
      createNode("child_a", { x: -200, y: 20, kind: "page" }),
      createNode("child_b", { x: 900, y: -120, kind: "page" }),
    ];
    const edges = [
      createEdge("e1", { source: "root", target: "child_a", kind: "contains" }),
      createEdge("e2", { source: "root", target: "child_b", kind: "contains" }),
    ];

    const positions = computeReflow("tree", nodes, edges, "root");

    expect(positions.root.y).toBe(0);
    expect(positions.child_a.y).toBe(220);
    expect(positions.child_b.y).toBe(220);
  });

  it("computes flow reflow left-right", () => {
    const nodes = [
      createNode("a", { x: 0, y: 0, kind: "flow-step" }),
      createNode("b", { x: 0, y: 0, kind: "flow-step" }),
      createNode("c", { x: 0, y: 0, kind: "flow-step" }),
    ];
    const edges = [
      createEdge("e1", { source: "a", target: "b", kind: "flows-to" }),
      createEdge("e2", { source: "b", target: "c", kind: "flows-to" }),
    ];

    const positions = computeReflow("flow", nodes, edges);

    expect(positions.a.x).toBeLessThan(positions.b.x);
    expect(positions.b.x).toBeLessThan(positions.c.x);
  });

  it("computes mindmap reflow with root in center", () => {
    const nodes = [
      createNode("root", { x: 0, y: 0, kind: "note" }),
      createNode("sat_1", { x: 500, y: 500, kind: "note" }),
      createNode("sat_2", { x: -500, y: -500, kind: "note" }),
    ];
    const edges = [
      createEdge("e1", { source: "root", target: "sat_1", kind: "relates-to" }),
      createEdge("e2", { source: "root", target: "sat_2", kind: "references" }),
    ];

    const positions = computeReflow("mindmap", nodes, edges, "root");

    expect(positions.root).toEqual({ x: 0, y: 0 });
    expect(Math.hypot(positions.sat_1.x, positions.sat_1.y)).toBeGreaterThan(180);
    expect(Math.hypot(positions.sat_2.x, positions.sat_2.y)).toBeGreaterThan(180);
  });

  it("computes erd reflow in deterministic grid", () => {
    const nodes = [
      createNode("users", { x: 12, y: 300, kind: "entity" }),
      createNode("posts", { x: -40, y: -80, kind: "entity" }),
      createNode("comments", { x: 400, y: 80, kind: "entity" }),
      createNode("tags", { x: 740, y: 150, kind: "entity" }),
    ];

    const positions = computeReflow("erd", nodes, []);

    const values = Object.values(positions);
    expect(values.length).toBe(4);
    expect(new Set(values.map((position) => `${position.x}:${position.y}`)).size).toBe(4);
  });
});
