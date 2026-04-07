import { z } from "zod";
import {
  CanonicalDiagramTypeSchema,
  DiagramViewSchema,
  type CanonicalDiagramType,
  type DiagramView,
  type GraphSnapshot,
} from "@/src/domain";

export const DiagramTypeSchema = CanonicalDiagramTypeSchema;
export const DiagramViewTypeSchema = DiagramViewSchema;
export const AutoLayoutDiagramTypeSchema = z.enum(["tree", "flow", "mindmap"]);
export const LegacyDiagramViewAliasSchema = z.enum([
  "sitemap",
  "flowchart",
  "erd",
  "timeline",
]);
export const DiagramIdentityAliasSchema = z.union([
  DiagramViewTypeSchema,
  LegacyDiagramViewAliasSchema,
]);

const SpacingSchema = z.number().finite().min(24).max(2000);
const DirectionSchema = z.enum(["top-down", "left-right"]);

const TreeLayoutOptionsOverridesSchema = z.object({
  direction: DirectionSchema.optional(),
  nodeSpacingX: SpacingSchema.optional(),
  nodeSpacingY: SpacingSchema.optional(),
});

const FlowLayoutOptionsOverridesSchema = z.object({
  direction: DirectionSchema.optional(),
  nodeSpacingX: SpacingSchema.optional(),
  nodeSpacingY: SpacingSchema.optional(),
});

const MindmapLayoutOptionsOverridesSchema = z.object({
  radialSpacing: SpacingSchema.optional(),
});

export const TreeLayoutOptionsSchema = z.object({
  type: z.literal("tree"),
  direction: DirectionSchema,
  nodeSpacingX: SpacingSchema,
  nodeSpacingY: SpacingSchema,
});

export const FlowLayoutOptionsSchema = z.object({
  type: z.literal("flow"),
  direction: DirectionSchema,
  nodeSpacingX: SpacingSchema,
  nodeSpacingY: SpacingSchema,
});

export const MindmapLayoutOptionsSchema = z.object({
  type: z.literal("mindmap"),
  radialSpacing: SpacingSchema,
});

export const DiagramLayoutOptionsSchema = z.discriminatedUnion("type", [
  TreeLayoutOptionsSchema,
  FlowLayoutOptionsSchema,
  MindmapLayoutOptionsSchema,
]);

export type DiagramType = CanonicalDiagramType;
export type DiagramViewType = DiagramView;
export type AutoLayoutDiagramType = z.infer<typeof AutoLayoutDiagramTypeSchema>;
export type LegacyDiagramViewAlias = z.infer<typeof LegacyDiagramViewAliasSchema>;
export type DiagramIdentityAlias = z.infer<typeof DiagramIdentityAliasSchema>;
export type TreeDirection = z.infer<typeof DirectionSchema>;

export type TreeLayoutOptions = z.infer<typeof TreeLayoutOptionsSchema>;
export type FlowLayoutOptions = z.infer<typeof FlowLayoutOptionsSchema>;
export type MindmapLayoutOptions = z.infer<typeof MindmapLayoutOptionsSchema>;
export type DiagramLayoutOptions = z.infer<typeof DiagramLayoutOptionsSchema>;

export type DiagramLayoutOptionsByType = {
  tree: TreeLayoutOptions;
  flow: FlowLayoutOptions;
  mindmap: MindmapLayoutOptions;
};

type LayoutPosition = { x: number; y: number };
type LayoutNodeInput = { id: string; width?: number; height?: number };
type LayoutEdgeInput = { sourceNodeId: string; targetNodeId: string };

export type DiagramLayoutPositions = Record<string, LayoutPosition>;

type DiagramLayoutRegistryEntry<TType extends AutoLayoutDiagramType> = {
  type: TType;
  label: string;
  defaultOptions: DiagramLayoutOptionsByType[TType];
  applyLayout: (
    nodes: LayoutNodeInput[],
    edges: LayoutEdgeInput[],
    options: DiagramLayoutOptionsByType[TType],
  ) => DiagramLayoutPositions;
};

