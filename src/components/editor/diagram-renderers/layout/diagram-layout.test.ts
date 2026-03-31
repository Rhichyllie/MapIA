import { describe, expect, it } from "vitest";
import {
  computeFlowContextualNudgePositions,
  computeInsertPosition,
  computeReflow,
  type DiagramLayoutEdge,
  type DiagramLayoutNode,
} from "./diagram-layout";
import { resolveFlowLogicalFootprint } from "./diagram-layout-flow-types";

const FLOW_NOTE_DRIFT_LIMIT = 260;

function createNode(
  id: string,
  input: {
    x: number;
    y: number;
    kind?: DiagramLayoutNode["kind"];
    diagramRole?: DiagramLayoutNode["diagramRole"];
  },
): DiagramLayoutNode {
  return {
    id,
    kind: input.kind ?? "note",
    ...(input.diagramRole ? { diagramRole: input.diagramRole } : {}),
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
    const position = computeInsertPosition("tree", reference, [reference], {
      x: 0,
      y: 0,
      zoom: 1,
      width: 1200,
      height: 700,
    });

    expect(position.x).toBe(140);
    expect(position.y).toBeGreaterThan(reference.position.y);
  });

  it("computes insert position for flow to the right", () => {
    const reference = createNode("step", { x: 80, y: -20, kind: "flow-step" });
    const position = computeInsertPosition("flow", reference, [reference], {
      x: 0,
      y: 0,
      zoom: 1,
    });

    expect(position.x).toBe(562);
    expect(position.y).toBe(-20);
  });

  it("computes insert position for top-down flow below the selected node", () => {
    const reference = createNode("step", { x: 80, y: -20, kind: "flow-step" });
    const position = computeInsertPosition(
      "flow",
      reference,
      [reference],
      { x: 0, y: 0, zoom: 1 },
      { direction: "top-down" },
    );

    expect(position.x).toBe(80);
    expect(position.y).toBe(338);
  });

  it("reserves larger logical footprints for richer process content", () => {
    const stepFootprint = resolveFlowLogicalFootprint({
      direction: "left-right",
      variant: "flow-step",
    });
    const decisionFootprint = resolveFlowLogicalFootprint({
      direction: "left-right",
      variant: "flow-decision",
    });
    const endFootprint = resolveFlowLogicalFootprint({
      direction: "left-right",
      variant: "flow-end",
    });

    expect(stepFootprint).toEqual({
      primarySpan: 372,
      secondarySpan: 248,
      paddingPrimary: 96,
      paddingSecondary: 104,
    });
    expect(decisionFootprint.secondarySpan).toBe(420);
    expect(decisionFootprint.paddingSecondary).toBeGreaterThan(
      stepFootprint.paddingSecondary,
    );
    expect(endFootprint.secondarySpan).toBe(210);
  });

  it("aligns flow insert slots with the inserted node footprint", () => {
    const reference = createNode("step", { x: 80, y: -20, kind: "flow-step" });
    const stepPosition = computeInsertPosition(
      "flow",
      reference,
      [reference],
      { x: 0, y: 0, zoom: 1 },
      {
        direction: "top-down",
        insertMode: "flow-next-step",
        insertNodeKind: "flow-step",
        insertDiagramRole: "flow-step",
      },
    );
    const endPosition = computeInsertPosition(
      "flow",
      reference,
      [reference],
      { x: 0, y: 0, zoom: 1 },
      {
        direction: "top-down",
        insertMode: "flow-next-step",
        insertNodeKind: "flow-step",
        insertDiagramRole: "flow-end",
      },
    );
    const decisionPosition = computeInsertPosition(
      "flow",
      reference,
      [reference],
      { x: 0, y: 0, zoom: 1 },
      {
        direction: "top-down",
        insertMode: "flow-next-step",
        insertNodeKind: "flow-step",
        insertDiagramRole: "flow-decision",
      },
    );

    expect(stepPosition.y).toBe(338);
    expect(endPosition.x).toBeGreaterThan(stepPosition.x);
    expect(decisionPosition.y).toBeGreaterThan(stepPosition.y);
    expect(decisionPosition.x).toBeGreaterThanOrEqual(stepPosition.x);
  });

  it("computes insert position for flow branch with stronger secondary spacing", () => {
    const reference = createNode("step", { x: 120, y: 40, kind: "flow-step" });
    const position = computeInsertPosition(
      "flow",
      reference,
      [reference],
      { x: 0, y: 0, zoom: 1 },
      { insertMode: "flow-branch" },
    );

    expect(position.x).toBeGreaterThan(reference.position.x + 200);
    expect(position.y).toBeGreaterThan(reference.position.y + 240);
  });

  it("computes insert position for flow note above the main trunk", () => {
    const reference = createNode("step", { x: 120, y: 40, kind: "flow-step" });
    const position = computeInsertPosition(
      "flow",
      reference,
      [reference],
      { x: 0, y: 0, zoom: 1 },
      { insertMode: "flow-note" },
    );

    expect(position.x).toBeGreaterThan(reference.position.x + 100);
    expect(position.y).toBeLessThan(reference.position.y - 180);
  });

  it("avoids spawning a flow next step in an already occupied slot", () => {
    const reference = createNode("step", { x: 80, y: -20, kind: "flow-step" });
    const occupied = createNode("occupied", {
      x: 456,
      y: -20,
      kind: "flow-step",
    });
    const position = computeInsertPosition(
      "flow",
      reference,
      [reference, occupied],
      { x: 0, y: 0, zoom: 1 },
    );

    expect(position.x).toBeGreaterThan(occupied.position.x);
    expect(position.y).toBe(reference.position.y);
  });

  it("avoids visually tight flow slots even when centers are not identical", () => {
    const reference = createNode("step", { x: 80, y: -20, kind: "flow-step" });
    const visuallyTight = createNode("tight", {
      x: 430,
      y: 10,
      kind: "flow-step",
    });
    const position = computeInsertPosition(
      "flow",
      reference,
      [reference, visuallyTight],
      { x: 0, y: 0, zoom: 1 },
    );

    expect(position.x).toBeGreaterThan(visuallyTight.position.x + 300);
    expect(position.y).toBe(reference.position.y);
  });

  it("keeps flow insert slot deterministic when node order changes", () => {
    const reference = createNode("step", { x: 80, y: -20, kind: "flow-step" });
    const visuallyTight = createNode("tight", {
      x: 430,
      y: 10,
      kind: "flow-step",
    });
    const blocker = createNode("blocker", {
      x: 806,
      y: -18,
      kind: "flow-step",
    });

    const firstPosition = computeInsertPosition(
      "flow",
      reference,
      [reference, visuallyTight, blocker],
      { x: 0, y: 0, zoom: 1 },
    );
    const secondPosition = computeInsertPosition(
      "flow",
      reference,
      [blocker, visuallyTight, reference],
      { x: 0, y: 0, zoom: 1 },
    );

    expect(secondPosition).toEqual(firstPosition);
  });

  it("keeps flow contextual next-step nudge local to the downstream group", () => {
    const nodes = [
      createNode("start", {
        x: 0,
        y: 0,
        kind: "flow-step",
        diagramRole: "flow-start",
      }),
      createNode("step", {
        x: 360,
        y: 0,
        kind: "flow-step",
        diagramRole: "flow-step",
      }),
      createNode("inserted", {
        x: 736,
        y: 0,
        kind: "flow-step",
        diagramRole: "flow-step",
      }),
      createNode("end", {
        x: 760,
        y: 0,
        kind: "flow-step",
        diagramRole: "flow-end",
      }),
      createNode("branch", {
        x: 420,
        y: 340,
        kind: "flow-step",
        diagramRole: "flow-decision",
      }),
      createNode("end_note", {
        x: 780,
        y: -240,
        kind: "note",
        diagramRole: "flow-note",
      }),
    ];
    const edges = [
      createEdge("e1", { source: "start", target: "step", kind: "flows-to" }),
      createEdge("e2", {
        source: "step",
        target: "branch",
        kind: "depends-on",
      }),
      createEdge("e3", {
        source: "end_note",
        target: "end",
        kind: "references",
      }),
    ];

    const nextPositions = computeFlowContextualNudgePositions({
      nodes,
      edges,
      anchorNodeId: "step",
      insertedNodeId: "inserted",
      insertMode: "flow-next-step",
    });

    expect(Object.keys(nextPositions).sort()).toEqual(["end", "end_note"]);
    expect(nextPositions.end?.x).toBeGreaterThan(1_000);
    expect(nextPositions.end?.y).toBe(0);
    expect(nextPositions.end_note?.x).toBeGreaterThan(1_000);
    expect(nextPositions.end_note?.y).toBe(-240);
    expect(nextPositions.end_note?.x - nextPositions.end!.x).toBeCloseTo(20, 5);
    expect(nextPositions.branch).toBeUndefined();
    expect(nextPositions.step).toBeUndefined();
    expect(nextPositions.start).toBeUndefined();
  });

  it("computes insert position for mindmap in free radial angle", () => {
    const root = createNode("root", { x: 0, y: 0, kind: "note" });
    const branch = createNode("branch", { x: 260, y: 0, kind: "note" });
    const position = computeInsertPosition("mindmap", root, [root, branch], {
      x: 0,
      y: 0,
      zoom: 1,
    });

    const distanceFromRoot = Math.hypot(
      position.x - root.position.x,
      position.y - root.position.y,
    );
    expect(distanceFromRoot).toBeGreaterThan(200);
    expect(distanceFromRoot).toBeLessThan(320);
  });

  it("computes insert position for erd avoiding immediate collision", () => {
    const reference = createNode("table_a", { x: 0, y: 0, kind: "entity" });
    const collidingSlot = createNode("table_b", {
      x: 340,
      y: 0,
      kind: "entity",
    });
    const position = computeInsertPosition(
      "erd",
      reference,
      [reference, collidingSlot],
      { x: 0, y: 0, zoom: 1 },
    );

    expect(position.x).toBeGreaterThanOrEqual(340);
    expect(position.y).not.toBe(0);
  });

  it("computes insert position for graph around selected node instead of linear offset", () => {
    const core = createNode("core", { x: 0, y: 0, kind: "note" });
    const existing = createNode("existing", { x: 220, y: 0, kind: "note" });
    const position = computeInsertPosition("graph", core, [core, existing], {
      x: 0,
      y: 0,
      zoom: 1,
    });

    expect(
      Math.hypot(position.x - core.position.x, position.y - core.position.y),
    ).toBeGreaterThan(160);
    expect(position).not.toEqual({ x: 220, y: 64 });
  });

  it("uses viewport center fallback when there is no reference node", () => {
    const position = computeInsertPosition("flow", null, [], {
      x: -180,
      y: -100,
      zoom: 1,
      width: 900,
      height: 500,
    });

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

  it("computes sitemap reflow with hierarchical levels", () => {
    const nodes = [
      createNode("home", { x: 100, y: 50, kind: "page" }),
      createNode("blog", { x: 800, y: 120, kind: "page" }),
      createNode("docs", { x: 200, y: 660, kind: "page" }),
    ];
    const edges = [
      createEdge("e1", { source: "home", target: "blog", kind: "contains" }),
      createEdge("e2", { source: "home", target: "docs", kind: "contains" }),
    ];

    const positions = computeReflow("sitemap", nodes, edges, "home");

    expect(positions.home.y).toBe(0);
    expect(positions.blog.y).toBe(220);
    expect(positions.docs.y).toBe(220);
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

  it("computes flow reflow with branch and note on separate lanes", () => {
    const nodes = [
      createNode("start", {
        x: 0,
        y: 0,
        kind: "flow-step",
        diagramRole: "flow-start",
      }),
      createNode("step", { x: 140, y: 30, kind: "flow-step" }),
      createNode("branch", {
        x: 220,
        y: 210,
        kind: "flow-step",
        diagramRole: "flow-decision",
      }),
      createNode("note", {
        x: 180,
        y: -90,
        kind: "note",
        diagramRole: "flow-note",
      }),
      createNode("end", {
        x: 500,
        y: 0,
        kind: "flow-step",
        diagramRole: "flow-end",
      }),
    ];
    const edges = [
      createEdge("e1", { source: "start", target: "step", kind: "flows-to" }),
      createEdge("e2", { source: "step", target: "end", kind: "flows-to" }),
      createEdge("e3", {
        source: "step",
        target: "branch",
        kind: "depends-on",
      }),
      createEdge("e4", { source: "note", target: "step", kind: "references" }),
    ];

    const positions = computeReflow("flow", nodes, edges);

    expect(positions.start.y).toBe(0);
    expect(positions.step.y).toBe(0);
    expect(positions.end.y).toBe(0);
    expect(positions.branch.x).toBeGreaterThan(positions.step.x);
    expect(positions.branch.y).toBeGreaterThan(positions.step.y + 240);
    expect(positions.note.y).toBeLessThan(positions.step.y - 180);
    expect(Math.abs(positions.note.x - positions.step.x)).toBeLessThan(
      FLOW_NOTE_DRIFT_LIMIT,
    );
  });

  it("keeps flow reflow deterministic even when node order changes", () => {
    const nodes = [
      createNode("end", {
        x: 500,
        y: 0,
        kind: "flow-step",
        diagramRole: "flow-end",
      }),
      createNode("note", {
        x: 180,
        y: -90,
        kind: "note",
        diagramRole: "flow-note",
      }),
      createNode("branch", {
        x: 220,
        y: 210,
        kind: "flow-step",
        diagramRole: "flow-decision",
      }),
      createNode("step", { x: 140, y: 30, kind: "flow-step" }),
      createNode("start", {
        x: 0,
        y: 0,
        kind: "flow-step",
        diagramRole: "flow-start",
      }),
    ];
    const edges = [
      createEdge("e4", { source: "note", target: "step", kind: "references" }),
      createEdge("e2", { source: "step", target: "end", kind: "flows-to" }),
      createEdge("e3", {
        source: "step",
        target: "branch",
        kind: "depends-on",
      }),
      createEdge("e1", { source: "start", target: "step", kind: "flows-to" }),
    ];

    const firstPositions = computeReflow("flow", nodes, edges);
    const secondPositions = computeReflow(
      "flow",
      [...nodes].reverse(),
      [...edges].reverse(),
    );

    expect(secondPositions).toEqual(firstPositions);
  });

  it("computes flow reflow top-down", () => {
    const nodes = [
      createNode("a", { x: 0, y: 0, kind: "flow-step" }),
      createNode("b", { x: 0, y: 0, kind: "flow-step" }),
      createNode("c", { x: 0, y: 0, kind: "flow-step" }),
    ];
    const edges = [
      createEdge("e1", { source: "a", target: "b", kind: "flows-to" }),
      createEdge("e2", { source: "b", target: "c", kind: "flows-to" }),
    ];

    const positions = computeReflow("flow", nodes, edges, undefined, {
      direction: "top-down",
    });

    expect(positions.a.y).toBeLessThan(positions.b.y);
    expect(positions.b.y).toBeLessThan(positions.c.y);
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
    expect(Math.hypot(positions.sat_1.x, positions.sat_1.y)).toBeGreaterThan(
      180,
    );
    expect(Math.hypot(positions.sat_2.x, positions.sat_2.y)).toBeGreaterThan(
      180,
    );
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
    expect(
      new Set(values.map((position) => `${position.x}:${position.y}`)).size,
    ).toBe(4);
  });

  it("computes graph reflow as a network (non-linear)", () => {
    const nodes = [
      createNode("core", {
        x: 0,
        y: 0,
        kind: "entity",
        diagramRole: "graph-core",
      }),
      createNode("api", {
        x: 0,
        y: 0,
        kind: "entity",
        diagramRole: "graph-topic",
      }),
      createNode("worker", {
        x: 0,
        y: 0,
        kind: "entity",
        diagramRole: "graph-topic",
      }),
      createNode("db", {
        x: 0,
        y: 0,
        kind: "entity",
        diagramRole: "graph-topic",
      }),
      createNode("cache", {
        x: 0,
        y: 0,
        kind: "page",
        diagramRole: "graph-supporting",
      }),
    ];
    const edges = [
      createEdge("e1", { source: "core", target: "api", kind: "relates-to" }),
      createEdge("e2", {
        source: "core",
        target: "worker",
        kind: "depends-on",
      }),
      createEdge("e3", { source: "core", target: "db", kind: "depends-on" }),
      createEdge("e4", {
        source: "worker",
        target: "cache",
        kind: "references",
      }),
    ];

    const positions = computeReflow("graph", nodes, edges);
    const values = Object.values(positions);

    expect(values.length).toBe(5);
    expect(
      values.some((position) => position.x === 0 && position.y === 0),
    ).toBe(true);
    expect(
      new Set(values.map((position) => Math.round(position.x))).size,
    ).toBeGreaterThan(2);
    expect(
      new Set(values.map((position) => Math.round(position.y))).size,
    ).toBeGreaterThan(2);
    expect(positions.cache.y).toBeGreaterThan(positions.api.y);
  });

  it("computes timeline reflow left-right with sequential order", () => {
    const nodes = [
      createNode("m1", { x: 10, y: 80, kind: "note" }),
      createNode("m2", { x: 20, y: 80, kind: "note" }),
      createNode("m3", { x: 30, y: 80, kind: "note" }),
    ];
    const edges = [
      createEdge("e1", { source: "m1", target: "m2", kind: "flows-to" }),
      createEdge("e2", { source: "m2", target: "m3", kind: "flows-to" }),
    ];

    const positions = computeReflow("timeline", nodes, edges);

    expect(positions.m1.x).toBeLessThan(positions.m2.x);
    expect(positions.m2.x).toBeLessThan(positions.m3.x);
  });
});
