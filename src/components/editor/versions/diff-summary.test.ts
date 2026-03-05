import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "@/src/domain";
import type { EditorSnapshotVersionDiff } from "../editor-query-service";
import { buildVersionDiffSummary } from "./diff-summary";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";

function createSnapshot(overrides: Partial<GraphSnapshot>): GraphSnapshot {
  return {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    ...overrides,
  };
}

describe("buildVersionDiffSummary", () => {
  it("returns empty executive summary when diff has no changes", () => {
    const snapshot = createSnapshot({});
    const diff: EditorSnapshotVersionDiff = {
      hasChanges: false,
      nodesAdded: [],
      nodesRemoved: [],
      nodesChanged: [],
      edgesAdded: [],
      edgesRemoved: [],
      edgesChanged: [],
      viewportChanged: false,
      summary: { added: 0, removed: 0, changed: 0 },
    };

    const result = buildVersionDiffSummary({
      baseSnapshot: snapshot,
      targetSnapshot: snapshot,
      diff,
    });

    expect(result).toEqual({
      hasChanges: false,
      cards: {
        nodesAdded: 0,
        nodesRemoved: 0,
        nodesChanged: 0,
        edgesChanged: 0,
      },
      changedBreakdown: {
        renamed: 0,
        kindChanged: 0,
        payloadChanged: 0,
      },
      topChanges: ["Nenhuma alteracao detectada."],
    });
  });

  it("builds cards and top changes with rename, kind switch and edge aggregation", () => {
    const baseSnapshot = createSnapshot({
      nodes: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          projectId,
          kind: "page",
          label: "Cadastro",
          position: { x: 0, y: 0 },
          data: { owner: "ops" },
          externalRefs: [],
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          projectId,
          kind: "flow-step",
          label: "Aprovar",
          position: { x: 120, y: 0 },
          data: {},
          externalRefs: [],
        },
      ],
      edges: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          projectId,
          sourceNodeId: "11111111-1111-4111-8111-111111111111",
          targetNodeId: "22222222-2222-4222-8222-222222222222",
          kind: "flows-to",
          label: "fluxo",
          data: {},
          externalRefs: [],
        },
      ],
    });

    const targetSnapshot = createSnapshot({
      nodes: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          projectId,
          kind: "entity",
          label: "Cadastro do Cliente",
          position: { x: 0, y: 0 },
          data: { owner: "ops", status: "active" },
          externalRefs: [],
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          projectId,
          kind: "flow-step",
          label: "Notificar",
          position: { x: 240, y: 0 },
          data: {},
          externalRefs: [],
        },
      ],
      edges: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          projectId,
          sourceNodeId: "11111111-1111-4111-8111-111111111111",
          targetNodeId: "33333333-3333-4333-8333-333333333333",
          kind: "flows-to",
          label: "novo fluxo",
          data: {},
          externalRefs: [],
        },
        {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          projectId,
          sourceNodeId: "33333333-3333-4333-8333-333333333333",
          targetNodeId: "11111111-1111-4111-8111-111111111111",
          kind: "flows-to",
          label: "novo fluxo 2",
          data: {},
          externalRefs: [],
        },
      ],
    });

    const diff: EditorSnapshotVersionDiff = {
      hasChanges: true,
      nodesAdded: ["33333333-3333-4333-8333-333333333333"],
      nodesRemoved: ["22222222-2222-4222-8222-222222222222"],
      nodesChanged: ["11111111-1111-4111-8111-111111111111"],
      edgesAdded: [
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      ],
      edgesRemoved: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      edgesChanged: [],
      viewportChanged: false,
      summary: { added: 3, removed: 2, changed: 1 },
    };

    const result = buildVersionDiffSummary({
      baseSnapshot,
      targetSnapshot,
      diff,
      topChangesLimit: 8,
    });

    expect(result.cards).toEqual({
      nodesAdded: 1,
      nodesRemoved: 1,
      nodesChanged: 1,
      edgesChanged: 3,
    });
    expect(result.changedBreakdown).toEqual({
      renamed: 1,
      kindChanged: 1,
      payloadChanged: 1,
    });
    expect(
      result.topChanges.some((entry) =>
        entry.includes("renomeada para 'Cadastro do Cliente'."),
      ),
    ).toBe(true);
    expect(result.topChanges).toContain(
      "Cadastro do Cliente mudou tipo: Secao -> Entidade.",
    );
    expect(result.topChanges).toContain("+2 relacao(oes) Fluxo criadas.");
  });

  it("enforces top changes limit", () => {
    const snapshot = createSnapshot({
      nodes: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          projectId,
          kind: "note",
          label: "A",
          position: { x: 0, y: 0 },
          data: {},
          externalRefs: [],
        },
      ],
    });

    const result = buildVersionDiffSummary({
      baseSnapshot: snapshot,
      targetSnapshot: snapshot,
      diff: {
        hasChanges: true,
        nodesAdded: [
          "22222222-2222-4222-8222-222222222222",
          "33333333-3333-4333-8333-333333333333",
          "44444444-4444-4444-8444-444444444444",
        ],
        nodesRemoved: ["11111111-1111-4111-8111-111111111111"],
        nodesChanged: [],
        edgesAdded: [],
        edgesRemoved: [],
        edgesChanged: [],
        viewportChanged: false,
        summary: { added: 3, removed: 1, changed: 0 },
      },
      topChangesLimit: 1,
    });

    expect(result.topChanges).toHaveLength(1);
  });
});
