import type { DiagramLayoutEdge, DiagramLayoutNode } from "./diagram-layout";
import {
  FLOW_INSERT_LAYOUT,
  isFlowNoteNode,
  resolveDefaultFlowLogicalFootprint,
  resolveFlowLogicalFootprint,
  type FlowDirection,
  type FlowLogicalFootprint,
  type FlowTopology,
} from "./diagram-layout-flow-types";
import {
  compareFlowNodesByVisualOrder,
  resolveFlowRolePriority,
  toFlowLogicalPosition,
} from "./diagram-layout-flow-geometry";

function createNodeMap(nodes: DiagramLayoutNode[]) {
  return new Map(nodes.map((node) => [node.id, node] as const));
}

function addMapSetValue(map: Map<string, Set<string>>, key: string, value: string) {
  const current = map.get(key) ?? new Set<string>();
  const sizeBefore = current.size;
  current.add(value);
  map.set(key, current);
  return current.size !== sizeBefore;
}

function mapSetToSortedLists(
  map: Map<string, Set<string>>,
  compare = (valueA: string, valueB: string) => valueA.localeCompare(valueB),
) {
  const next = new Map<string, string[]>();

  for (const [key, values] of map.entries()) {
    next.set(key, [...values].sort(compare));
  }

  return next;
}

function compareFlowTargetIds(input: {
  sourceNode: DiagramLayoutNode;
  targetIdA: string;
  targetIdB: string;
  nodeMap: Map<string, DiagramLayoutNode>;
  flowTargetsBySource: Map<string, string[]>;
  dependsTargetsBySource: Map<string, string[]>;
  direction: FlowDirection;
}) {
  const targetNodeA = input.nodeMap.get(input.targetIdA);
  const targetNodeB = input.nodeMap.get(input.targetIdB);

  if (!targetNodeA || !targetNodeB) {
    return input.targetIdA.localeCompare(input.targetIdB);
  }

  const continuationScoreA =
    (input.flowTargetsBySource.get(targetNodeA.id)?.length ?? 0) +
    (input.dependsTargetsBySource.get(targetNodeA.id)?.length ?? 0);
  const continuationScoreB =
    (input.flowTargetsBySource.get(targetNodeB.id)?.length ?? 0) +
    (input.dependsTargetsBySource.get(targetNodeB.id)?.length ?? 0);

  if (continuationScoreA !== continuationScoreB) {
    return continuationScoreB - continuationScoreA;
  }

  const sourceLogicalPosition = toFlowLogicalPosition(
    input.sourceNode.position,
    input.direction,
  );
  const targetLogicalPositionA = toFlowLogicalPosition(
    targetNodeA.position,
    input.direction,
  );
  const targetLogicalPositionB = toFlowLogicalPosition(
    targetNodeB.position,
    input.direction,
  );
  const idealPrimaryDelta =
    resolveDefaultFlowLogicalFootprint(input.direction).primarySpan +
    FLOW_INSERT_LAYOUT.trunkPrimaryGap;
  const secondaryDistanceDifference =
    Math.abs(targetLogicalPositionA.secondary - sourceLogicalPosition.secondary) -
    Math.abs(targetLogicalPositionB.secondary - sourceLogicalPosition.secondary);

  if (secondaryDistanceDifference !== 0) {
    return secondaryDistanceDifference;
  }

  const primaryDistanceDifference =
    Math.abs(targetLogicalPositionA.primary - sourceLogicalPosition.primary - idealPrimaryDelta) -
    Math.abs(targetLogicalPositionB.primary - sourceLogicalPosition.primary - idealPrimaryDelta);

  if (primaryDistanceDifference !== 0) {
    return primaryDistanceDifference;
  }

  const rolePriorityDifference =
    resolveFlowRolePriority(targetNodeA) - resolveFlowRolePriority(targetNodeB);
  if (rolePriorityDifference !== 0) {
    return rolePriorityDifference;
  }

  return compareFlowNodesByVisualOrder(targetNodeA, targetNodeB, input.direction);
}

