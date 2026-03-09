import type { Edge, ExternalRef, GraphSnapshot, Node } from "@/src/domain";

function compareStrings(left: string, right: string) {
  return left.localeCompare(right);
}

function compareOptionalStrings(left?: string, right?: string) {
  return (left ?? "").localeCompare(right ?? "");
}

function sortExternalRefsCanonical(
  externalRefs: readonly ExternalRef[] | null | undefined,
): ExternalRef[] {
  if (!Array.isArray(externalRefs) || externalRefs.length === 0) {
    return [];
  }

  return [...externalRefs].sort((a, b) => {
    return (
      compareStrings(a.system, b.system) ||
      compareStrings(a.externalId, b.externalId) ||
      compareStrings(a.id, b.id)
    );
  });
}

function normalizeRecordWithoutUndefined(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!value) {
    return {};
  }

  const normalized: Record<string, unknown> = {};

  for (const [key, entryValue] of Object.entries(value)) {
    if (typeof entryValue === "undefined") {
      continue;
    }

    normalized[key] = entryValue;
  }

  return normalized;
}

function normalizeImportedNodeData(node: Node): Node["data"] {
  const data = normalizeRecordWithoutUndefined(node.data);

  if (node.kind !== "entity" || data.source !== "prisma-schema") {
    return data;
  }

  const fields = Array.isArray(data.fields)
    ? data.fields.map((field) =>
        field && typeof field === "object" && !Array.isArray(field)
          ? normalizeRecordWithoutUndefined(field as Record<string, unknown>)
          : field,
      )
    : [];

  return {
    ...data,
    fields,
  };
}

function normalizeImportedEdgeData(edge: Edge): Edge["data"] {
  return normalizeRecordWithoutUndefined(edge.data);
}

export function normalizeImportedNodeCanonical(node: Node): Node {
  return {
    ...node,
    data: normalizeImportedNodeData(node),
    externalRefs: sortExternalRefsCanonical(node.externalRefs),
  };
}

export function normalizeImportedEdgeCanonical(edge: Edge): Edge {
  return {
    ...edge,
    data: normalizeImportedEdgeData(edge),
    externalRefs: sortExternalRefsCanonical(edge.externalRefs),
  };
}

function sortImportedNodesCanonical(nodes: readonly Node[]): Node[] {
  return [...nodes].sort((a, b) => {
    return (
      compareStrings(a.kind, b.kind) ||
      compareStrings(a.label, b.label) ||
      compareStrings(a.id, b.id)
    );
  });
}

function sortImportedEdgesCanonical(edges: readonly Edge[]): Edge[] {
  return [...edges].sort((a, b) => {
    return (
      compareStrings(a.kind, b.kind) ||
      compareStrings(a.sourceNodeId, b.sourceNodeId) ||
      compareStrings(a.targetNodeId, b.targetNodeId) ||
      compareOptionalStrings(a.label, b.label) ||
      compareStrings(a.id, b.id)
    );
  });
}

export function normalizeImportedSnapshotCanonical(
  snapshot: GraphSnapshot,
): GraphSnapshot {
  // Sorting order is part of the import snapshot determinism contract.
  // Changes here can change deep-equality and persisted snapshot diffs for identical imports.
  const nodes = sortImportedNodesCanonical(
    snapshot.nodes.map(normalizeImportedNodeCanonical),
  );
  const edges = sortImportedEdgesCanonical(
    snapshot.edges.map(normalizeImportedEdgeCanonical),
  );

  return {
    ...snapshot,
    nodes,
    edges,
    viewport: {
      x: snapshot.viewport.x,
      y: snapshot.viewport.y,
      zoom: snapshot.viewport.zoom,
    },
  };
}

