import type { EdgeKind, NodeKind } from "@/src/domain";
import type { DiagramRole } from "@/src/modules/diagrams/domain";
import type { DiagramType } from "@/src/modules/graph/domain";
import {
  computeFlowInsertPosition,
  computeFlowReflow,
} from "./diagram-layout-flow";

export { computeFlowContextualNudgePositions } from "./diagram-layout-flow";

export type DiagramLayoutType =
  | DiagramType
  | "erd"
  | "sitemap"
  | "graph"
  | "timeline"
  | undefined;

export type DiagramLayoutNode = {
  id: string;
  kind: NodeKind;
  diagramRole?: DiagramRole;
  position: {
    x: number;
    y: number;
  };
};

export type DiagramLayoutEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: EdgeKind;
};

export type DiagramLayoutViewport = {
  x: number;
  y: number;
  zoom: number;
  width?: number;
  height?: number;
};

const DEFAULT_INSERT_OFFSET = {
  x: 220,
  y: 64,
};

const TREE_SPACING = {
  x: 260,
  y: 220,
};

const TIMELINE_SPACING = {
  x: 320,
  y: 170,
};

const MINDMAP_RING_STEP = 240;
const MINDMAP_INSERT_RADIUS = 260;

const GRAPH_RING_STEP = 228;
const GRAPH_INSERT_RADIUS = 188;

const ERD_GRID_SPACING = {
  x: 340,
  y: 220,
};

function resolveDirection(
  diagramType: DiagramLayoutType,
  layoutOptions: unknown,
): "top-down" | "left-right" {
  const defaultDirection =
    diagramType === "flow" || diagramType === "timeline" ? "left-right" : "top-down";

  if (!layoutOptions || typeof layoutOptions !== "object" || Array.isArray(layoutOptions)) {
    return defaultDirection;
  }

  const direction = (layoutOptions as { direction?: unknown }).direction;
  if (direction === "left-right") {
    return "left-right";
  }

  if (direction === "top-down") {
    return "top-down";
  }

  return defaultDirection;
}

function roundPosition(position: { x: number; y: number }) {
  return {
    x: Number(position.x.toFixed(2)),
    y: Number(position.y.toFixed(2)),
  };
}

function createNodeMap(nodes: DiagramLayoutNode[]) {
  return new Map(nodes.map((node) => [node.id, node] as const));
}

function sortNodesForDeterminism(nodes: DiagramLayoutNode[]) {
  return [...nodes].sort((nodeA, nodeB) => {
    if (nodeA.position.y !== nodeB.position.y) {
      return nodeA.position.y - nodeB.position.y;
    }

    if (nodeA.position.x !== nodeB.position.x) {
      return nodeA.position.x - nodeB.position.x;
    }

    return nodeA.id.localeCompare(nodeB.id);
  });
}

function resolveViewportCenter(
  nodes: DiagramLayoutNode[],
  viewport: DiagramLayoutViewport,
) {
  const hasCanvasSize =
    typeof viewport.width === "number" &&
    Number.isFinite(viewport.width) &&
    viewport.width > 0 &&
    typeof viewport.height === "number" &&
    Number.isFinite(viewport.height) &&
    viewport.height > 0;

  if (hasCanvasSize) {
    return roundPosition({
      x: (viewport.width! / 2 - viewport.x) / viewport.zoom,
      y: (viewport.height! / 2 - viewport.y) / viewport.zoom,
    });
  }

  const fallbackOffset = nodes.length * 28;
  return roundPosition({
    x: 120 + fallbackOffset,
    y: 120 + fallbackOffset / 2,
  });
}

function resolveMindmapRootNode(
  nodes: DiagramLayoutNode[],
): DiagramLayoutNode | undefined {
  return [...nodes]
    .sort(
      (nodeA, nodeB) =>
        Math.hypot(nodeA.position.x, nodeA.position.y) -
        Math.hypot(nodeB.position.x, nodeB.position.y),
    )
    .at(0);
}