export function buildFlowTopology(
  nodes: DiagramLayoutNode[],
  edges: DiagramLayoutEdge[],
  direction: FlowDirection,
): FlowTopology {
  const orderedNodes = [...nodes].sort((nodeA, nodeB) =>
    compareFlowNodesByVisualOrder(nodeA, nodeB, direction),
  );
  const nodeMap = createNodeMap(orderedNodes);
  const allFlowNodesAreNotes = orderedNodes.every((node) => isFlowNoteNode(node));
  const nonNoteNodes = allFlowNodesAreNotes
    ? orderedNodes
    : orderedNodes.filter((node) => !isFlowNoteNode(node));
  const noteNodes = allFlowNodesAreNotes
    ? []
    : orderedNodes.filter((node) => isFlowNoteNode(node));
  const incomingFlowByNodeId = new Map<string, number>(
    nonNoteNodes.map((node) => [node.id, 0] as const),
  );
  const incomingDependsByNodeId = new Map<string, number>(
    nonNoteNodes.map((node) => [node.id, 0] as const),
  );
  const logicalFootprintByNodeId = new Map<string, FlowLogicalFootprint>(
    orderedNodes.map((node) => [
      node.id,
      resolveFlowLogicalFootprint({
        direction,
        node,
      }),
    ]),
  );

  const flowTargetSetsBySource = new Map<string, Set<string>>();
  const dependsTargetSetsBySource = new Map<string, Set<string>>();
  const referenceHostSetsByNoteId = new Map<string, Set<string>>();
  const noteIdSetsByHost = new Map<string, Set<string>>();

  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.sourceNodeId);
    const targetNode = nodeMap.get(edge.targetNodeId);
    if (!sourceNode || !targetNode) {
      continue;
    }

    if (
      edge.kind === "flows-to" &&
      !isFlowNoteNode(sourceNode) &&
      !isFlowNoteNode(targetNode)
    ) {
      if (addMapSetValue(flowTargetSetsBySource, sourceNode.id, targetNode.id)) {
        incomingFlowByNodeId.set(
          targetNode.id,
          (incomingFlowByNodeId.get(targetNode.id) ?? 0) + 1,
        );
      }
      continue;
    }

    if (
      edge.kind === "depends-on" &&
      !isFlowNoteNode(sourceNode) &&
      !isFlowNoteNode(targetNode)
    ) {
      if (addMapSetValue(dependsTargetSetsBySource, sourceNode.id, targetNode.id)) {
        incomingDependsByNodeId.set(
          targetNode.id,
          (incomingDependsByNodeId.get(targetNode.id) ?? 0) + 1,
        );
      }
      continue;
    }

    if (edge.kind !== "references") {
      continue;
    }

    if (isFlowNoteNode(sourceNode) && !isFlowNoteNode(targetNode)) {
      addMapSetValue(referenceHostSetsByNoteId, sourceNode.id, targetNode.id);
      addMapSetValue(noteIdSetsByHost, targetNode.id, sourceNode.id);
    }

    if (!isFlowNoteNode(sourceNode) && isFlowNoteNode(targetNode)) {
      addMapSetValue(referenceHostSetsByNoteId, targetNode.id, sourceNode.id);
      addMapSetValue(noteIdSetsByHost, sourceNode.id, targetNode.id);
    }
  }

  const flowTargetsBySource = mapSetToSortedLists(flowTargetSetsBySource);
  const dependsTargetsBySource = mapSetToSortedLists(dependsTargetSetsBySource);
  const referenceHostsByNoteId = mapSetToSortedLists(referenceHostSetsByNoteId);
  const noteIdsByHost = mapSetToSortedLists(noteIdSetsByHost);

  for (const [sourceNodeId, targetIds] of flowTargetsBySource.entries()) {
    const sourceNode = nodeMap.get(sourceNodeId);
    if (!sourceNode) {
      continue;
    }

    targetIds.sort((targetIdA, targetIdB) =>
      compareFlowTargetIds({
        sourceNode,
        targetIdA,
        targetIdB,
        nodeMap,
        flowTargetsBySource,
        dependsTargetsBySource,
        direction,
      }),
    );
  }

  for (const [sourceNodeId, targetIds] of dependsTargetsBySource.entries()) {
    const sourceNode = nodeMap.get(sourceNodeId);
    if (!sourceNode) {
      continue;
    }

    targetIds.sort((targetIdA, targetIdB) =>
      compareFlowTargetIds({
        sourceNode,
        targetIdA,
        targetIdB,
        nodeMap,
        flowTargetsBySource,
        dependsTargetsBySource,
        direction,
      }),
    );
  }

  return {
    orderedNodes,
    nodeMap,
    nonNoteNodes,
    noteNodes,
    flowTargetsBySource,
    dependsTargetsBySource,
    incomingFlowByNodeId,
    incomingDependsByNodeId,
    referenceHostsByNoteId,
    noteIdsByHost,
    logicalFootprintByNodeId,
  };
}
