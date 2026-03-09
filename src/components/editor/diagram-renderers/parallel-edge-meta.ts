import type { RFEdge } from "../editor-graph-mappers";

type ParallelEdgeGroup = {
  indices: number[];
};

function createParallelGroupMap(edges: RFEdge[]) {
  const groups = new Map<string, ParallelEdgeGroup>();

  edges.forEach((edge, index) => {
    const groupKey = `${edge.source}=>${edge.target}`;
    const existing = groups.get(groupKey);

    if (existing) {
      existing.indices.push(index);
      return;
    }

    groups.set(groupKey, { indices: [index] });
  });

  return groups;
}

export function computeParallelEdgeMeta(edges: RFEdge[]): RFEdge[] {
  const groups = createParallelGroupMap(edges);
  const metaByEdgeId = new Map<
    string,
    { parallelIndex: number; parallelTotal: number }
  >();

  for (const group of groups.values()) {
    const sortedIndices = [...group.indices].sort((indexA, indexB) =>
      edges[indexA].id.localeCompare(edges[indexB].id),
    );
    const parallelTotal = sortedIndices.length;

    sortedIndices.forEach((edgeIndex, parallelIndex) => {
      metaByEdgeId.set(edges[edgeIndex].id, {
        parallelIndex,
        parallelTotal,
      });
    });
  }

  return edges.map((edge) => {
    const parallelMeta = metaByEdgeId.get(edge.id);

    if (!parallelMeta) {
      return edge;
    }

    return {
      ...edge,
      data: {
        ...(edge.data ?? {}),
        parallelIndex: parallelMeta.parallelIndex,
        parallelTotal: parallelMeta.parallelTotal,
      } as RFEdge["data"],
    };
  });
}
