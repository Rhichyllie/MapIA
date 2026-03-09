import type { GraphSnapshot, Node } from "@/src/domain";
import type { DiagramType } from "@/src/modules/graph/domain";
import {
  resolveDiagramRole,
  writeDiagramRoleToPayload,
  type DiagramRole,
} from "./diagram-roles";

type DiagramTypeEffective = DiagramType | "erd" | undefined;

type NormalizeDiagramSnapshotInput = {
  snapshot: GraphSnapshot;
  diagramTypeEffective: DiagramTypeEffective;
  rootNodeName?: string;
};

type NormalizeDiagramSnapshotResult = {
  normalizedSnapshot: GraphSnapshot;
  hiddenNodeIds: string[];
  computedRootNodeId?: string;
};

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const GENERATED_FALLBACK_IDS = {
  flow: [
    "00000000-0000-4000-8000-000000000f01",
    "00000000-0000-4000-8000-000000000f02",
    "00000000-0000-4000-8000-000000000f03",
  ],
  mindmap: [
    "00000000-0000-4000-8000-000000000m01".replace("m", "1"),
    "00000000-0000-4000-8000-000000000m02".replace("m", "1"),
    "00000000-0000-4000-8000-000000000m03".replace("m", "1"),
  ],
  erd: [
    "00000000-0000-4000-8000-000000000e01".replace("e", "2"),
    "00000000-0000-4000-8000-000000000e02".replace("e", "2"),
    "00000000-0000-4000-8000-000000000e03".replace("e", "2"),
  ],
} as const;

function sortById<T extends { id: string }>(items: T[]) {
  return [...items].sort((itemA, itemB) => itemA.id.localeCompare(itemB.id));
}

function isMetaNodeKind(kind: Node["kind"]) {
  return kind === "workspace" || kind === "project";
}

function pickProjectId(snapshot: GraphSnapshot) {
  const nodeProjectId = snapshot.nodes[0]?.projectId;
  if (nodeProjectId) {
    return nodeProjectId;
  }

  const edgeProjectId = snapshot.edges[0]?.projectId;
  return edgeProjectId ?? NIL_UUID;
}

function resolveSeedPosition(nodes: GraphSnapshot["nodes"]) {
  const prioritized = sortById(nodes).sort((nodeA, nodeB) => {
    if (nodeA.kind === "project" && nodeB.kind !== "project") {
      return -1;
    }

    if (nodeB.kind === "project" && nodeA.kind !== "project") {
      return 1;
    }

    if (nodeA.kind === "workspace" && nodeB.kind !== "workspace") {
      return -1;
    }

    if (nodeB.kind === "workspace" && nodeA.kind !== "workspace") {
      return 1;
    }

    return nodeA.id.localeCompare(nodeB.id);
  });

  const seed = prioritized[0];

  if (!seed) {
    return { x: 0, y: 0 };
  }

  return {
    x: seed.position.x,
    y: seed.position.y,
  };
}