function normalizeAngle(angle: number) {
  if (angle < 0) {
    return angle + Math.PI * 2;
  }

  if (angle >= Math.PI * 2) {
    return angle - Math.PI * 2;
  }

  return angle;
}

function resolveLargestFreeAngle(input: {
  anchorNode: DiagramLayoutNode;
  nodes: DiagramLayoutNode[];
}) {
  const occupiedAngles = input.nodes
    .filter((node) => node.id !== input.anchorNode.id)
    .map((node) =>
      normalizeAngle(
        Math.atan2(
          node.position.y - input.anchorNode.position.y,
          node.position.x - input.anchorNode.position.x,
        ),
      ),
    )
    .sort((angleA, angleB) => angleA - angleB);

  if (occupiedAngles.length === 0) {
    return 0;
  }

  if (occupiedAngles.length === 1) {
    return normalizeAngle(occupiedAngles[0] + Math.PI);
  }

  let largestGap = -1;
  let bestMidpoint = occupiedAngles[0];
  for (let index = 0; index < occupiedAngles.length; index += 1) {
    const current = occupiedAngles[index];
    const next =
      index === occupiedAngles.length - 1
        ? occupiedAngles[0] + Math.PI * 2
        : occupiedAngles[index + 1];
    const gap = next - current;

    if (gap > largestGap) {
      largestGap = gap;
      bestMidpoint = normalizeAngle(current + gap / 2);
    }
  }

  return bestMidpoint;
}

function isSlotFree(
  candidate: { x: number; y: number },
  nodes: DiagramLayoutNode[],
  minDistance: number,
) {
  return nodes.every(
    (node) =>
      Math.hypot(node.position.x - candidate.x, node.position.y - candidate.y) >=
      minDistance,
  );
}

function isErdSlotFree(
  candidate: { x: number; y: number },
  nodes: DiagramLayoutNode[],
) {
  const collisionWidth = 260;
  const collisionHeight = 170;

  return nodes.every(
    (node) =>
      Math.abs(node.position.x - candidate.x) >= collisionWidth ||
      Math.abs(node.position.y - candidate.y) >= collisionHeight,
  );
}

function resolveErdInsertionSlot(input: {
  anchorPosition: { x: number; y: number };
  nodes: DiagramLayoutNode[];
}) {
  for (let ring = 1; ring <= 5; ring += 1) {
    for (let row = -ring; row <= ring; row += 1) {
      const candidate = {
        x: input.anchorPosition.x + ring * ERD_GRID_SPACING.x,
        y: input.anchorPosition.y + row * ERD_GRID_SPACING.y,
      };

      if (isErdSlotFree(candidate, input.nodes)) {
        return roundPosition(candidate);
      }
    }

    for (let column = ring - 1; column >= 0; column -= 1) {
      const candidate = {
        x: input.anchorPosition.x + column * ERD_GRID_SPACING.x,
        y: input.anchorPosition.y + ring * ERD_GRID_SPACING.y,
      };
      if (isErdSlotFree(candidate, input.nodes)) {
        return roundPosition(candidate);
      }
    }
  }

  return roundPosition({
    x: input.anchorPosition.x + ERD_GRID_SPACING.x,
    y: input.anchorPosition.y,
  });
}

function resolveTreeRootId(nodes: DiagramLayoutNode[], edges: DiagramLayoutEdge[]) {
  const containsEdges = edges.filter((edge) => edge.kind === "contains");
  const targetIds = new Set(containsEdges.map((edge) => edge.targetNodeId));
  const rootCandidate = sortNodesForDeterminism(nodes).find(
    (node) => !targetIds.has(node.id),
  );

  return rootCandidate?.id ?? sortNodesForDeterminism(nodes)[0]?.id;
}

