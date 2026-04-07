import { AppError } from "@/src/lib/app-error";
import {
  GraphSnapshotSchema,
  type Edge,
  type GraphSnapshot,
  type Node,
} from "@/src/domain";
import {
  isAutoLayoutDiagramType,
  resolveDiagramLayoutOptions,
} from "./diagram-types";

function isFiniteNumber(value: number) {
  return Number.isFinite(value);
}

function normalizeNode(node: Node): Node {
  const label = node.label.trim();

  if (!label) {
    throw new AppError("Node label nao pode ficar vazio apos trim.", {
      code: "GRAPH_INVALID_NODE_LABEL",
      status: 400,
    });
  }

  if (!isFiniteNumber(node.position.x) || !isFiniteNumber(node.position.y)) {
    throw new AppError("Posicao de node deve conter numeros finitos.", {
      code: "GRAPH_INVALID_NODE_POSITION",
      status: 400,
    });
  }

  return {
    ...node,
    label,
    position: {
      x: node.position.x,
      y: node.position.y,
    },
  };
}

function normalizeEdge(edge: Edge): Edge {
  const label = edge.label?.trim();

  if (!edge.sourceNodeId || !edge.targetNodeId) {
    throw new AppError("Edge precisa ter source e target.", {
      code: "GRAPH_INVALID_EDGE_ENDPOINT",
      status: 400,
    });
  }

  return {
    ...edge,
    label: label ? label : undefined,
  };
}

export function validateGraphSnapshotInvariants(
  snapshot: GraphSnapshot,
): GraphSnapshot {
  const normalizedNodes = snapshot.nodes.map(normalizeNode);
  const normalizedEdges = snapshot.edges.map(normalizeEdge);
  const normalizedRootNodeName = snapshot.rootNodeName?.trim() || undefined;
  const normalizedAllowReapplyLayout =
    typeof snapshot.allowReapplyLayout === "boolean"
      ? snapshot.allowReapplyLayout
      : undefined;
  const normalizedLayoutMetadata = (() => {
    if (!isAutoLayoutDiagramType(snapshot.diagramType)) {
      return {
        diagramType: snapshot.diagramType,
        diagramView: snapshot.diagramView,
        layoutOptions: snapshot.layoutOptions,
      };
    }

    return {
      diagramType: snapshot.diagramType,
      diagramView: snapshot.diagramView,
      layoutOptions: resolveDiagramLayoutOptions(
        snapshot.diagramType,
        snapshot.layoutOptions,
      ),
    };
  })();

  if (
    !isFiniteNumber(snapshot.viewport.x) ||
    !isFiniteNumber(snapshot.viewport.y) ||
    !isFiniteNumber(snapshot.viewport.zoom)
  ) {
    throw new AppError("Viewport deve conter numeros finitos.", {
      code: "GRAPH_INVALID_VIEWPORT",
      status: 400,
    });
  }

  const nodeIds = new Set<string>();

  for (const node of normalizedNodes) {
    if (nodeIds.has(node.id)) {
      throw new AppError(`Node ID duplicado detectado: ${node.id}`, {
        code: "GRAPH_DUPLICATE_NODE_ID",
        status: 400,
      });
    }
    nodeIds.add(node.id);
  }

  const edgeIds = new Set<string>();
  const exactEdgeKeys = new Set<string>();

  for (const edge of normalizedEdges) {
    if (edgeIds.has(edge.id)) {
      throw new AppError(`Edge ID duplicado detectado: ${edge.id}`, {
        code: "GRAPH_DUPLICATE_EDGE_ID",
        status: 400,
      });
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      throw new AppError(
        "Edge referencia node inexistente (source/target deve existir).",
        {
          code: "GRAPH_ORPHAN_EDGE",
          status: 400,
        },
      );
    }

    const exactKey = `${edge.sourceNodeId}::${edge.targetNodeId}::${edge.kind}`;
    if (exactEdgeKeys.has(exactKey)) {
      throw new AppError(
        "Edge duplicada (source + target + kind) nao e permitida.",
        {
          code: "GRAPH_DUPLICATE_EDGE_RELATION",
          status: 400,
        },
      );
    }
    exactEdgeKeys.add(exactKey);
  }

  return GraphSnapshotSchema.parse({
    ...snapshot,
    nodes: normalizedNodes,
    edges: normalizedEdges,
    viewport: {
      x: snapshot.viewport.x,
      y: snapshot.viewport.y,
      zoom: snapshot.viewport.zoom,
    },
    diagramType: normalizedLayoutMetadata.diagramType,
    diagramView: normalizedLayoutMetadata.diagramView,
    layoutOptions: normalizedLayoutMetadata.layoutOptions,
    ...(normalizedRootNodeName
      ? { rootNodeName: normalizedRootNodeName }
      : {}),
    ...(normalizedAllowReapplyLayout !== undefined
      ? { allowReapplyLayout: normalizedAllowReapplyLayout }
      : {}),
  });
}
