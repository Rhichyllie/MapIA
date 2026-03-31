import type { DiagramLayoutEdge, DiagramLayoutNode } from "./diagram-layout";
import { buildFlowTopology } from "./diagram-layout-flow-topology";
import {
  FLOW_INSERT_LAYOUT,
  isFlowNoteNode,
  resolveBalancedFlowLane,
  resolveDefaultFlowLogicalFootprint,
  type FlowDirection,
  type FlowLaneAssignment,
  type FlowLogicalFootprint,
  type FlowLogicalPlacement,
  type FlowLogicalPosition,
  type FlowPlacementKind,
  type FlowTopology,
} from "./diagram-layout-flow-types";
import {
  compareFlowNodesByVisualOrder,
  fromFlowLogicalPosition,
  isFlowLogicalOverlap,
} from "./diagram-layout-flow-geometry";

function assignFlowLanesAndColumns(
  topology: FlowTopology,
  direction: FlowDirection,
): FlowLaneAssignment {
  const rootCandidates = [...topology.nonNoteNodes]
    .filter(
      (node) =>
        (topology.incomingFlowByNodeId.get(node.id) ?? 0) === 0 &&
        (topology.incomingDependsByNodeId.get(node.id) ?? 0) === 0,
    )
    .sort((nodeA, nodeB) =>
      compareFlowNodesByVisualOrder(nodeA, nodeB, direction),
    );
  const primaryRoot = rootCandidates[0] ?? topology.nonNoteNodes[0];
  const laneByNodeId = new Map<string, number>();
  const columnByNodeId = new Map<string, number>();
  const queuedNodeIds = new Set<string>();
  const chainQueue: Array<{ nodeId: string; lane: number; column: number }> =
    [];
  let nextBranchLaneIndex = 0;

  function scheduleBranchChain(nodeId: string, column: number) {
    const targetNode = topology.nodeMap.get(nodeId);
    if (!targetNode || isFlowNoteNode(targetNode)) {
      return;
    }

    if (laneByNodeId.has(nodeId) || queuedNodeIds.has(nodeId)) {
      return;
    }

    chainQueue.push({
      nodeId,
      lane: resolveBalancedFlowLane(nextBranchLaneIndex),
      column,
    });
    queuedNodeIds.add(nodeId);
    nextBranchLaneIndex += 1;
  }

  function layoutChain(startNodeId: string, lane: number, startColumn: number) {
    let currentNodeId: string | undefined = startNodeId;
    let currentColumn = startColumn;

    while (currentNodeId) {
      queuedNodeIds.delete(currentNodeId);
      if (laneByNodeId.has(currentNodeId)) {
        break;
      }

      const currentNode = topology.nodeMap.get(currentNodeId);
      if (!currentNode || isFlowNoteNode(currentNode)) {
        break;
      }

      laneByNodeId.set(currentNodeId, lane);
      columnByNodeId.set(currentNodeId, currentColumn);

      for (const branchTargetId of topology.dependsTargetsBySource.get(
        currentNodeId,
      ) ?? []) {
        scheduleBranchChain(branchTargetId, currentColumn + 1);
      }

      const flowTargets: string[] = [
        ...(topology.flowTargetsBySource.get(currentNodeId) ?? []),
      ];
      if (flowTargets.length === 0) {
        break;
      }

      const preferredTargetId = flowTargets[0];
      for (const branchTargetId of flowTargets.slice(1)) {
        scheduleBranchChain(branchTargetId, currentColumn + 1);
      }

      if (!preferredTargetId || laneByNodeId.has(preferredTargetId)) {
        break;
      }

      currentNodeId = preferredTargetId;
      currentColumn += 1;
    }
  }

  if (primaryRoot) {
    layoutChain(primaryRoot.id, 0, 0);
  }

  for (const rootNode of rootCandidates.slice(primaryRoot ? 1 : 0)) {
    scheduleBranchChain(rootNode.id, 0);
  }

  for (const node of topology.nonNoteNodes) {
    if (laneByNodeId.has(node.id) || queuedNodeIds.has(node.id)) {
      continue;
    }

    scheduleBranchChain(node.id, 0);
  }

  while (chainQueue.length > 0) {
    const current = chainQueue.shift();
    if (!current || laneByNodeId.has(current.nodeId)) {
      continue;
    }

    layoutChain(current.nodeId, current.lane, current.column);
  }

  return {
    laneByNodeId,
    columnByNodeId,
  };
}