const TREE_DEFAULT_OPTIONS: TreeLayoutOptions = {
  type: "tree",
  direction: "top-down",
  nodeSpacingX: 240,
  nodeSpacingY: 160,
};

const FLOW_DEFAULT_OPTIONS: FlowLayoutOptions = {
  type: "flow",
  direction: "left-right",
  nodeSpacingX: 280,
  nodeSpacingY: 140,
};

const MINDMAP_DEFAULT_OPTIONS: MindmapLayoutOptions = {
  type: "mindmap",
  radialSpacing: 220,
};

function createEmptyAdjacency(nodeIds: string[]) {
  const map = new Map<string, string[]>();

  for (const nodeId of nodeIds) {
    map.set(nodeId, []);
  }

  return map;
}

function createGraphMaps(nodes: LayoutNodeInput[], edges: LayoutEdgeInput[]) {
  const nodeIds = nodes.map((node) => node.id).sort((a, b) => a.localeCompare(b));
  const incoming = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const outgoing = createEmptyAdjacency(nodeIds);
  const undirected = createEmptyAdjacency(nodeIds);

  for (const edge of edges) {
    if (!incoming.has(edge.sourceNodeId) || !incoming.has(edge.targetNodeId)) {
      continue;
    }

    incoming.set(
      edge.targetNodeId,
      (incoming.get(edge.targetNodeId) ?? 0) + 1,
    );
    outgoing.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    undirected.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    undirected.get(edge.targetNodeId)?.push(edge.sourceNodeId);
  }

  for (const nodeId of nodeIds) {
    outgoing.set(
      nodeId,
      [...new Set(outgoing.get(nodeId) ?? [])].sort((a, b) => a.localeCompare(b)),
    );
    undirected.set(
      nodeId,
      [...new Set(undirected.get(nodeId) ?? [])].sort((a, b) => a.localeCompare(b)),
    );
  }

  return {
    nodeIds,
    incoming,
    outgoing,
    undirected,
  };
}

function detectRoots(nodeIds: string[], incoming: Map<string, number>) {
  const roots = nodeIds.filter((nodeId) => (incoming.get(nodeId) ?? 0) === 0);

  if (roots.length > 0) {
    return roots;
  }

  if (nodeIds[0]) {
    return [nodeIds[0]];
  }

  return [];
}

function groupNodesByLevel(nodeIds: string[], levelByNode: Map<string, number>) {
  const levelMap = new Map<number, string[]>();

  for (const nodeId of nodeIds) {
    const level = levelByNode.get(nodeId) ?? 0;
    const current = levelMap.get(level) ?? [];
    current.push(nodeId);
    levelMap.set(level, current);
  }

  return [...levelMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, ids]) => ({
      level,
      ids: ids.sort((a, b) => a.localeCompare(b)),
    }));
}

function assignTreeLevels(
  nodeIds: string[],
  outgoing: Map<string, string[]>,
  roots: string[],
) {
  const levelByNode = new Map<string, number>();
  const queue: string[] = [];

  for (const root of roots) {
    levelByNode.set(root, 0);
    queue.push(root);
  }

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const currentLevel = levelByNode.get(current) ?? 0;
    const nextNodes = outgoing.get(current) ?? [];

    for (const nextNodeId of nextNodes) {
      const nextKnownLevel = levelByNode.get(nextNodeId);
      const candidateLevel = currentLevel + 1;

      if (nextKnownLevel === undefined || candidateLevel < nextKnownLevel) {
        levelByNode.set(nextNodeId, candidateLevel);
        queue.push(nextNodeId);
      }
    }
  }

  for (const nodeId of nodeIds) {
    if (!levelByNode.has(nodeId)) {
      levelByNode.set(nodeId, 0);
    }
  }

  return levelByNode;
}

