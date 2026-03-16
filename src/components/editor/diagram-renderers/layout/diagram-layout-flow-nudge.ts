import type { DiagramLayoutEdge, DiagramLayoutNode } from "./diagram-layout";
import { buildFlowTopology } from "./diagram-layout-flow-topology";
import {
  FLOW_INSERT_LAYOUT,
  isFlowNoteNode,
  resolveFlowDirection,
  resolveFlowLogicalFootprint,
  type FlowContextualInsertMode,
  type FlowDirection,
  type FlowLogicalBox,
  type FlowLogicalFootprint,
  type FlowLogicalPosition,
  type FlowLogicalState,
  type FlowNudgeCandidate,
  type FlowNudgeState,
} from "./diagram-layout-flow-types";
import {
  fromFlowLogicalPosition,
  rangesOverlap,
  toFlowLogicalBox,
  toFlowLogicalPosition,
} from "./diagram-layout-flow-geometry";

function buildFlowLogicalState(
  nodes: DiagramLayoutNode[],
  direction: FlowDirection,
): FlowLogicalState {
  return {
    logicalPositions: new Map(
      nodes.map((node) => [node.id, toFlowLogicalPosition(node.position, direction)] as const),
    ),
    logicalFootprints: new Map(
      nodes.map(
        (node) =>
          [
            node.id,
            resolveFlowLogicalFootprint({
              direction,
              node,
            }),
          ] as const,
      ),
    ),
  };
}

function moveFlowNodeGroup(
  state: FlowNudgeState,
  rootNodeId: string,
  deltaPrimary: number,
  deltaSecondary: number,
) {
  const queue = [rootNodeId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    if (
      !currentNodeId ||
      currentNodeId === state.insertedNodeId ||
      currentNodeId === state.anchorNodeId ||
      visited.has(currentNodeId)
    ) {
      continue;
    }

    const currentPosition = state.logicalPositions.get(currentNodeId);
    if (!currentPosition) {
      continue;
    }

    visited.add(currentNodeId);
    const shiftedPosition = {
      primary: currentPosition.primary + deltaPrimary,
      secondary: currentPosition.secondary + deltaSecondary,
    };
    state.logicalPositions.set(currentNodeId, shiftedPosition);
    state.nextPositions[currentNodeId] = fromFlowLogicalPosition(
      shiftedPosition,
      state.direction,
    );

    for (const noteId of state.noteIdsByHost.get(currentNodeId) ?? []) {
      queue.push(noteId);
    }
    for (const branchId of state.dependsTargetsBySource.get(currentNodeId) ?? []) {
      queue.push(branchId);
    }
  }
}

function buildFlowNudgeCandidates(input: {
  nodes: DiagramLayoutNode[];
  logicalPositions: Map<string, FlowLogicalPosition>;
  logicalFootprints: Map<string, FlowLogicalFootprint>;
  predicate: (entry: FlowNudgeCandidate) => boolean;
  sort: (entryA: FlowNudgeCandidate, entryB: FlowNudgeCandidate) => number;
}) {
  return input.nodes
    .map((node) => {
      const position = input.logicalPositions.get(node.id);
      const footprint = input.logicalFootprints.get(node.id);
      return position && footprint
        ? {
            nodeId: node.id,
            box: toFlowLogicalBox(position, footprint),
            footprint,
          }
        : null;
    })
    .filter((entry): entry is FlowNudgeCandidate => Boolean(entry))
    .filter(input.predicate)
    .sort(input.sort);
}

function applyFlowNextStepContextualNudge(input: {
  nodes: DiagramLayoutNode[];
  state: FlowNudgeState;
  insertedBox: FlowLogicalBox;
  insertedFootprint: FlowLogicalFootprint;
}) {
  const candidates = buildFlowNudgeCandidates({
    nodes: input.nodes.filter(
      (node) =>
        !isFlowNoteNode(node) &&
        node.id !== input.state.insertedNodeId &&
        node.id !== input.state.anchorNodeId,
    ),
    logicalPositions: input.state.logicalPositions,
    logicalFootprints: input.state.logicalFootprints,
    predicate: (entry) =>
      entry.box.primaryStart >= input.insertedBox.primaryStart &&
      rangesOverlap(
        entry.box.secondaryStart,
        entry.box.secondaryEnd,
        input.insertedBox.secondaryStart - input.insertedFootprint.paddingSecondary / 3,
        input.insertedBox.secondaryEnd + input.insertedFootprint.paddingSecondary / 3,
      ),
    sort: (entryA, entryB) => entryA.box.primaryStart - entryB.box.primaryStart,
  });

  let reservedPrimaryEnd = input.insertedBox.primaryEnd;
  for (const candidate of candidates) {
    const gap = Math.max(
      candidate.footprint.paddingPrimary * 0.24,
      FLOW_INSERT_LAYOUT.trunkPrimaryGap * 0.36,
    );
    const requiredPrimaryStart = reservedPrimaryEnd + gap;

    if (candidate.box.primaryStart < requiredPrimaryStart) {
      moveFlowNodeGroup(
        input.state,
        candidate.nodeId,
        requiredPrimaryStart - candidate.box.primaryStart,
        0,
      );
    }

    const nextPosition = input.state.logicalPositions.get(candidate.nodeId);
    if (nextPosition) {
      reservedPrimaryEnd = toFlowLogicalBox(nextPosition, candidate.footprint).primaryEnd;
    }
  }
}