function layoutTree(
  nodes: DiagramLayoutNode[],
  edges: DiagramLayoutEdge[],
  rootId?: string,
  direction: "top-down" | "left-right" = "top-down",
) {
  const positions: Record<string, { x: number; y: number }> = {};
  if (nodes.length === 0) {
    return positions;
  }

  const orderedNodes = sortNodesForDeterminism(nodes);
  const validNodeIds = new Set(orderedNodes.map((node) => node.id));
  const childrenByParent = new Map<string, string[]>();
  const containsEdges = edges.filter(
    (edge) =>
      edge.kind === "contains" &&
      validNodeIds.has(edge.sourceNodeId) &&
      validNodeIds.has(edge.targetNodeId),
  );

  for (const edge of containsEdges) {
    const currentChildren = childrenByParent.get(edge.sourceNodeId) ?? [];
    currentChildren.push(edge.targetNodeId);
    currentChildren.sort();
    childrenByParent.set(edge.sourceNodeId, currentChildren);
  }

  const effectiveRootId =
    (rootId && validNodeIds.has(rootId) ? rootId : undefined) ??
    resolveTreeRootId(orderedNodes, containsEdges);
  if (!effectiveRootId) {
    return positions;
  }

  const levels = new Map<number, string[]>();
  const queue: Array<{ id: string; level: number }> = [
    { id: effectiveRootId, level: 0 },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) {
      continue;
    }

    visited.add(current.id);
    const levelNodes = levels.get(current.level) ?? [];
    levelNodes.push(current.id);
    levels.set(current.level, levelNodes);

    const children = childrenByParent.get(current.id) ?? [];
    for (const childId of children) {
      if (!visited.has(childId)) {
        queue.push({ id: childId, level: current.level + 1 });
      }
    }
  }

  const maxLevel = Math.max(...levels.keys());
  for (let level = 0; level <= maxLevel; level += 1) {
    const levelNodes = (levels.get(level) ?? []).sort();
    if (levelNodes.length === 0) {
      continue;
    }

    const startX = -((levelNodes.length - 1) * TREE_SPACING.x) / 2;
    for (let index = 0; index < levelNodes.length; index += 1) {
      const nodeId = levelNodes[index];
      positions[nodeId] = roundPosition(
        direction === "left-right"
          ? {
              x: level * TREE_SPACING.x,
              y: startX + index * TREE_SPACING.y,
            }
          : {
              x: startX + index * TREE_SPACING.x,
              y: level * TREE_SPACING.y,
            },
      );
    }
  }

  const disconnected = orderedNodes
    .map((node) => node.id)
    .filter((nodeId) => !visited.has(nodeId));
  const disconnectedStartY = (maxLevel + 1) * TREE_SPACING.y + TREE_SPACING.y;

  disconnected.forEach((nodeId, index) => {
    positions[nodeId] = roundPosition(
      direction === "left-right"
        ? {
            x: disconnectedStartY,
            y: index * TREE_SPACING.y,
          }
        : {
            x: index * TREE_SPACING.x,
            y: disconnectedStartY,
          },
    );
  });

  return positions;
}