function assignFlowLevels(
  nodeIds: string[],
  outgoing: Map<string, string[]>,
  roots: string[],
) {
  const levelByNode = new Map<string, number>();
  const queue: string[] = [];

  for (const root of roots) {
    levelByNode.set(root, 0);
    queue.push(root);
  }

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const currentLevel = levelByNode.get(current) ?? 0;
    const nextNodes = outgoing.get(current) ?? [];

    for (const nextNodeId of nextNodes) {
      const nextKnownLevel = levelByNode.get(nextNodeId);
      const candidateLevel = currentLevel + 1;

      if (nextKnownLevel === undefined || candidateLevel < nextKnownLevel) {
        levelByNode.set(nextNodeId, candidateLevel);
        queue.push(nextNodeId);
      }
    }
  }

  const maxKnownLevel =
    levelByNode.size > 0 ? Math.max(...levelByNode.values()) : 0;

  for (const nodeId of nodeIds) {
    if (!levelByNode.has(nodeId)) {
      levelByNode.set(nodeId, maxKnownLevel + 1);
    }
  }

  return levelByNode;
}

function applyTreeLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  options: TreeLayoutOptions,
) {
  const { nodeIds, incoming, outgoing } = createGraphMaps(nodes, edges);
  const roots = detectRoots(nodeIds, incoming);
  const levelByNode = assignTreeLevels(nodeIds, outgoing, roots);
  const groups = groupNodesByLevel(nodeIds, levelByNode);
  const positions: DiagramLayoutPositions = {};

  for (const group of groups) {
    group.ids.forEach((nodeId, index) => {
      const horizontal = index * options.nodeSpacingX;
      const vertical = group.level * options.nodeSpacingY;

      positions[nodeId] =
        options.direction === "left-right"
          ? { x: vertical, y: horizontal }
          : { x: horizontal, y: vertical };
    });
  }

  return positions;
}

function applyFlowLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  options: FlowLayoutOptions,
) {
  const { nodeIds, incoming, outgoing } = createGraphMaps(nodes, edges);
  const roots = detectRoots(nodeIds, incoming);
  const levelByNode = assignFlowLevels(nodeIds, outgoing, roots);
  const groups = groupNodesByLevel(nodeIds, levelByNode);
  const positions: DiagramLayoutPositions = {};

  for (const group of groups) {
    group.ids.forEach((nodeId, index) => {
      positions[nodeId] = {
        ...(options.direction === "left-right"
          ? {
              x: group.level * options.nodeSpacingX,
              y: index * options.nodeSpacingY,
            }
          : {
              x: index * options.nodeSpacingY,
              y: group.level * options.nodeSpacingX,
            }),
      };
    });
  }

  return positions;
}

function applyMindmapLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  options: MindmapLayoutOptions,
) {
  const { nodeIds, incoming, undirected } = createGraphMaps(nodes, edges);
  const roots = detectRoots(nodeIds, incoming);
  const root = roots[0] ?? nodeIds[0];
  const positions: DiagramLayoutPositions = {};

  if (!root) {
    return positions;
  }

  const parentByNode = new Map<string, string | null>([[root, null]]);
  const depthByNode = new Map<string, number>([[root, 0]]);
  const childrenByNode = new Map<string, string[]>();
  const queue: string[] = [root];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const currentDepth = depthByNode.get(current) ?? 0;
    const neighbors = undirected.get(current) ?? [];

    for (const neighbor of neighbors) {
      if (depthByNode.has(neighbor)) {
        continue;
      }

      parentByNode.set(neighbor, current);
      depthByNode.set(neighbor, currentDepth + 1);
      const currentChildren = childrenByNode.get(current) ?? [];
      currentChildren.push(neighbor);
      childrenByNode.set(current, currentChildren);
      queue.push(neighbor);
    }
  }

  // Keep disconnected nodes deterministic by attaching them to the root as extra branches.
  for (const nodeId of nodeIds) {
    if (depthByNode.has(nodeId)) {
      continue;
    }

    parentByNode.set(nodeId, root);
    depthByNode.set(nodeId, 1);
    const rootChildren = childrenByNode.get(root) ?? [];
    rootChildren.push(nodeId);
    childrenByNode.set(root, rootChildren);
  }

  for (const [nodeId, children] of childrenByNode.entries()) {
    childrenByNode.set(
      nodeId,
      children.sort((a, b) => a.localeCompare(b)),
    );
  }

  positions[root] = { x: 0, y: 0 };
  const angleByNode = new Map<string, number>([[root, 0]]);
  const rootChildren = childrenByNode.get(root) ?? [];

  rootChildren.forEach((childId, index) => {
    const angle = (2 * Math.PI * index) / Math.max(rootChildren.length, 1);
    angleByNode.set(childId, angle);
    positions[childId] = {
      x: Number((Math.cos(angle) * options.radialSpacing).toFixed(6)),
      y: Number((Math.sin(angle) * options.radialSpacing).toFixed(6)),
    };
  });

  const nonRootNodes = [...depthByNode.entries()]
    .filter(([nodeId]) => nodeId !== root)
    .sort((a, b) => {
      if (a[1] !== b[1]) {
        return a[1] - b[1];
      }
      return a[0].localeCompare(b[0]);
    });

  for (const [nodeId, depth] of nonRootNodes) {
    if (depth <= 1) {
      continue;
    }

    const parentId = parentByNode.get(nodeId);

    if (!parentId) {
      continue;
    }

    const siblings = childrenByNode.get(parentId) ?? [];
    const siblingIndex = siblings.indexOf(nodeId);
    const parentAngle = angleByNode.get(parentId) ?? 0;
    const arcSpan = Math.PI / 2;
    const siblingStep = siblings.length > 1 ? arcSpan / (siblings.length - 1) : 0;
    const angle = siblings.length > 1
      ? parentAngle - arcSpan / 2 + siblingStep * siblingIndex
      : parentAngle;
    const parentPosition = positions[parentId] ?? { x: 0, y: 0 };

    angleByNode.set(nodeId, angle);
    positions[nodeId] = {
      x: Number(
        (parentPosition.x + Math.cos(angle) * options.radialSpacing).toFixed(6),
      ),
      y: Number(
        (parentPosition.y + Math.sin(angle) * options.radialSpacing).toFixed(6),
      ),
    };
  }

  return positions;
}

function parseLayoutOverrideObject(rawOptions: unknown, type: DiagramType) {
  if (!rawOptions || typeof rawOptions !== "object" || Array.isArray(rawOptions)) {
    return {};
  }

  const candidate = rawOptions as Record<string, unknown>;

  if (
    typeof candidate.type === "string" &&
    candidate.type.length > 0 &&
    candidate.type !== type
  ) {
    return {};
  }

  const rest = { ...candidate };
  delete rest.type;
  return rest;
}

export function isSupportedDiagramType(
  diagramType: unknown,
): diagramType is DiagramType {
  return DiagramTypeSchema.safeParse(diagramType).success;
}

export function isAutoLayoutDiagramType(
  diagramType: unknown,
): diagramType is AutoLayoutDiagramType {
  return AutoLayoutDiagramTypeSchema.safeParse(diagramType).success;
}

export function isDiagramViewType(
  diagramView: unknown,
): diagramView is DiagramViewType {
  return DiagramViewTypeSchema.safeParse(diagramView).success;
}

export function getDiagramTypeLabel(diagramType: string | undefined) {
  if (!diagramType) {
    return "Nao definido";
  }

  if (diagramType === "graph") {
    return "Grafo canonico";
  }

  const registryEntry = isAutoLayoutDiagramType(diagramType)
    ? DIAGRAM_TYPE_REGISTRY[diagramType]
    : undefined;

  return registryEntry?.label ?? `Compatibilidade (${diagramType})`;
}

export function getDiagramViewLabel(diagramView: string | undefined) {
  if (!diagramView) {
    return "Nao definido";
  }

  const labels: Record<DiagramViewType, string> = {
    graph: "Grafo",
    tree: "Hierarquia",
    flow: "Processo",
    mindmap: "Mapa mental",
    erd: "ERD",
    sitemap: "Sitemap",
    timeline: "Timeline",
  };

  return labels[diagramView as DiagramViewType] ?? `Compatibilidade (${diagramView})`;
}