function applyFlowBranchContextualNudge(input: {
  nodes: DiagramLayoutNode[];
  state: FlowNudgeState;
  insertedBox: FlowLogicalBox;
  insertedFootprint: FlowLogicalFootprint;
}) {
  const candidates = buildFlowNudgeCandidates({
    nodes: input.nodes.filter(
      (node) =>
        !isFlowNoteNode(node) &&
        node.id !== input.state.insertedNodeId &&
        node.id !== input.state.anchorNodeId,
    ),
    logicalPositions: input.state.logicalPositions,
    logicalFootprints: input.state.logicalFootprints,
    predicate: (entry) =>
      entry.box.secondaryStart >= input.insertedBox.secondaryStart &&
      rangesOverlap(
        entry.box.primaryStart,
        entry.box.primaryEnd,
        input.insertedBox.primaryStart - input.insertedFootprint.paddingPrimary / 3,
        input.insertedBox.primaryEnd + input.insertedFootprint.paddingPrimary / 3,
      ),
    sort: (entryA, entryB) => entryA.box.secondaryStart - entryB.box.secondaryStart,
  });

  let reservedSecondaryEnd = input.insertedBox.secondaryEnd;
  for (const candidate of candidates) {
    const gap = Math.max(
      candidate.footprint.paddingSecondary * 0.24,
      FLOW_INSERT_LAYOUT.branchLaneGap * 0.36,
    );
    const requiredSecondaryStart = reservedSecondaryEnd + gap;

    if (candidate.box.secondaryStart < requiredSecondaryStart) {
      moveFlowNodeGroup(
        input.state,
        candidate.nodeId,
        0,
        requiredSecondaryStart - candidate.box.secondaryStart,
      );
    }

    const nextPosition = input.state.logicalPositions.get(candidate.nodeId);
    if (nextPosition) {
      reservedSecondaryEnd = toFlowLogicalBox(nextPosition, candidate.footprint).secondaryEnd;
    }
  }
}

function applyFlowNoteContextualNudge(input: {
  nodes: DiagramLayoutNode[];
  state: FlowNudgeState;
  insertedBox: FlowLogicalBox;
  insertedFootprint: FlowLogicalFootprint;
}) {
  const candidates = buildFlowNudgeCandidates({
    nodes: input.nodes.filter(
      (node) =>
        isFlowNoteNode(node) &&
        node.id !== input.state.insertedNodeId &&
        node.id !== input.state.anchorNodeId,
    ),
    logicalPositions: input.state.logicalPositions,
    logicalFootprints: input.state.logicalFootprints,
    predicate: (entry) =>
      rangesOverlap(
        entry.box.primaryStart,
        entry.box.primaryEnd,
        input.insertedBox.primaryStart - input.insertedFootprint.paddingPrimary / 3,
        input.insertedBox.primaryEnd + input.insertedFootprint.paddingPrimary / 3,
      ) &&
      entry.box.secondaryEnd <=
        input.insertedBox.secondaryEnd + input.insertedFootprint.paddingSecondary,
    sort: (entryA, entryB) => entryB.box.secondaryEnd - entryA.box.secondaryEnd,
  });

  let reservedSecondaryStart = input.insertedBox.secondaryStart;
  for (const candidate of candidates) {
    const gap = Math.max(
      candidate.footprint.paddingSecondary * 0.24,
      FLOW_INSERT_LAYOUT.noteLaneGap * 0.34,
    );
    const requiredSecondaryEnd = reservedSecondaryStart - gap;

    if (candidate.box.secondaryEnd > requiredSecondaryEnd) {
      moveFlowNodeGroup(
        input.state,
        candidate.nodeId,
        Math.max(candidate.footprint.primarySpan * 0.08, 18),
        requiredSecondaryEnd - candidate.box.secondaryEnd,
      );
    }

    const nextPosition = input.state.logicalPositions.get(candidate.nodeId);
    if (nextPosition) {
      reservedSecondaryStart = toFlowLogicalBox(nextPosition, candidate.footprint).secondaryStart;
    }
  }
}

export function computeFlowContextualNudgePositions(input: {
  nodes: DiagramLayoutNode[];
  edges: DiagramLayoutEdge[];
  anchorNodeId?: string;
  insertedNodeId: string;
  insertMode: FlowContextualInsertMode;
  layoutOptions?: unknown;
}) {
  const direction = resolveFlowDirection(input.layoutOptions);
  const topology = buildFlowTopology(input.nodes, input.edges, direction);
  if (!topology.nodeMap.has(input.insertedNodeId)) {
    return {} as Record<string, { x: number; y: number }>;
  }

  const logicalState = buildFlowLogicalState(input.nodes, direction);
  const insertedPosition = logicalState.logicalPositions.get(input.insertedNodeId);
  const insertedFootprint = logicalState.logicalFootprints.get(input.insertedNodeId);
  if (!insertedPosition || !insertedFootprint) {
    return {} as Record<string, { x: number; y: number }>;
  }

  const state: FlowNudgeState = {
    ...logicalState,
    anchorNodeId: input.anchorNodeId,
    insertedNodeId: input.insertedNodeId,
    direction,
    dependsTargetsBySource: topology.dependsTargetsBySource,
    noteIdsByHost: topology.noteIdsByHost,
    nextPositions: {},
  };
  const insertedBox = toFlowLogicalBox(insertedPosition, insertedFootprint);

  if (input.insertMode === "flow-next-step") {
    applyFlowNextStepContextualNudge({
      nodes: input.nodes,
      state,
      insertedBox,
      insertedFootprint,
    });
    return state.nextPositions;
  }

  if (input.insertMode === "flow-branch") {
    applyFlowBranchContextualNudge({
      nodes: input.nodes,
      state,
      insertedBox,
      insertedFootprint,
    });
    return state.nextPositions;
  }

  applyFlowNoteContextualNudge({
    nodes: input.nodes,
    state,
    insertedBox,
    insertedFootprint,
  });
  return state.nextPositions;
}
