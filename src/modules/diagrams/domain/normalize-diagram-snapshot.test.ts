import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "@/src/domain";
import { normalizeDiagramSnapshot } from "./normalize-diagram-snapshot";

function createBaseSnapshot(overrides: Partial<GraphSnapshot>): GraphSnapshot {
  return {
    nodes: [],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    ...overrides,
  };
}

describe("normalizeDiagramSnapshot", () => {
  it("flow with only meta nodes creates 'Inicio' and hides meta nodes", () => {
    const snapshot = createBaseSnapshot({
      diagramType: "flow",
      nodes: [
        {
          id: "10000000-0000-4000-8000-000000000001",
          projectId: "20000000-0000-4000-8000-000000000001",
          kind: "workspace",
          label: "Workspace",
          position: { x: 0, y: 0 },
          data: {},
          externalRefs: [],
        },
        {
          id: "10000000-0000-4000-8000-000000000002",
          projectId: "20000000-0000-4000-8000-000000000001",
          kind: "project",
          label: "Projeto",
          position: { x: 240, y: 40 },
          data: {},
          externalRefs: [],
        },
      ],
      edges: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          projectId: "20000000-0000-4000-8000-000000000001",
          sourceNodeId: "10000000-0000-4000-8000-000000000001",
          targetNodeId: "10000000-0000-4000-8000-000000000002",
          kind: "contains",
          data: {},
          externalRefs: [],
        },
      ],
    });

    const normalized = normalizeDiagramSnapshot({
      snapshot,
      diagramTypeEffective: "flow",
      rootNodeName: undefined,
    });

    expect(normalized.hiddenNodeIds).toEqual([
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
    ]);
    expect(
      normalized.normalizedSnapshot.nodes.some(
        (node) =>
          node.kind === "flow-step" &&
          node.label === "Inicio" &&
          (node.data.__mapia as { role?: string } | undefined)?.role === "flow-start",
      ),
    ).toBe(true);
  });

  it("mindmap computes stable root id using rootNodeName", () => {
    const snapshot = createBaseSnapshot({
      diagramType: "mindmap",
      rootNodeName: "Tema Central",
      nodes: [
        {
          id: "40000000-0000-4000-8000-000000000001",
          projectId: "50000000-0000-4000-8000-000000000001",
          kind: "workspace",
          label: "Workspace",
          position: { x: -320, y: -120 },
          data: {},
          externalRefs: [],
        },
        {
          id: "40000000-0000-4000-8000-000000000002",
          projectId: "50000000-0000-4000-8000-000000000001",
          kind: "note",
          label: "Tema Central",
          position: { x: 140, y: 20 },
          data: {},
          externalRefs: [],
        },
        {
          id: "40000000-0000-4000-8000-000000000003",
          projectId: "50000000-0000-4000-8000-000000000001",
          kind: "note",
          label: "Ideia",
          position: { x: 420, y: 160 },
          data: {},
          externalRefs: [],
        },
      ],
      edges: [
        {
          id: "60000000-0000-4000-8000-000000000001",
          projectId: "50000000-0000-4000-8000-000000000001",
          sourceNodeId: "40000000-0000-4000-8000-000000000002",
          targetNodeId: "40000000-0000-4000-8000-000000000003",
          kind: "relates-to",
          data: {},
          externalRefs: [],
        },
      ],
    });

    const first = normalizeDiagramSnapshot({
      snapshot,
      diagramTypeEffective: "mindmap",
      rootNodeName: "Tema Central",
    });
    const second = normalizeDiagramSnapshot({
      snapshot,
      diagramTypeEffective: "mindmap",
      rootNodeName: "Tema Central",
    });

    expect(first.computedRootNodeId).toBe("40000000-0000-4000-8000-000000000002");
    expect(second.computedRootNodeId).toBe(first.computedRootNodeId);
  });

  it("sitemap hides meta nodes and timeline creates fallback milestone when empty", () => {
    const sitemapSnapshot = createBaseSnapshot({
      diagramType: "tree",
      diagramView: "sitemap",
      nodes: [
        {
          id: "70000000-0000-4000-8000-000000000001",
          projectId: "71000000-0000-4000-8000-000000000001",
          kind: "workspace",
          label: "Workspace",
          position: { x: 0, y: 0 },
          data: {},
          externalRefs: [],
        },
        {
          id: "70000000-0000-4000-8000-000000000002",
          projectId: "71000000-0000-4000-8000-000000000001",
          kind: "project",
          label: "Projeto",
          position: { x: 120, y: 40 },
          data: {},
          externalRefs: [],
        },
      ],
      edges: [],
    });

    const timelineSnapshot = createBaseSnapshot({
      diagramType: "graph",
      diagramView: "timeline",
      nodes: [
        {
          id: "72000000-0000-4000-8000-000000000001",
          projectId: "73000000-0000-4000-8000-000000000001",
          kind: "workspace",
          label: "Workspace",
          position: { x: -40, y: 10 },
          data: {},
          externalRefs: [],
        },
      ],
      edges: [],
    });

    const normalizedSitemap = normalizeDiagramSnapshot({
      snapshot: sitemapSnapshot,
      diagramTypeEffective: "sitemap",
    });
    const normalizedTimeline = normalizeDiagramSnapshot({
      snapshot: timelineSnapshot,
      diagramTypeEffective: "timeline",
    });

    expect(normalizedSitemap.hiddenNodeIds).toHaveLength(2);
    expect(
      normalizedTimeline.normalizedSnapshot.nodes.some(
        (node) =>
          node.label === "Marco 1" &&
          (node.data.__mapia as { role?: string } | undefined)?.role ===
            "timeline-milestone",
      ),
    ).toBe(true);
  });

  it("migrates legacy role payload into canonical diagram metadata", () => {
    const snapshot = createBaseSnapshot({
      diagramType: "flow",
      nodes: [
        {
          id: "91000000-0000-4000-8000-000000000001",
          projectId: "92000000-0000-4000-8000-000000000001",
          kind: "flow-step",
          label: "Aprovacao necessaria?",
          position: { x: 180, y: 120 },
          data: {
            role: "flow-decision",
          },
          externalRefs: [],
        },
      ],
      edges: [],
    });

    const normalized = normalizeDiagramSnapshot({
      snapshot,
      diagramTypeEffective: "flow",
    });

    expect(normalized.normalizedSnapshot.nodes[0]?.data).toMatchObject({
      role: "flow-decision",
      __mapia: {
        role: "flow-decision",
      },
    });
  });
});