function buildFlowGridStarts(input: {
  direction: FlowDirection;
  nonNoteNodes: DiagramLayoutNode[];
  laneByNodeId: Map<string, number>;
  columnByNodeId: Map<string, number>;
  logicalFootprintByNodeId: Map<string, FlowLogicalFootprint>;
}) {
  const defaultFootprint = resolveDefaultFlowLogicalFootprint(input.direction);
  const columnIds = [
    ...new Set(
      input.nonNoteNodes.map((node) => input.columnByNodeId.get(node.id) ?? 0),
    ),
  ].sort((valueA, valueB) => valueA - valueB);
  const laneIds = [
    ...new Set(
      input.nonNoteNodes.map((node) => input.laneByNodeId.get(node.id) ?? 0),
    ),
  ].sort((valueA, valueB) => valueA - valueB);
  const columnPrimarySpanById = new Map<number, number>();
  const laneSecondarySpanById = new Map<number, number>();

  for (const node of input.nonNoteNodes) {
    const column = input.columnByNodeId.get(node.id) ?? 0;
    const lane = input.laneByNodeId.get(node.id) ?? 0;
    const footprint = input.logicalFootprintByNodeId.get(node.id);
    if (!footprint) {
      continue;
    }

    columnPrimarySpanById.set(
      column,
      Math.max(columnPrimarySpanById.get(column) ?? 0, footprint.primarySpan),
    );
    laneSecondarySpanById.set(
      lane,
      Math.max(laneSecondarySpanById.get(lane) ?? 0, footprint.secondarySpan),
    );
  }

  const columnPrimaryStartById = new Map<number, number>();
  let nextPrimaryStart = 0;
  for (const columnId of columnIds) {
    columnPrimaryStartById.set(columnId, nextPrimaryStart);
    nextPrimaryStart +=
      (columnPrimarySpanById.get(columnId) ?? defaultFootprint.primarySpan) +
      FLOW_INSERT_LAYOUT.trunkPrimaryGap;
  }

  const laneSecondaryStartById = new Map<number, number>();
  if (laneIds.includes(0)) {
    laneSecondaryStartById.set(0, 0);
  }
  const firstBranchLaneGap = Math.max(
    FLOW_INSERT_LAYOUT.branchSecondaryGap - 28,
    FLOW_INSERT_LAYOUT.trunkSecondaryGap + 24,
  );
  let nextPositiveSecondaryStart =
    (laneSecondarySpanById.get(0) ?? defaultFootprint.secondarySpan) +
    firstBranchLaneGap;
  for (const laneId of laneIds
    .filter((laneId) => laneId > 0)
    .sort((valueA, valueB) => valueA - valueB)) {
    laneSecondaryStartById.set(laneId, nextPositiveSecondaryStart);
    nextPositiveSecondaryStart +=
      (laneSecondarySpanById.get(laneId) ?? defaultFootprint.secondarySpan) +
      FLOW_INSERT_LAYOUT.branchLaneGap;
  }
  let nextNegativeSecondaryEnd = -firstBranchLaneGap;
  for (const laneId of laneIds
    .filter((laneId) => laneId < 0)
    .sort((valueA, valueB) => Math.abs(valueA) - Math.abs(valueB))) {
    const laneSpan =
      laneSecondarySpanById.get(laneId) ?? defaultFootprint.secondarySpan;
    laneSecondaryStartById.set(laneId, nextNegativeSecondaryEnd - laneSpan);
    nextNegativeSecondaryEnd =
      (laneSecondaryStartById.get(laneId) ?? 0) -
      FLOW_INSERT_LAYOUT.branchLaneGap;
  }

  return {
    columnPrimaryStartById,
    laneSecondaryStartById,
  };
}

function placeFlowPrimaryAndBranchNodes(input: {
  nonNoteNodes: DiagramLayoutNode[];
  laneByNodeId: Map<string, number>;
  columnByNodeId: Map<string, number>;
  logicalFootprintByNodeId: Map<string, FlowLogicalFootprint>;
  columnPrimaryStartById: Map<number, number>;
  laneSecondaryStartById: Map<number, number>;
}): FlowLogicalPlacement {
  const logicalPositions: Record<string, FlowLogicalPosition> = {};
  const placementKindByNodeId = new Map<string, FlowPlacementKind>();

  for (const node of input.nonNoteNodes) {
    const column = input.columnByNodeId.get(node.id) ?? 0;
    const lane = input.laneByNodeId.get(node.id) ?? 0;
    const footprint = input.logicalFootprintByNodeId.get(node.id);
    if (!footprint) {
      continue;
    }

    logicalPositions[node.id] = {
      primary: input.columnPrimaryStartById.get(column) ?? 0,
      secondary: input.laneSecondaryStartById.get(lane) ?? 0,
    };
    placementKindByNodeId.set(node.id, lane === 0 ? "main" : "branch");
  }

  return {
    logicalPositions,
    placementKindByNodeId,
  };
}

