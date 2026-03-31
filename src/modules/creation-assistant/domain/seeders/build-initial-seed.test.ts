import { describe, expect, it } from "vitest";
import { buildDefaultAutomationToggles, buildDefaultContextForView } from "../creation-assistant";
import { buildInitialSeedGraph } from "./build-initial-seed";

function buildDraftAndSettings(input: {
  initialView: "erd" | "flow" | "sitemap" | "hierarchy" | "graph";
  projectName?: string;
  objective?: string;
  createExamples?: boolean;
}) {
  const context = buildDefaultContextForView(input.initialView);
  context.setup = {
    ...(context.setup ?? {
      createExamples: true,
      suggestedBlockCount: 3,
      createInitialRoot: false,
      initialRootName: "Nucleo",
    }),
    createExamples: input.createExamples ?? true,
  };

  const draft = {
    projectName: input.projectName ?? "Projeto teste",
    projectObjective: input.objective ?? "Objetivo de teste",
    profile:
      input.initialView === "erd"
        ? "data-model"
        : input.initialView === "sitemap" || input.initialView === "hierarchy"
          ? "information-structure"
          : input.initialView === "graph"
            ? "system-architecture"
            : "process",
    startStrategy: "manual",
    initialView: input.initialView,
    layout: "auto",
    detailLevel: "intermediate",
    automation: buildDefaultAutomationToggles(),
    context,
  } as const;

  const settings = {
    profile: draft.profile,
    startStrategy: draft.startStrategy,
    initialView: draft.initialView,
    layout: draft.layout,
    detailLevel: draft.detailLevel,
    automation: draft.automation,
    context: draft.context,
  } as const;

  return { draft, settings };
}

describe("buildInitialSeedGraph", () => {
  it("does not inject project/goal nodes in specialized views", () => {
    const specializedViews = ["erd", "flow", "sitemap", "hierarchy"] as const;

    for (const initialView of specializedViews) {
      const { draft, settings } = buildDraftAndSettings({ initialView });
      const seeded = buildInitialSeedGraph({
        projectId: "00000000-0000-0000-0000-000000000001",
        draft,
        settings,
      });

      expect(seeded.nodes.some((node) => node.kind === "project")).toBe(false);
      expect(
        seeded.nodes.some((node) => node.label.toLowerCase() === "objetivo"),
      ).toBe(false);
    }
  });

  it("can start empty when createExamples is disabled", () => {
    const { draft, settings } = buildDraftAndSettings({
      initialView: "graph",
      createExamples: false,
    });

    const seeded = buildInitialSeedGraph({
      projectId: "00000000-0000-0000-0000-000000000001",
      draft,
      settings,
    });

    expect(seeded.nodes).toHaveLength(0);
    expect(seeded.edges).toHaveLength(0);
  });

  it("uses recipe native seed for hierarchy and graph profiles", () => {
    const hierarchy = buildDraftAndSettings({
      initialView: "hierarchy",
      objective: "Mapear arvore de conteudo",
    });
    const graph = buildDraftAndSettings({
      initialView: "graph",
      objective: "Mapear arquitetura",
    });

    const hierarchySeed = buildInitialSeedGraph({
      projectId: "00000000-0000-0000-0000-000000000001",
      draft: hierarchy.draft,
      settings: hierarchy.settings,
    });
    const graphSeed = buildInitialSeedGraph({
      projectId: "00000000-0000-0000-0000-000000000001",
      draft: graph.draft,
      settings: graph.settings,
    });

    expect(
      hierarchySeed.nodes.some((node) => node.data?.role === "hierarchy-root"),
    ).toBe(true);
    expect(graphSeed.nodes.some((node) => node.data?.role === "graph-core")).toBe(
      true,
    );
  });

  it("builds a process seed with explicit process roles and supporting context", () => {
    const flow = buildDraftAndSettings({
      initialView: "flow",
      objective: "Mapear processo operacional",
    });

    const flowSeed = buildInitialSeedGraph({
      projectId: "00000000-0000-0000-0000-000000000001",
      draft: flow.draft,
      settings: flow.settings,
    });

    expect(flowSeed.nodes.some((node) => node.data?.role === "flow-start")).toBe(true);
    expect(flowSeed.nodes.some((node) => node.data?.role === "flow-decision")).toBe(
      true,
    );
    expect(flowSeed.nodes.some((node) => node.data?.role === "flow-note")).toBe(true);
    expect(flowSeed.nodes.some((node) => node.data?.role === "flow-end")).toBe(true);
    expect(
      flowSeed.edges.some((edge) => edge.kind === "depends-on" && edge.label === "Sim"),
    ).toBe(true);
    expect(
      flowSeed.edges.some((edge) => edge.kind === "references" && edge.label === "Regra"),
    ).toBe(true);
  });

  it("creates a non-linear graph native seed layout", () => {
    const graph = buildDraftAndSettings({
      initialView: "graph",
      objective: "Mapear arquitetura",
    });

    const graphSeed = buildInitialSeedGraph({
      projectId: "00000000-0000-0000-0000-000000000001",
      draft: graph.draft,
      settings: graph.settings,
    });

    const topicNodes = graphSeed.nodes.filter(
      (node) => node.data?.role === "graph-topic",
    );

    expect(topicNodes.length).toBeGreaterThanOrEqual(3);
    expect(
      new Set(topicNodes.map((node) => Math.round(node.position.x))).size,
    ).toBeGreaterThan(2);
    expect(
      new Set(topicNodes.map((node) => Math.round(node.position.y))).size,
    ).toBeGreaterThan(2);
  });

  it("builds graph seed with semantic component defaults instead of note dominance", () => {
    const graph = buildDraftAndSettings({
      initialView: "graph",
      objective: "Mapear arquitetura",
    });

    const graphSeed = buildInitialSeedGraph({
      projectId: "00000000-0000-0000-0000-000000000001",
      draft: graph.draft,
      settings: graph.settings,
    });

    const entityNodes = graphSeed.nodes.filter((node) => node.kind === "entity");
    const noteNodes = graphSeed.nodes.filter((node) => node.kind === "note");
    const supportNode = graphSeed.nodes.find(
      (node) => node.data?.role === "graph-supporting",
    );

    expect(entityNodes.length).toBeGreaterThan(noteNodes.length);
    expect(supportNode?.kind).toBe("page");
    expect(
      graphSeed.edges.some(
        (edge) => edge.kind === "relates-to" && edge.label === "integra com",
      ),
    ).toBe(true);
  });
});