function layoutMindmap(
  nodes: DiagramLayoutNode[],
  edges: DiagramLayoutEdge[],
  rootId?: string,
) {
  const positions: Record<string, { x: number; y: number }> = {};
  if (nodes.length === 0) {
    return positions;
  }

  const orderedNodes = sortNodesForDeterminism(nodes);
  const rootNode =
    (rootId ? orderedNodes.find((node) => node.id === rootId) : undefined) ??
    resolveMindmapRootNode(orderedNodes) ??
    orderedNodes[0];
  if (!rootNode) {
    return positions;
  }

  positions[rootNode.id] = { x: 0, y: 0 };
  const nodeMap = createNodeMap(orderedNodes);
  const adjacency = new Map<string, Set<string>>();

  for (const node of orderedNodes) {
    adjacency.set(node.id, new Set());
  }

  for (const edge of edges) {
    if (!nodeMap.has(edge.sourceNodeId) || !nodeMap.has(edge.targetNodeId)) {
      continue;
    }

    adjacency.get(edge.sourceNodeId)?.add(edge.targetNodeId);
    adjacency.get(edge.targetNodeId)?.add(edge.sourceNodeId);
  }

  const levels = new Map<number, string[]>();
  const queue: Array<{ id: string; level: number }> = [
    { id: rootNode.id, level: 0 },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) {
      continue;
    }

    visited.add(current.id);
    const levelNodes = levels.get(current.level) ?? [];
    levelNodes.push(current.id);
    levels.set(current.level, levelNodes.sort());

    const neighbors = adjacency.get(current.id);
    if (!neighbors) {
      continue;
    }

    for (const neighborId of [...neighbors].sort()) {
      if (!visited.has(neighborId)) {
        queue.push({ id: neighborId, level: current.level + 1 });
      }
    }
  }

  const disconnected = orderedNodes
    .map((node) => node.id)
    .filter((nodeId) => !visited.has(nodeId));
  if (disconnected.length > 0) {
    levels.set(1, [...(levels.get(1) ?? []), ...disconnected].sort());
  }

  for (const [level, levelNodes] of [...levels.entries()].sort(
    ([levelA], [levelB]) => levelA - levelB,
  )) {
    if (level === 0) {
      continue;
    }

    const radius = MINDMAP_RING_STEP * level;
    const angleStep = (Math.PI * 2) / Math.max(levelNodes.length, 1);
    const startAngle = -Math.PI / 2;
    for (let index = 0; index < levelNodes.length; index += 1) {
      const nodeId = levelNodes[index];
      positions[nodeId] = roundPosition({
        x: Math.cos(startAngle + angleStep * index) * radius,
        y: Math.sin(startAngle + angleStep * index) * radius,
      });
    }
  }

  return positions;
}

function layoutErd(nodes: DiagramLayoutNode[]) {
  const positions: Record<string, { x: number; y: number }> = {};
  if (nodes.length === 0) {
    return positions;
  }

  const orderedNodes = sortNodesForDeterminism(nodes);
  const columns = Math.max(2, Math.min(4, Math.ceil(Math.sqrt(nodes.length))));

  for (let index = 0; index < orderedNodes.length; index += 1) {
    const node = orderedNodes[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const centeredColumn = column - (columns - 1) / 2;

    positions[node.id] = roundPosition({
      x: centeredColumn * ERD_GRID_SPACING.x,
      y: row * ERD_GRID_SPACING.y,
    });
  }

  return positions;
}

function buildUndirectedAdjacency(
  nodes: DiagramLayoutNode[],
  edges: DiagramLayoutEdge[],
) {
  const nodeMap = createNodeMap(nodes);
  const adjacency = new Map<string, Set<string>>();

  for (const node of nodes) {
    adjacency.set(node.id, new Set<string>());
  }

  for (const edge of edges) {
    if (!nodeMap.has(edge.sourceNodeId) || !nodeMap.has(edge.targetNodeId)) {
      continue;
    }

    adjacency.get(edge.sourceNodeId)?.add(edge.targetNodeId);
    adjacency.get(edge.targetNodeId)?.add(edge.sourceNodeId);
  }

  return adjacency;
}

function resolveGraphCenterId(
  nodes: DiagramLayoutNode[],
  edges: DiagramLayoutEdge[],
) {
  if (nodes.length === 0) {
    return undefined;
  }

  const explicitCore = nodes.find((node) => node.diagramRole === "graph-core");
  if (explicitCore) {
    return explicitCore.id;
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const degreeByNode = new Map<string, number>(
    nodes.map((node) => [node.id, 0]),
  );

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      continue;
    }

    degreeByNode.set(
      edge.sourceNodeId,
      (degreeByNode.get(edge.sourceNodeId) ?? 0) + 1,
    );
    degreeByNode.set(
      edge.targetNodeId,
      (degreeByNode.get(edge.targetNodeId) ?? 0) + 1,
    );
  }

  return [...degreeByNode.entries()]
    .sort((entryA, entryB) => {
      if (entryA[1] !== entryB[1]) {
        return entryB[1] - entryA[1];
      }

      return entryA[0].localeCompare(entryB[0]);
    })[0]?.[0];
}