function compareFlowGridNodeIds(
  nodeIdA: string,
  nodeIdB: string,
  columnByNodeId: Map<string, number>,
  laneByNodeId: Map<string, number>,
) {
  const columnDifference =
    (columnByNodeId.get(nodeIdA) ?? 0) - (columnByNodeId.get(nodeIdB) ?? 0);
  if (columnDifference !== 0) {
    return columnDifference;
  }

  const laneDifference =
    (laneByNodeId.get(nodeIdA) ?? 0) - (laneByNodeId.get(nodeIdB) ?? 0);
  if (laneDifference !== 0) {
    return laneDifference;
  }

  return nodeIdA.localeCompare(nodeIdB);
}

function resolveNearestFlowHostId(input: {
  noteNode: DiagramLayoutNode;
  nonNoteNodes: DiagramLayoutNode[];
  direction: FlowDirection;
}) {
  return [...input.nonNoteNodes].sort((nodeA, nodeB) => {
    const distanceA = Math.hypot(
      nodeA.position.x - input.noteNode.position.x,
      nodeA.position.y - input.noteNode.position.y,
    );
    const distanceB = Math.hypot(
      nodeB.position.x - input.noteNode.position.x,
      nodeB.position.y - input.noteNode.position.y,
    );

    if (distanceA !== distanceB) {
      return distanceA - distanceB;
    }

    return compareFlowNodesByVisualOrder(nodeA, nodeB, input.direction);
  })[0]?.id;
}