export function resolveDiagramLayoutOptions<TType extends AutoLayoutDiagramType>(
  diagramType: TType,
  rawOptions?: unknown,
): DiagramLayoutOptionsByType[TType] {
  const parsedOverrides = parseLayoutOverrideObject(rawOptions, diagramType);

  if (diagramType === "tree") {
    const overrides = TreeLayoutOptionsOverridesSchema.safeParse(parsedOverrides);
    return {
      ...TREE_DEFAULT_OPTIONS,
      ...(overrides.success ? overrides.data : {}),
    } as DiagramLayoutOptionsByType[TType];
  }

  if (diagramType === "flow") {
    const overrides = FlowLayoutOptionsOverridesSchema.safeParse(parsedOverrides);
    return {
      ...FLOW_DEFAULT_OPTIONS,
      ...(overrides.success ? overrides.data : {}),
    } as DiagramLayoutOptionsByType[TType];
  }

  const overrides = MindmapLayoutOptionsOverridesSchema.safeParse(parsedOverrides);
  return {
    ...MINDMAP_DEFAULT_OPTIONS,
    ...(overrides.success ? overrides.data : {}),
  } as DiagramLayoutOptionsByType[TType];
}

export const DIAGRAM_TYPE_REGISTRY = {
  tree: {
    type: "tree",
    label: "Hierarquia",
    defaultOptions: TREE_DEFAULT_OPTIONS,
    applyLayout: applyTreeLayout,
  },
  flow: {
    type: "flow",
    label: "Processo",
    defaultOptions: FLOW_DEFAULT_OPTIONS,
    applyLayout: applyFlowLayout,
  },
  mindmap: {
    type: "mindmap",
    label: "Mapa mental",
    defaultOptions: MINDMAP_DEFAULT_OPTIONS,
    applyLayout: applyMindmapLayout,
  },
} as const satisfies {
  [TType in AutoLayoutDiagramType]: DiagramLayoutRegistryEntry<TType>;
};

export function computeDiagramLayoutPositions<TType extends AutoLayoutDiagramType>(input: {
  nodes: LayoutNodeInput[];
  edges: LayoutEdgeInput[];
  diagramType: TType;
  options?: unknown;
}): DiagramLayoutPositions {
  if (input.diagramType === "tree") {
    const resolvedOptions = resolveDiagramLayoutOptions("tree", input.options);
    return applyTreeLayout(input.nodes, input.edges, resolvedOptions);
  }

  if (input.diagramType === "flow") {
    const resolvedOptions = resolveDiagramLayoutOptions("flow", input.options);
    return applyFlowLayout(input.nodes, input.edges, resolvedOptions);
  }

  const resolvedOptions = resolveDiagramLayoutOptions("mindmap", input.options);
  return applyMindmapLayout(input.nodes, input.edges, resolvedOptions);
}

export function applyDiagramLayoutToSnapshot<TType extends AutoLayoutDiagramType>(
  snapshot: GraphSnapshot,
  diagramType: TType,
  options?: unknown,
): GraphSnapshot {
  const resolvedOptions = resolveDiagramLayoutOptions(diagramType, options);
  const positions = computeDiagramLayoutPositions({
    nodes: snapshot.nodes.map((node) => ({ id: node.id })),
    edges: snapshot.edges.map((edge) => ({
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
    })),
    diagramType,
    options: resolvedOptions,
  });

  return {
    ...snapshot,
    diagramType,
    layoutOptions: resolvedOptions,
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      position: positions[node.id] ?? node.position,
    })),
  };
}

export function reapplyLayoutForSnapshot(snapshot: GraphSnapshot): GraphSnapshot {
  if (!isAutoLayoutDiagramType(snapshot.diagramType)) {
    return snapshot;
  }

  return applyDiagramLayoutToSnapshot(
    snapshot,
    snapshot.diagramType,
    snapshot.layoutOptions,
  );
}
