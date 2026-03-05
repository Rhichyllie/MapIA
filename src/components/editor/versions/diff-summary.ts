import type { Edge, GraphSnapshot, Node } from "@/src/domain";
import type { EditorSnapshotVersionDiff } from "../editor-query-service";
import { getEdgeKindLabel, getNodeKindLabel } from "../presentation/kinds";

export type VersionDiffSummaryCards = {
  nodesAdded: number;
  nodesRemoved: number;
  nodesChanged: number;
  edgesChanged: number;
};

export type VersionDiffChangedBreakdown = {
  renamed: number;
  kindChanged: number;
  payloadChanged: number;
};

export type VersionDiffSummaryResult = {
  hasChanges: boolean;
  cards: VersionDiffSummaryCards;
  changedBreakdown: VersionDiffChangedBreakdown;
  topChanges: string[];
};

type BuildVersionDiffSummaryInput = {
  baseSnapshot: GraphSnapshot;
  targetSnapshot: GraphSnapshot;
  diff: EditorSnapshotVersionDiff;
  topChangesLimit?: number;
};

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableNormalize(item));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, stableNormalize(record[key])]),
    );
  }

  return value;
}

function stableSerialize(value: unknown) {
  return JSON.stringify(stableNormalize(value));
}

function indexById<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

function quoteLabel(rawLabel: string | undefined) {
  const normalized = rawLabel?.trim();
  if (!normalized) {
    return "Sem titulo";
  }

  return normalized;
}

function pushTopChange(topChanges: string[], entry: string, max: number) {
  if (topChanges.length >= max) {
    return;
  }

  topChanges.push(entry);
}

function summarizeEdgeKindCounts(
  edgeIds: string[],
  edgeById: Map<string, Edge>,
  prefix: string,
) {
  const countByKind = new Map<string, number>();

  for (const edgeId of edgeIds) {
    const edge = edgeById.get(edgeId);
    if (!edge) {
      continue;
    }

    const next = (countByKind.get(edge.kind) ?? 0) + 1;
    countByKind.set(edge.kind, next);
  }

  return [...countByKind.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([kind, count]) => {
      const label = getEdgeKindLabel(kind as Edge["kind"], "operational");
      return `${prefix}${count} relacao(oes) ${label}`;
    });
}

function describeNodeKind(kind: Node["kind"]) {
  return getNodeKindLabel(kind, "operational");
}

export function buildVersionDiffSummary(
  input: BuildVersionDiffSummaryInput,
): VersionDiffSummaryResult {
  const topLimit = Math.max(1, input.topChangesLimit ?? 8);
  const baseNodeById = indexById(input.baseSnapshot.nodes);
  const targetNodeById = indexById(input.targetSnapshot.nodes);
  const targetEdgeById = indexById(input.targetSnapshot.edges);
  const baseEdgeById = indexById(input.baseSnapshot.edges);

  const cards: VersionDiffSummaryCards = {
    nodesAdded: input.diff.nodesAdded.length,
    nodesRemoved: input.diff.nodesRemoved.length,
    nodesChanged: input.diff.nodesChanged.length,
    edgesChanged:
      input.diff.edgesAdded.length +
      input.diff.edgesRemoved.length +
      input.diff.edgesChanged.length,
  };

  const changedBreakdown: VersionDiffChangedBreakdown = {
    renamed: 0,
    kindChanged: 0,
    payloadChanged: 0,
  };

  const topChanges: string[] = [];

  for (const nodeId of input.diff.nodesChanged) {
    const previousNode = baseNodeById.get(nodeId);
    const nextNode = targetNodeById.get(nodeId);

    if (!previousNode || !nextNode) {
      continue;
    }

    if (previousNode.label !== nextNode.label) {
      changedBreakdown.renamed += 1;
      pushTopChange(
        topChanges,
        `${describeNodeKind(nextNode.kind)} '${quoteLabel(previousNode.label)}' renomeada para '${quoteLabel(nextNode.label)}'.`,
        topLimit,
      );
    }

    if (previousNode.kind !== nextNode.kind) {
      changedBreakdown.kindChanged += 1;
      pushTopChange(
        topChanges,
        `${quoteLabel(nextNode.label)} mudou tipo: ${describeNodeKind(previousNode.kind)} -> ${describeNodeKind(nextNode.kind)}.`,
        topLimit,
      );
    }

    if (stableSerialize(previousNode.data) !== stableSerialize(nextNode.data)) {
      changedBreakdown.payloadChanged += 1;
      pushTopChange(
        topChanges,
        `Payload de '${quoteLabel(nextNode.label)}' foi atualizado.`,
        topLimit,
      );
    }
  }

  for (const nodeId of input.diff.nodesAdded) {
    const node = targetNodeById.get(nodeId);
    if (!node) {
      continue;
    }

    pushTopChange(
      topChanges,
      `+ ${describeNodeKind(node.kind)} '${quoteLabel(node.label)}' adicionada.`,
      topLimit,
    );
  }

  for (const nodeId of input.diff.nodesRemoved) {
    const node = baseNodeById.get(nodeId);
    if (!node) {
      continue;
    }

    pushTopChange(
      topChanges,
      `- ${describeNodeKind(node.kind)} '${quoteLabel(node.label)}' removida.`,
      topLimit,
    );
  }

  for (const edgeEntry of summarizeEdgeKindCounts(
    input.diff.edgesAdded,
    targetEdgeById,
    "+",
  )) {
    pushTopChange(topChanges, `${edgeEntry} criadas.`, topLimit);
  }

  for (const edgeEntry of summarizeEdgeKindCounts(
    input.diff.edgesRemoved,
    baseEdgeById,
    "-",
  )) {
    pushTopChange(topChanges, `${edgeEntry} removidas.`, topLimit);
  }

  if (input.diff.edgesChanged.length > 0) {
    pushTopChange(
      topChanges,
      `${input.diff.edgesChanged.length} relacao(oes) tiveram atributos alterados.`,
      topLimit,
    );
  }

  if (input.diff.viewportChanged) {
    pushTopChange(topChanges, "Viewport do canvas foi alterado.", topLimit);
  }

  if (topChanges.length === 0) {
    topChanges.push("Nenhuma alteracao detectada.");
  }

  return {
    hasChanges: input.diff.hasChanges,
    cards,
    changedBreakdown,
    topChanges: topChanges.slice(0, topLimit),
  };
}