function placeFlowNotes(input: {
  topology: FlowTopology;
  direction: FlowDirection;
  logicalPositions: Record<string, FlowLogicalPosition>;
  placementKindByNodeId: Map<string, FlowPlacementKind>;
  laneByNodeId: Map<string, number>;
  columnByNodeId: Map<string, number>;
}) {
  const notesByHostId = new Map<string, string[]>();
  const detachedNoteIds: string[] = [];

  for (const noteNode of input.topology.noteNodes) {
    const attachedHostIds = [
      ...(input.topology.referenceHostsByNoteId.get(noteNode.id) ?? []),
    ]
      .filter((hostId) => input.topology.nodeMap.has(hostId))
      .sort((hostIdA, hostIdB) =>
        compareFlowGridNodeIds(
          hostIdA,
          hostIdB,
          input.columnByNodeId,
          input.laneByNodeId,
        ),
      );
    const attachedHostId =
      attachedHostIds[0] ??
      resolveNearestFlowHostId({
        noteNode,
        nonNoteNodes: input.topology.nonNoteNodes,
        direction: input.direction,
      });

    if (!attachedHostId) {
      detachedNoteIds.push(noteNode.id);
      continue;
    }

    const hostNotes = notesByHostId.get(attachedHostId) ?? [];
    hostNotes.push(noteNode.id);
    notesByHostId.set(attachedHostId, hostNotes);
  }

  for (const hostId of [...notesByHostId.keys()].sort((hostIdA, hostIdB) =>
    compareFlowGridNodeIds(
      hostIdA,
      hostIdB,
      input.columnByNodeId,
      input.laneByNodeId,
    ),
  )) {
    const noteIds = [...(notesByHostId.get(hostId) ?? [])].sort(
      (noteIdA, noteIdB) => {
        const noteNodeA = input.topology.nodeMap.get(noteIdA);
        const noteNodeB = input.topology.nodeMap.get(noteIdB);
        if (!noteNodeA || !noteNodeB) {
          return noteIdA.localeCompare(noteIdB);
        }

        return compareFlowNodesByVisualOrder(
          noteNodeA,
          noteNodeB,
          input.direction,
        );
      },
    );
    const hostPosition = input.logicalPositions[hostId];
    const hostFootprint = input.topology.logicalFootprintByNodeId.get(hostId);
    const hostNode = input.topology.nodeMap.get(hostId);
    const hostIsDecision = hostNode?.diagramRole === "flow-decision";
    if (!hostPosition || !hostFootprint) {
      continue;
    }

    noteIds.forEach((noteId, index) => {
      const noteFootprint = input.topology.logicalFootprintByNodeId.get(noteId);
      if (!noteFootprint) {
        return;
      }

      input.logicalPositions[noteId] = {
        primary:
          hostPosition.primary +
          Math.max(
            (hostFootprint.primarySpan - noteFootprint.primarySpan) / 2,
            0,
          ) +
          (hostIsDecision
            ? Math.max(FLOW_INSERT_LAYOUT.noteForwardOffset - 40, 44)
            : FLOW_INSERT_LAYOUT.noteForwardOffset) +
          (index % 2) *
            Math.max(
              noteFootprint.primarySpan * 0.62,
              FLOW_INSERT_LAYOUT.noteClusterGap,
            ),
        secondary:
          hostPosition.secondary -
          noteFootprint.secondarySpan -
          (hostIsDecision
            ? Math.max(FLOW_INSERT_LAYOUT.noteSecondaryGap - 24, 74)
            : FLOW_INSERT_LAYOUT.noteSecondaryGap) -
          Math.floor(index / 2) *
            (noteFootprint.secondarySpan + FLOW_INSERT_LAYOUT.noteLaneGap),
      };
      input.placementKindByNodeId.set(noteId, "note");
    });
  }

  detachedNoteIds
    .sort((noteIdA, noteIdB) => {
      const noteNodeA = input.topology.nodeMap.get(noteIdA);
      const noteNodeB = input.topology.nodeMap.get(noteIdB);
      if (!noteNodeA || !noteNodeB) {
        return noteIdA.localeCompare(noteIdB);
      }

      return compareFlowNodesByVisualOrder(
        noteNodeA,
        noteNodeB,
        input.direction,
      );
    })
    .forEach((noteId, index) => {
      const noteFootprint = input.topology.logicalFootprintByNodeId.get(noteId);
      if (!noteFootprint) {
        return;
      }

      input.logicalPositions[noteId] = {
        primary:
          index *
          (noteFootprint.primarySpan + FLOW_INSERT_LAYOUT.noteClusterGap / 2),
        secondary:
          -noteFootprint.secondarySpan -
          FLOW_INSERT_LAYOUT.noteSecondaryGap * 2 -
          Math.floor(index / 3) *
            (noteFootprint.secondarySpan + FLOW_INSERT_LAYOUT.noteLaneGap),
      };
      input.placementKindByNodeId.set(noteId, "note");
    });
}

function orderFlowPlacementIds(input: {
  orderedNodes: DiagramLayoutNode[];
  logicalPositions: Record<string, FlowLogicalPosition>;
  placementKindByNodeId: Map<string, FlowPlacementKind>;
}) {
  return input.orderedNodes
    .map((node) => node.id)
    .filter((nodeId) => Boolean(input.logicalPositions[nodeId]))
    .sort((nodeIdA, nodeIdB) => {
      const placementKindA =
        input.placementKindByNodeId.get(nodeIdA) ?? "branch";
      const placementKindB =
        input.placementKindByNodeId.get(nodeIdB) ?? "branch";
      const placementRankA =
        placementKindA === "main" ? 0 : placementKindA === "branch" ? 1 : 2;
      const placementRankB =
        placementKindB === "main" ? 0 : placementKindB === "branch" ? 1 : 2;

      if (placementRankA !== placementRankB) {
        return placementRankA - placementRankB;
      }

      const logicalPositionA = input.logicalPositions[nodeIdA];
      const logicalPositionB = input.logicalPositions[nodeIdB];
      if (logicalPositionA.primary !== logicalPositionB.primary) {
        return logicalPositionA.primary - logicalPositionB.primary;
      }

      if (logicalPositionA.secondary !== logicalPositionB.secondary) {
        return logicalPositionA.secondary - logicalPositionB.secondary;
      }

      return nodeIdA.localeCompare(nodeIdB);
    });
}