function layoutGraph(nodes: DiagramLayoutNode[], edges: DiagramLayoutEdge[]) {
  const positions: Record<string, { x: number; y: number }> = {};
  if (nodes.length === 0) {
    return positions;
  }

  const orderedNodes = sortNodesForDeterminism(nodes);
  const adjacency = buildUndirectedAdjacency(orderedNodes, edges);
  const centerNodeId = resolveGraphCenterId(orderedNodes, edges) ?? orderedNodes[0]?.id;
  if (!centerNodeId) {
    return positions;
  }

  const ringByNode = new Map<string, number>([[centerNodeId, 0]]);
  const queue = [centerNodeId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    const currentRing = ringByNode.get(currentId) ?? 0;
    const neighbors = [...(adjacency.get(currentId) ?? [])].sort();

    for (const neighborId of neighbors) {
      if (ringByNode.has(neighborId)) {
        continue;
      }

      ringByNode.set(neighborId, currentRing + 1);
      queue.push(neighborId);
    }
  }

  const maxRingFromConnected =
    ringByNode.size > 0 ? Math.max(...ringByNode.values()) : 0;
  const disconnected = orderedNodes
    .map((node) => node.id)
    .filter((nodeId) => !ringByNode.has(nodeId));
  disconnected.forEach((nodeId, index) => {
    ringByNode.set(nodeId, maxRingFromConnected + 1 + Math.floor(index / 6));
  });

  positions[centerNodeId] = { x: 0, y: 0 };
  const ringGroups = new Map<number, string[]>();
  for (const [nodeId, ring] of ringByNode.entries()) {
    if (ring === 0) {
      continue;
    }

    const group = ringGroups.get(ring) ?? [];
    group.push(nodeId);
    ringGroups.set(ring, group);
  }

  const degreeByNode = new Map<string, number>();
  for (const node of orderedNodes) {
    degreeByNode.set(node.id, adjacency.get(node.id)?.size ?? 0);
  }

  for (const ring of [...ringGroups.keys()].sort((a, b) => a - b)) {
    const ringNodes = (ringGroups.get(ring) ?? []).sort((nodeA, nodeB) => {
      const degreeA = degreeByNode.get(nodeA) ?? 0;
      const degreeB = degreeByNode.get(nodeB) ?? 0;
      if (degreeA !== degreeB) {
        return degreeB - degreeA;
      }
      return nodeA.localeCompare(nodeB);
    });
    const supportNodes = ringNodes.filter(
      (nodeId) =>
        orderedNodes.find((node) => node.id === nodeId)?.diagramRole ===
        "graph-supporting",
    );
    const primaryNodes = ringNodes.filter((nodeId) => !supportNodes.includes(nodeId));

    const radius = GRAPH_RING_STEP * ring;
    const primaryAngleStep = primaryNodes.length
      ? (Math.PI * 1.15) / Math.max(primaryNodes.length - 1, 1)
      : 0;
    const primaryStartAngle = primaryNodes.length <= 1 ? -Math.PI / 2 : -Math.PI * 0.85;

    for (let index = 0; index < primaryNodes.length; index += 1) {
      const nodeId = primaryNodes[index];
      const angle =
        primaryNodes.length === 1
          ? -Math.PI / 2
          : primaryStartAngle + primaryAngleStep * index;

      positions[nodeId] = roundPosition({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius + (index % 2 === 0 ? -18 : 14),
      });
    }

    const supportRadius = radius + 86;
    const supportAngleStep = supportNodes.length
      ? (Math.PI * 0.62) / Math.max(supportNodes.length - 1, 1)
      : 0;
    const supportStartAngle = supportNodes.length <= 1 ? Math.PI * 0.55 : Math.PI * 0.28;

    for (let index = 0; index < supportNodes.length; index += 1) {
      const nodeId = supportNodes[index];
      const angle =
        supportNodes.length === 1
          ? Math.PI * 0.55
          : supportStartAngle + supportAngleStep * index;

      positions[nodeId] = roundPosition({
        x: Math.cos(angle) * supportRadius,
        y: Math.sin(angle) * supportRadius + 44,
      });
    }
  }

  return positions;
}