function pickGeneratedNodeId(
  diagramType: "flow" | "mindmap" | "erd",
  existingIds: Set<string>,
) {
  const preferredIds = GENERATED_FALLBACK_IDS[diagramType];
  for (const preferredId of preferredIds) {
    if (!existingIds.has(preferredId)) {
      return preferredId;
    }
  }

  let suffix = 4;
  while (suffix < 999) {
    const candidate = `00000000-0000-4000-8000-${diagramType === "flow" ? "000000000f" : diagramType === "mindmap" ? "0000000001" : "0000000002"}${suffix
      .toString()
      .padStart(2, "0")}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
    suffix += 1;
  }

  return `00000000-0000-4000-8000-999999999999`;
}

function resolveMindmapRootNodeId(input: {
  nodes: GraphSnapshot["nodes"];
  hiddenNodeIds: Set<string>;
  rootNodeName?: string;
}) {
  const visibleNodes = sortById(input.nodes).filter(
    (node) => !input.hiddenNodeIds.has(node.id),
  );
  if (visibleNodes.length === 0) {
    return undefined;
  }

  const byExplicitRole = visibleNodes.find((node) =>
    resolveDiagramRole({
      diagramType: "mindmap",
      nodeKind: node.kind,
      nodePayload: node.data,
      layoutMetadata: { rootNodeName: input.rootNodeName ?? null },
      nodeLabel: node.label,
    }) === "mindmap-root",
  );
  if (byExplicitRole) {
    return byExplicitRole.id;
  }

  const normalizedRootName = input.rootNodeName?.trim().toLowerCase();
  if (normalizedRootName) {
    const byRootName = visibleNodes.find(
      (node) => node.label.trim().toLowerCase() === normalizedRootName,
    );
    if (byRootName) {
      return byRootName.id;
    }
  }

  return visibleNodes
    .slice()
    .sort((nodeA, nodeB) => {
      const distanceA = Math.hypot(nodeA.position.x, nodeA.position.y);
      const distanceB = Math.hypot(nodeB.position.x, nodeB.position.y);
      if (distanceA !== distanceB) {
        return distanceA - distanceB;
      }

      return nodeA.id.localeCompare(nodeB.id);
    })[0]?.id;
}

function createFallbackNode(input: {
  diagramType: "flow" | "mindmap" | "erd";
  snapshot: GraphSnapshot;
  rootNodeName?: string;
}) {
  const existingIds = new Set(input.snapshot.nodes.map((node) => node.id));
  const projectId = pickProjectId(input.snapshot);
  const seedPosition = resolveSeedPosition(input.snapshot.nodes);

  if (input.diagramType === "flow") {
    const role: DiagramRole = "flow-start";
    return {
      id: pickGeneratedNodeId("flow", existingIds),
      projectId,
      kind: "flow-step" as const,
      label: "Inicio",
      position: {
        x: seedPosition.x + 280,
        y: seedPosition.y,
      },
      data: writeDiagramRoleToPayload({}, role),
      externalRefs: [],
    };
  }

  if (input.diagramType === "mindmap") {
    const role: DiagramRole = "mindmap-root";
    return {
      id: pickGeneratedNodeId("mindmap", existingIds),
      projectId,
      kind: "note" as const,
      label: input.rootNodeName?.trim() || "Tema central",
      position: {
        x: 0,
        y: 0,
      },
      data: writeDiagramRoleToPayload({}, role),
      externalRefs: [],
    };
  }

  return {
    id: pickGeneratedNodeId("erd", existingIds),
    projectId,
    kind: "entity" as const,
    label: "Tabela",
    position: {
      x: 0,
      y: 0,
    },
    data: writeDiagramRoleToPayload({}, "erd-entity"),
    externalRefs: [],
  };
}

export function normalizeDiagramSnapshot(
  input: NormalizeDiagramSnapshotInput,
): NormalizeDiagramSnapshotResult {
  const diagramType = input.diagramTypeEffective;
  const hiddenNodeIdSet = new Set<string>();
  const nextNodes = input.snapshot.nodes.map((node) => ({
    ...node,
    data: { ...(node.data ?? {}) },
    externalRefs: [...(node.externalRefs ?? [])],
  }));
  const nextEdges = input.snapshot.edges.map((edge) => ({
    ...edge,
    data: { ...(edge.data ?? {}) },
    externalRefs: [...(edge.externalRefs ?? [])],
  }));

  if (diagramType === "flow" || diagramType === "mindmap" || diagramType === "erd") {
    for (const node of nextNodes) {
      if (isMetaNodeKind(node.kind)) {
        hiddenNodeIdSet.add(node.id);
      }
    }
  }

  const hasVisibleRealNode = nextNodes.some(
    (node) => !hiddenNodeIdSet.has(node.id),
  );

  let computedRootNodeId: string | undefined;

  if (!hasVisibleRealNode && (diagramType === "flow" || diagramType === "mindmap" || diagramType === "erd")) {
    const fallbackNode = createFallbackNode({
      diagramType,
      snapshot: input.snapshot,
      rootNodeName: input.rootNodeName ?? input.snapshot.rootNodeName,
    });
    nextNodes.push(fallbackNode);
    if (diagramType === "mindmap") {
      computedRootNodeId = fallbackNode.id;
    }
  }

  if (diagramType === "mindmap") {
    computedRootNodeId = resolveMindmapRootNodeId({
      nodes: nextNodes,
      hiddenNodeIds: hiddenNodeIdSet,
      rootNodeName: input.rootNodeName ?? input.snapshot.rootNodeName,
    });
  }

  return {
    normalizedSnapshot: {
      ...input.snapshot,
      nodes: nextNodes,
      edges: nextEdges,
    },
    hiddenNodeIds: [...hiddenNodeIdSet].sort((idA, idB) => idA.localeCompare(idB)),
    ...(computedRootNodeId ? { computedRootNodeId } : {}),
  };
}
