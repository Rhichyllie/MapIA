import { z } from "zod";
import type { Edge, GraphSnapshot, Node } from "@/src/domain";

export const GraphSnapshotDiffSummarySchema = z.object({
  added: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  changed: z.number().int().nonnegative(),
});

export const GraphSnapshotDiffSchema = z.object({
  hasChanges: z.boolean(),
  nodesAdded: z.array(z.string().uuid()),
  nodesRemoved: z.array(z.string().uuid()),
  nodesChanged: z.array(z.string().uuid()),
  edgesAdded: z.array(z.string().uuid()),
  edgesRemoved: z.array(z.string().uuid()),
  edgesChanged: z.array(z.string().uuid()),
  viewportChanged: z.boolean(),
  summary: GraphSnapshotDiffSummarySchema,
});

export type GraphSnapshotDiffSummary = z.infer<
  typeof GraphSnapshotDiffSummarySchema
>;
export type GraphSnapshotDiff = z.infer<typeof GraphSnapshotDiffSchema>;

type SnapshotEntity = Node | Edge;

type ComputeGraphSnapshotDiffInput = {
  baseSnapshot: GraphSnapshot;
  targetSnapshot: GraphSnapshot;
};

function stableNormalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableNormalizeValue(item));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return Object.fromEntries(
      Object.keys(record)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, stableNormalizeValue(record[key])]),
    );
  }

  return value;
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(stableNormalizeValue(value));
}

function indexById<T extends SnapshotEntity>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

function compareEntitiesById<T extends SnapshotEntity>(
  baseItems: T[],
  targetItems: T[],
) {
  const baseById = indexById(baseItems);
  const targetById = indexById(targetItems);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const targetItem of targetItems) {
    if (!baseById.has(targetItem.id)) {
      added.push(targetItem.id);
    }
  }

  for (const baseItem of baseItems) {
    if (!targetById.has(baseItem.id)) {
      removed.push(baseItem.id);
      continue;
    }

    const targetItem = targetById.get(baseItem.id);

    if (!targetItem) {
      continue;
    }

    if (stableSerialize(baseItem) !== stableSerialize(targetItem)) {
      changed.push(baseItem.id);
    }
  }

  added.sort((left, right) => left.localeCompare(right));
  removed.sort((left, right) => left.localeCompare(right));
  changed.sort((left, right) => left.localeCompare(right));

  return { added, removed, changed };
}

export function computeGraphSnapshotDiff(
  input: ComputeGraphSnapshotDiffInput,
): GraphSnapshotDiff {
  const nodesDiff = compareEntitiesById(
    input.baseSnapshot.nodes,
    input.targetSnapshot.nodes,
  );
  const edgesDiff = compareEntitiesById(
    input.baseSnapshot.edges,
    input.targetSnapshot.edges,
  );
  const viewportChanged =
    stableSerialize(input.baseSnapshot.viewport) !==
    stableSerialize(input.targetSnapshot.viewport);
  const summary = {
    added: nodesDiff.added.length + edgesDiff.added.length,
    removed: nodesDiff.removed.length + edgesDiff.removed.length,
    changed:
      nodesDiff.changed.length +
      edgesDiff.changed.length +
      (viewportChanged ? 1 : 0),
  };

  return GraphSnapshotDiffSchema.parse({
    hasChanges:
      summary.added > 0 || summary.removed > 0 || summary.changed > 0,
    nodesAdded: nodesDiff.added,
    nodesRemoved: nodesDiff.removed,
    nodesChanged: nodesDiff.changed,
    edgesAdded: edgesDiff.added,
    edgesRemoved: edgesDiff.removed,
    edgesChanged: edgesDiff.changed,
    viewportChanged,
    summary,
  });
}