function resolveGraphInsertionSlot(input: {
  anchorNode: DiagramLayoutNode;
  nodes: DiagramLayoutNode[];
}) {
  const preferredAngle = resolveLargestFreeAngle({
    anchorNode: input.anchorNode,
    nodes: input.nodes,
  });

  for (let ring = 1; ring <= 5; ring += 1) {
    const radius = GRAPH_INSERT_RADIUS + (ring - 1) * 72;
    const candidate = {
      x: input.anchorNode.position.x + Math.cos(preferredAngle) * radius,
      y: input.anchorNode.position.y + Math.sin(preferredAngle) * radius,
    };

    if (isSlotFree(candidate, input.nodes, 150)) {
      return roundPosition(candidate);
    }
  }

  return roundPosition({
    x: input.anchorNode.position.x + GRAPH_INSERT_RADIUS,
    y: input.anchorNode.position.y,
  });
}

function layoutTimeline(
  nodes: DiagramLayoutNode[],
  edges: DiagramLayoutEdge[],
  direction: "top-down" | "left-right" = "left-right",
) {
  const positions: Record<string, { x: number; y: number }> = {};
  if (nodes.length === 0) {
    return positions;
  }

  const orderedNodes = sortNodesForDeterminism(nodes);
  const nodeMap = createNodeMap(orderedNodes);
  const rankByNodeId = new Map(orderedNodes.map((node, index) => [node.id, index] as const));
  const readyQueueSort = (nodeIdA: string, nodeIdB: string) => {
    const rankDifference = (rankByNodeId.get(nodeIdA) ?? 0) - (rankByNodeId.get(nodeIdB) ?? 0);
    if (rankDifference !== 0) {
      return rankDifference;
    }

    return nodeIdA.localeCompare(nodeIdB);
  };
  const outgoingBySource = new Map<string, Set<string>>();
  const incomingByNodeId = new Map<string, number>(
    orderedNodes.map((node) => [node.id, 0] as const),
  );

  for (const edge of edges) {
    if (edge.kind !== "flows-to") {
      continue;
    }

    if (!nodeMap.has(edge.sourceNodeId) || !nodeMap.has(edge.targetNodeId)) {
      continue;
    }

    const targets = outgoingBySource.get(edge.sourceNodeId) ?? new Set<string>();
    if (targets.has(edge.targetNodeId)) {
      continue;
    }

    targets.add(edge.targetNodeId);
    outgoingBySource.set(edge.sourceNodeId, targets);
    incomingByNodeId.set(
      edge.targetNodeId,
      (incomingByNodeId.get(edge.targetNodeId) ?? 0) + 1,
    );
  }

  const pendingIncomingByNodeId = new Map(incomingByNodeId);
  const readyQueue = orderedNodes
    .map((node) => node.id)
    .filter((nodeId) => (pendingIncomingByNodeId.get(nodeId) ?? 0) === 0)
    .sort(readyQueueSort);
  const orderedTimelineIds: string[] = [];

  while (readyQueue.length > 0) {
    const currentNodeId = readyQueue.shift();
    if (!currentNodeId) {
      continue;
    }

    orderedTimelineIds.push(currentNodeId);
    const sortedTargets = [...(outgoingBySource.get(currentNodeId) ?? [])].sort(readyQueueSort);
    for (const targetNodeId of sortedTargets) {
      const remainingIncoming = (pendingIncomingByNodeId.get(targetNodeId) ?? 0) - 1;
      pendingIncomingByNodeId.set(targetNodeId, remainingIncoming);
      if (remainingIncoming === 0) {
        readyQueue.push(targetNodeId);
        readyQueue.sort(readyQueueSort);
      }
    }
  }

  for (const nodeId of orderedNodes.map((node) => node.id)) {
    if (!orderedTimelineIds.includes(nodeId)) {
      orderedTimelineIds.push(nodeId);
    }
  }

  orderedTimelineIds.forEach((nodeId, index) => {
    const primary = index * TIMELINE_SPACING.x;
    positions[nodeId] = roundPosition(
      direction === "left-right"
        ? {
            x: primary,
            y: 0,
          }
        : {
            x: 0,
            y: primary,
          },
    );
  });

  return positions;
}

