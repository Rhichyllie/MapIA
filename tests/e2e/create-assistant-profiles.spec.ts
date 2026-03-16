import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";

type CreateAssistantResponse = {
  data?: {
    projectId?: string;
  };
};

type WorkingSnapshotResponse = {
  data?: {
    workingSnapshot?: {
      snapshot: {
        nodes: Array<{
          id: string;
          kind: string;
          label: string;
          data?: { role?: string };
        }>;
        edges: Array<{
          sourceNodeId: string;
          targetNodeId: string;
          kind: string;
        }>;
      };
    };
  };
};

const baseAutomation = {
  inferRelations: true,
  createLinkFields: true,
  applySuggestedNames: true,
  autoOrganizeOnCreate: true,
  detectInconsistenciesEarly: true,
};

async function createProjectWithDraft(input: {
  request: APIRequestContext;
  draft: Record<string, unknown>;
}) {
  const response = await input.request.post("/api/projects/create-with-assistant", {
    data: input.draft,
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `create-with-assistant failed (${response.status()}): ${body}`,
    );
  }

  const payload = (await response.json()) as CreateAssistantResponse;
  const projectId = payload.data?.projectId;
  expect(projectId).toBeTruthy();
  return projectId!;
}

async function loadSnapshot(input: {
  request: APIRequestContext;
  projectId: string;
}) {
  const response = await input.request.get(
    `/api/projects/${input.projectId}/working-snapshot`,
  );
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as WorkingSnapshotResponse;
  const snapshot = payload.data?.workingSnapshot?.snapshot;
  expect(snapshot).toBeTruthy();
  return snapshot!;
}

test("Roda 2: fluxo completo data-model gera ERD sem poluicao de metadados", async ({
  authenticatedPage,
}) => {
  const projectId = await createProjectWithDraft({
    request: authenticatedPage.request,
    draft: {
      projectName: `E2E R2 DataModel ${Date.now()}`,
      projectObjective: "Mapear entidades principais",
      profile: "data-model",
      startStrategy: "template",
      templatePreset: "erd-basic",
      initialView: "erd",
      layout: "relational",
      detailLevel: "intermediate",
      automation: baseAutomation,
      context: {
        setup: {
          createExamples: true,
          suggestedBlockCount: 3,
          createInitialRoot: false,
          initialRootName: "Dominio",
        },
        erd: {
          useDefaultIdPk: true,
          autoCreateFk: true,
          suggestAssociativeForNN: true,
          showFieldTypes: true,
          enableDataSemantics: true,
          generateTimestamps: true,
          suggestIndexes: true,
        },
      },
    },
  });

  const snapshot = await loadSnapshot({
    request: authenticatedPage.request,
    projectId,
  });

  expect(snapshot.nodes.some((node) => node.kind === "entity")).toBe(true);
  expect(
    snapshot.nodes.some((node) => node.label.toLowerCase() === "objetivo"),
  ).toBe(false);
  expect(snapshot.nodes.some((node) => node.kind === "project")).toBe(false);
});

test("Roda 2: fluxo completo process cria flow com inicio e fim", async ({
  authenticatedPage,
}) => {
  const projectId = await createProjectWithDraft({
    request: authenticatedPage.request,
    draft: {
      projectName: `E2E R2 Process ${Date.now()}`,
      projectObjective: "Mapear processo de onboarding",
      profile: "process",
      startStrategy: "manual",
      initialView: "flow",
      layout: "horizontal",
      detailLevel: "intermediate",
      automation: baseAutomation,
      context: {
        setup: {
          createExamples: true,
          suggestedBlockCount: 4,
          createInitialRoot: false,
          initialRootName: "Fluxo",
        },
        flow: {
          autoCreateStartEnd: true,
          allowDecisions: true,
          direction: "left-right",
          allowMultipleOutputs: true,
        },
      },
    },
  });

  const snapshot = await loadSnapshot({
    request: authenticatedPage.request,
    projectId,
  });

  expect(
    snapshot.nodes.some((node) => node.data?.role === "flow-start"),
  ).toBe(true);
  expect(snapshot.nodes.some((node) => node.data?.role === "flow-end")).toBe(
    true,
  );
});

test("Roda 2: fluxo completo information-structure cria sitemap inicial", async ({
  authenticatedPage,
}) => {
  const projectId = await createProjectWithDraft({
    request: authenticatedPage.request,
    draft: {
      projectName: `E2E R2 Info ${Date.now()}`,
      projectObjective: "Mapear navegacao principal",
      profile: "information-structure",
      startStrategy: "template",
      templatePreset: "sitemap-basic",
      initialView: "sitemap",
      layout: "vertical",
      detailLevel: "intermediate",
      automation: baseAutomation,
      context: {
        setup: {
          createExamples: true,
          suggestedBlockCount: 4,
          createInitialRoot: true,
          initialRootName: "Home",
        },
        sitemap: {
          autoCreateHome: true,
          generateMainSections: true,
          showNavDepth: true,
        },
      },
    },
  });

  const snapshot = await loadSnapshot({
    request: authenticatedPage.request,
    projectId,
  });

  expect(snapshot.nodes.some((node) => node.label === "Home")).toBe(true);
  expect(snapshot.edges.length).toBeGreaterThan(0);
});

test("Roda 3-B: recipe information-structure:hierarchy cria raiz nativa", async ({
  authenticatedPage,
}) => {
  const projectId = await createProjectWithDraft({
    request: authenticatedPage.request,
    draft: {
      projectName: `E2E R3B Hierarchy ${Date.now()}`,
      profile: "information-structure",
      startStrategy: "manual",
      initialView: "hierarchy",
      layout: "vertical",
      detailLevel: "intermediate",
      automation: baseAutomation,
      context: {
        setup: {
          createExamples: true,
          suggestedBlockCount: 3,
          createInitialRoot: true,
          initialRootName: "Portal",
        },
        hierarchy: {
          createRoot: true,
          direction: "top-down",
          initialDepthHint: 2,
        },
      },
    },
  });

  const snapshot = await loadSnapshot({
    request: authenticatedPage.request,
    projectId,
  });

  expect(snapshot.nodes.some((node) => node.data?.role === "hierarchy-root")).toBe(
    true,
  );
});

test("Roda 3-B: recipe system-architecture:graph cria nucleo arquitetural", async ({
  authenticatedPage,
}) => {
  const projectId = await createProjectWithDraft({
    request: authenticatedPage.request,
    draft: {
      projectName: `E2E R3B Graph ${Date.now()}`,
      profile: "system-architecture",
      startStrategy: "manual",
      initialView: "graph",
      layout: "auto",
      detailLevel: "intermediate",
      automation: baseAutomation,
      context: {
        setup: {
          createExamples: true,
          suggestedBlockCount: 3,
          createInitialRoot: true,
          initialRootName: "Nucleo",
        },
        graph: {
          autoGroup: true,
          reduceCrossing: true,
          showEdgeLabels: true,
        },
      },
    },
  });

  const snapshot = await loadSnapshot({
    request: authenticatedPage.request,
    projectId,
  });

  expect(snapshot.nodes.some((node) => node.data?.role === "graph-core")).toBe(
    true,
  );
  expect(snapshot.edges.length).toBeGreaterThan(0);
});
