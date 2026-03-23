import type { Edge, GraphSnapshot, Node } from "@/src/domain";
import { translateEditor, type EditorTranslationFn } from "../editor-i18n";
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
  t?: EditorTranslationFn;
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
  t?: EditorTranslationFn,
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
      const label = getEdgeKindLabel(kind as Edge["kind"], "operational", t);
      return translateEditor(
        t,
        "versionDiff.edgeKindCount",
        `${prefix}${count} relacao(oes) ${label}`,
        { prefix, count, label },
      );
    });
}

function describeNodeKind(kind: Node["kind"], t?: EditorTranslationFn) {
  return getNodeKindLabel(kind, "operational", t);
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
        translateEditor(
          input.t,
          "versionDiff.nodeRenamed",
          `${describeNodeKind(nextNode.kind, input.t)} '${quoteLabel(previousNode.label)}' renomeada para '${quoteLabel(nextNode.label)}'.`,
          {
            nodeKind: describeNodeKind(nextNode.kind, input.t),
            previousLabel: quoteLabel(previousNode.label),
            nextLabel: quoteLabel(nextNode.label),
          },
        ),
        topLimit,
      );
    }

    if (previousNode.kind !== nextNode.kind) {
      changedBreakdown.kindChanged += 1;
      pushTopChange(
        topChanges,
        translateEditor(
          input.t,
          "versionDiff.nodeKindChanged",
          `${quoteLabel(nextNode.label)} mudou tipo: ${describeNodeKind(previousNode.kind, input.t)} -> ${describeNodeKind(nextNode.kind, input.t)}.`,
          {
            nodeLabel: quoteLabel(nextNode.label),
            previousKind: describeNodeKind(previousNode.kind, input.t),
            nextKind: describeNodeKind(nextNode.kind, input.t),
          },
        ),
        topLimit,
      );
    }

    if (stableSerialize(previousNode.data) !== stableSerialize(nextNode.data)) {
      changedBreakdown.payloadChanged += 1;
      pushTopChange(
        topChanges,
        translateEditor(
          input.t,
          "versionDiff.nodePayloadUpdated",
          `Payload de '${quoteLabel(nextNode.label)}' foi atualizado.`,
          { nodeLabel: quoteLabel(nextNode.label) },
        ),
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
      translateEditor(
        input.t,
        "versionDiff.nodeAdded",
        `+ ${describeNodeKind(node.kind, input.t)} '${quoteLabel(node.label)}' adicionada.`,
        {
          nodeKind: describeNodeKind(node.kind, input.t),
          nodeLabel: quoteLabel(node.label),
        },
      ),
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
      translateEditor(
        input.t,
        "versionDiff.nodeRemoved",
        `- ${describeNodeKind(node.kind, input.t)} '${quoteLabel(node.label)}' removida.`,
        {
          nodeKind: describeNodeKind(node.kind, input.t),
          nodeLabel: quoteLabel(node.label),
        },
      ),
      topLimit,
    );
  }

  for (const edgeEntry of summarizeEdgeKindCounts(
    input.diff.edgesAdded,
    targetEdgeById,
    "+",
    input.t,
  )) {
    pushTopChange(
      topChanges,
      translateEditor(input.t, "versionDiff.edgesAddedSuffix", `${edgeEntry} criadas.`, {
        edgeEntry,
      }),
      topLimit,
    );
  }

  for (const edgeEntry of summarizeEdgeKindCounts(
    input.diff.edgesRemoved,
    baseEdgeById,
    "-",
    input.t,
  )) {
    pushTopChange(
      topChanges,
      translateEditor(
        input.t,
        "versionDiff.edgesRemovedSuffix",
        `${edgeEntry} removidas.`,
        { edgeEntry },
      ),
      topLimit,
    );
  }

  if (input.diff.edgesChanged.length > 0) {
    pushTopChange(
      topChanges,
      translateEditor(
        input.t,
        "versionDiff.edgesChanged",
        `${input.diff.edgesChanged.length} relacao(oes) tiveram atributos alterados.`,
        { count: input.diff.edgesChanged.length },
      ),
      topLimit,
    );
  }

  if (input.diff.viewportChanged) {
    pushTopChange(
      topChanges,
      translateEditor(
        input.t,
        "versionDiff.viewportChanged",
        "Viewport do canvas foi alterado.",
      ),
      topLimit,
    );
  }

  if (topChanges.length === 0) {
    topChanges.push(
      translateEditor(
        input.t,
        "versionDiff.noChanges",
        "Nenhuma alteracao detectada.",
      ),
    );
  }

  return {
    hasChanges: input.diff.hasChanges,
    cards,
    changedBreakdown,
    topChanges: topChanges.slice(0, topLimit),
  };
}