export function computeInsertPosition(
  diagramType: DiagramLayoutType,
  referenceNode: DiagramLayoutNode | null,
  nodes: DiagramLayoutNode[],
  viewport: DiagramLayoutViewport,
  layoutOptions?: unknown,
) {
  if (!referenceNode) {
    return resolveViewportCenter(nodes, viewport);
  }

  if (diagramType === "tree") {
    const direction = resolveDirection("tree", layoutOptions);
    return roundPosition({
      ...(direction === "left-right"
        ? {
            x: referenceNode.position.x + TREE_SPACING.x,
            y: referenceNode.position.y,
          }
        : {
            x: referenceNode.position.x,
            y: referenceNode.position.y + TREE_SPACING.y,
          }),
    });
  }

  if (diagramType === "sitemap") {
    const direction = resolveDirection("sitemap", layoutOptions);
    return roundPosition({
      ...(direction === "left-right"
        ? {
            x: referenceNode.position.x + TREE_SPACING.x,
            y: referenceNode.position.y,
          }
        : {
            x: referenceNode.position.x,
            y: referenceNode.position.y + TREE_SPACING.y,
          }),
    });
  }

  if (diagramType === "flow") {
    return computeFlowInsertPosition({
      anchorNode: referenceNode,
      nodes,
      layoutOptions,
    });
  }

  if (diagramType === "mindmap") {
    const anchorNode = resolveMindmapRootNode(nodes) ?? referenceNode;
    const angle = resolveLargestFreeAngle({
      anchorNode,
      nodes,
    });

    return roundPosition({
      x: anchorNode.position.x + Math.cos(angle) * MINDMAP_INSERT_RADIUS,
      y: anchorNode.position.y + Math.sin(angle) * MINDMAP_INSERT_RADIUS,
    });
  }

  if (diagramType === "erd") {
    return resolveErdInsertionSlot({
      anchorPosition: referenceNode.position,
      nodes,
    });
  }

  if (diagramType === "timeline") {
    const direction = resolveDirection("timeline", layoutOptions);
    return roundPosition({
      ...(direction === "left-right"
        ? {
            x: referenceNode.position.x + TIMELINE_SPACING.x,
            y: referenceNode.position.y,
          }
        : {
            x: referenceNode.position.x,
            y: referenceNode.position.y + TIMELINE_SPACING.x,
          }),
    });
  }

  if (diagramType === "graph") {
    return resolveGraphInsertionSlot({
      anchorNode: referenceNode,
      nodes,
    });
  }

  return roundPosition({
    x: referenceNode.position.x + DEFAULT_INSERT_OFFSET.x,
    y: referenceNode.position.y + DEFAULT_INSERT_OFFSET.y,
  });
}

export function computeReflow(
  diagramType: DiagramLayoutType,
  nodes: DiagramLayoutNode[],
  edges: DiagramLayoutEdge[],
  rootId?: string | null,
  layoutOptions?: unknown,
) {
  if (diagramType === "tree") {
    return layoutTree(
      nodes,
      edges,
      rootId ?? undefined,
      resolveDirection("tree", layoutOptions),
    );
  }

  if (diagramType === "flow") {
    return computeFlowReflow(nodes, edges, resolveDirection("flow", layoutOptions));
  }

  if (diagramType === "mindmap") {
    return layoutMindmap(nodes, edges, rootId ?? undefined);
  }

  if (diagramType === "sitemap") {
    return layoutTree(
      nodes,
      edges,
      rootId ?? undefined,
      resolveDirection("sitemap", layoutOptions),
    );
  }

  if (diagramType === "erd") {
    return layoutErd(nodes);
  }

  if (diagramType === "graph") {
    return layoutGraph(nodes, edges);
  }

  if (diagramType === "timeline") {
    return layoutTimeline(
      nodes,
      edges,
      resolveDirection("timeline", layoutOptions),
    );
  }

  return nodes.reduce<Record<string, { x: number; y: number }>>((acc, node) => {
    acc[node.id] = roundPosition(node.position);
    return acc;
  }, {});
}