function stabilizeFlowLogicalPositions(input: {
  orderedNodeIds: string[];
  logicalPositions: Record<string, FlowLogicalPosition>;
  placementKindByNodeId: Map<string, FlowPlacementKind>;
  footprintByNodeId: Map<string, FlowLogicalFootprint>;
}) {
  const committedNodeIds: string[] = [];

  for (const nodeId of input.orderedNodeIds) {
    const initialPosition = input.logicalPositions[nodeId];
    const footprint = input.footprintByNodeId.get(nodeId);
    if (!initialPosition || !footprint) {
      continue;
    }

    const placementKind = input.placementKindByNodeId.get(nodeId) ?? "branch";
    let candidatePosition = initialPosition;
    let attempts = 0;

    while (
      committedNodeIds.some((otherNodeId) => {
        const otherPosition = input.logicalPositions[otherNodeId];
        const otherFootprint = input.footprintByNodeId.get(otherNodeId);
        if (!otherPosition || !otherFootprint) {
          return false;
        }

        return isFlowLogicalOverlap({
          positionA: candidatePosition,
          footprintA: footprint,
          positionB: otherPosition,
          footprintB: otherFootprint,
        });
      }) &&
      attempts < 12
    ) {
      if (placementKind === "note") {
        candidatePosition = {
          primary:
            candidatePosition.primary +
            Math.max(
              footprint.primarySpan * 0.42,
              FLOW_INSERT_LAYOUT.noteClusterGap / 2,
            ),
          secondary:
            candidatePosition.secondary -
            Math.max(
              footprint.secondarySpan * 0.4,
              FLOW_INSERT_LAYOUT.noteLaneGap / 2,
            ),
        };
      } else if (placementKind === "branch") {
        const branchDirection = candidatePosition.secondary >= 0 ? 1 : -1;
        candidatePosition = {
          primary: candidatePosition.primary,
          secondary:
            candidatePosition.secondary +
            branchDirection *
              Math.max(
                footprint.secondarySpan * 0.46,
                FLOW_INSERT_LAYOUT.branchLaneGap / 2,
              ),
        };
      } else {
        candidatePosition = {
          primary:
            candidatePosition.primary +
            Math.max(
              footprint.primarySpan * 0.58,
              FLOW_INSERT_LAYOUT.trunkPrimaryGap / 2,
            ),
          secondary: candidatePosition.secondary,
        };
      }

      attempts += 1;
    }

    input.logicalPositions[nodeId] = candidatePosition;
    committedNodeIds.push(nodeId);
  }
}

export function computeFlowReflow(
  nodes: DiagramLayoutNode[],
  edges: DiagramLayoutEdge[],
  direction: FlowDirection = "left-right",
) {
  const positions: Record<string, { x: number; y: number }> = {};
  if (nodes.length === 0) {
    return positions;
  }

  const topology = buildFlowTopology(nodes, edges, direction);
  const laneAssignment = assignFlowLanesAndColumns(topology, direction);
  const gridStarts = buildFlowGridStarts({
    direction,
    nonNoteNodes: topology.nonNoteNodes,
    laneByNodeId: laneAssignment.laneByNodeId,
    columnByNodeId: laneAssignment.columnByNodeId,
    logicalFootprintByNodeId: topology.logicalFootprintByNodeId,
  });
  const logicalPlacement = placeFlowPrimaryAndBranchNodes({
    nonNoteNodes: topology.nonNoteNodes,
    laneByNodeId: laneAssignment.laneByNodeId,
    columnByNodeId: laneAssignment.columnByNodeId,
    logicalFootprintByNodeId: topology.logicalFootprintByNodeId,
    columnPrimaryStartById: gridStarts.columnPrimaryStartById,
    laneSecondaryStartById: gridStarts.laneSecondaryStartById,
  });

  placeFlowNotes({
    topology,
    direction,
    logicalPositions: logicalPlacement.logicalPositions,
    placementKindByNodeId: logicalPlacement.placementKindByNodeId,
    laneByNodeId: laneAssignment.laneByNodeId,
    columnByNodeId: laneAssignment.columnByNodeId,
  });

  stabilizeFlowLogicalPositions({
    orderedNodeIds: orderFlowPlacementIds({
      orderedNodes: topology.orderedNodes,
      logicalPositions: logicalPlacement.logicalPositions,
      placementKindByNodeId: logicalPlacement.placementKindByNodeId,
    }),
    logicalPositions: logicalPlacement.logicalPositions,
    placementKindByNodeId: logicalPlacement.placementKindByNodeId,
    footprintByNodeId: topology.logicalFootprintByNodeId,
  });

  for (const [nodeId, logicalPosition] of Object.entries(
    logicalPlacement.logicalPositions,
  )) {
    positions[nodeId] = fromFlowLogicalPosition(logicalPosition, direction);
  }

  return positions;
}
