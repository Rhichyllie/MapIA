import type { EdgeKind, NodeKind } from "@/src/domain";
import type { DiagramType } from "@/src/modules/graph/domain";

export type DiagramLayoutType = DiagramType | "erd" | undefined;

export type DiagramLayoutNode = {
  id: string;
  kind: NodeKind;
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

const FLOW_SPACING = {
  x: 280,
  y: 190,
};

const MINDMAP_RING_STEP = 240;
const MINDMAP_INSERT_RADIUS = 260;

const ERD_GRID_SPACING = {
  x: 340,
  y: 220,
};

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
      positions[nodeId] = roundPosition({
        x: startX + index * TREE_SPACING.x,
        y: level * TREE_SPACING.y,
      });
    }
  }

  const disconnected = orderedNodes
    .map((node) => node.id)
    .filter((nodeId) => !visited.has(nodeId));
  const disconnectedStartY = (maxLevel + 1) * TREE_SPACING.y + TREE_SPACING.y;

  disconnected.forEach((nodeId, index) => {
    positions[nodeId] = roundPosition({
      x: index * TREE_SPACING.x,
      y: disconnectedStartY,
    });
  });

  return positions;
}

function layoutFlow(nodes: DiagramLayoutNode[], edges: DiagramLayoutEdge[]) {
  const positions: Record<string, { x: number; y: number }> = {};
  if (nodes.length === 0) {
    return positions;
  }

  const orderedNodes = sortNodesForDeterminism(nodes);
  const nodeIds = orderedNodes.map((node) => node.id);
  const incoming = new Map<string, number>(nodeIds.map((nodeId) => [nodeId, 0]));
  const flowsBySource = new Map<string, string[]>();
  const dependsBySource = new Map<string, string[]>();

  for (const edge of edges) {
    if (!incoming.has(edge.sourceNodeId) || !incoming.has(edge.targetNodeId)) {
      continue;
    }

    if (edge.kind === "flows-to") {
      const nextTargets = flowsBySource.get(edge.sourceNodeId) ?? [];
      nextTargets.push(edge.targetNodeId);
      nextTargets.sort();
      flowsBySource.set(edge.sourceNodeId, nextTargets);
      incoming.set(edge.targetNodeId, (incoming.get(edge.targetNodeId) ?? 0) + 1);
      continue;
    }

    if (edge.kind === "depends-on") {
      const nextTargets = dependsBySource.get(edge.sourceNodeId) ?? [];
      nextTargets.push(edge.targetNodeId);
      nextTargets.sort();
      dependsBySource.set(edge.sourceNodeId, nextTargets);
    }
  }

  const queue = nodeIds
    .filter((nodeId) => (incoming.get(nodeId) ?? 0) === 0)
    .sort()
    .map((nodeId) => ({ nodeId, column: 0 }));
  const visited = new Set<string>();
  const columnByNode = new Map<string, number>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    if (visited.has(current.nodeId)) {
      columnByNode.set(
        current.nodeId,
        Math.max(columnByNode.get(current.nodeId) ?? 0, current.column),
      );
      continue;
    }

    visited.add(current.nodeId);
    columnByNode.set(current.nodeId, current.column);

    const nextByFlow = flowsBySource.get(current.nodeId) ?? [];
    for (const targetId of nextByFlow) {
      incoming.set(targetId, (incoming.get(targetId) ?? 1) - 1);
      const nextColumn = current.column + 1;
      if ((incoming.get(targetId) ?? 0) <= 0) {
        queue.push({ nodeId: targetId, column: nextColumn });
      } else {
        columnByNode.set(
          targetId,
          Math.max(columnByNode.get(targetId) ?? 0, nextColumn),
        );
      }
    }
  }

  for (const [sourceId, targetIds] of dependsBySource.entries()) {
    const sourceColumn = columnByNode.get(sourceId) ?? 0;
    for (const targetId of targetIds) {
      columnByNode.set(
        targetId,
        Math.max(columnByNode.get(targetId) ?? 0, sourceColumn + 1),
      );
    }
  }

  let fallbackColumn = 0;
  for (const nodeId of nodeIds) {
    if (columnByNode.has(nodeId)) {
      fallbackColumn = Math.max(fallbackColumn, columnByNode.get(nodeId) ?? 0);
      continue;
    }
    fallbackColumn += 1;
    columnByNode.set(nodeId, fallbackColumn);
  }

  const groupedByColumn = new Map<number, string[]>();
  for (const [nodeId, column] of columnByNode.entries()) {
    const grouped = groupedByColumn.get(column) ?? [];
    grouped.push(nodeId);
    groupedByColumn.set(column, grouped.sort());
  }

  const sortedColumns = [...groupedByColumn.keys()].sort((a, b) => a - b);
  for (const column of sortedColumns) {
    const columnNodes = groupedByColumn.get(column) ?? [];
    const startY = -((columnNodes.length - 1) * FLOW_SPACING.y) / 2;
    for (let index = 0; index < columnNodes.length; index += 1) {
      const nodeId = columnNodes[index];
      positions[nodeId] = roundPosition({
        x: column * FLOW_SPACING.x,
        y: startY + index * FLOW_SPACING.y,
      });
    }
  }

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

export function computeInsertPosition(
  diagramType: DiagramLayoutType,
  referenceNode: DiagramLayoutNode | null,
  nodes: DiagramLayoutNode[],
  viewport: DiagramLayoutViewport,
) {
  if (!referenceNode) {
    return resolveViewportCenter(nodes, viewport);
  }

  if (diagramType === "tree") {
    return roundPosition({
      x: referenceNode.position.x,
      y: referenceNode.position.y + TREE_SPACING.y,
    });
  }

  if (diagramType === "flow") {
    return roundPosition({
      x: referenceNode.position.x + FLOW_SPACING.x,
      y: referenceNode.position.y,
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
) {
  if (diagramType === "tree") {
    return layoutTree(nodes, edges, rootId ?? undefined);
  }

  if (diagramType === "flow") {
    return layoutFlow(nodes, edges);
  }

  if (diagramType === "mindmap") {
    return layoutMindmap(nodes, edges, rootId ?? undefined);
  }

  if (diagramType === "erd") {
    return layoutErd(nodes);
  }

  return nodes.reduce<Record<string, { x: number; y: number }>>((acc, node) => {
    acc[node.id] = roundPosition(node.position);
    return acc;
  }, {});
}
