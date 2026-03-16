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
          label: string;
          data?: { role?: string };
          position: { x: number; y: number };
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
  expect(response.ok()).toBe(true);

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

test("graph inicial nasce com composicao de rede nao linear", async ({
  authenticatedPage,
}) => {
  const projectId = await createProjectWithDraft({
    request: authenticatedPage.request,
    draft: {
      projectName: `E2E Graph Network ${Date.now()}`,
      profile: "system-architecture",
      startStrategy: "manual",
      initialView: "graph",
      layout: "auto",
      detailLevel: "intermediate",
      automation: baseAutomation,
      context: {
        setup: {
          createExamples: true,
          suggestedBlockCount: 4,
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

  const topicNodes = snapshot.nodes.filter((node) => node.data?.role === "graph-topic");
  const supportNodes = snapshot.nodes.filter(
    (node) => node.data?.role === "graph-supporting",
  );
  expect(topicNodes.length).toBeGreaterThanOrEqual(3);
  expect(supportNodes.length).toBeGreaterThanOrEqual(1);
  expect(
    new Set(topicNodes.map((node) => Math.round(node.position.x))).size,
  ).toBeGreaterThan(2);
  expect(
    new Set(topicNodes.map((node) => Math.round(node.position.y))).size,
  ).toBeGreaterThan(2);
});

test("graph renderiza identidade semantica e inspector contextual do nucleo", async ({
  authenticatedPage,
}) => {
  const projectId = await createProjectWithDraft({
    request: authenticatedPage.request,
    draft: {
      projectName: `E2E Graph Inspector ${Date.now()}`,
      profile: "system-architecture",
      startStrategy: "manual",
      initialView: "graph",
      layout: "auto",
      detailLevel: "intermediate",
      automation: baseAutomation,
      context: {
        setup: {
          createExamples: true,
          suggestedBlockCount: 4,
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
  const coreNode =
    snapshot.nodes.find((node) => node.data?.role === "graph-core") ?? snapshot.nodes[0];
  expect(coreNode).toBeTruthy();

  await authenticatedPage.goto(`/editor?projectId=${projectId}`);
  await expect(authenticatedPage.getByTestId("editor-canvas")).toBeVisible();

  const coreNodeLocator = authenticatedPage.getByTestId(`editor-node-${coreNode!.id}`);
  await coreNodeLocator.getByTestId("graph-node-click-surface").click();

  const graphRenderer = coreNodeLocator.locator(
    '.diagram-node-graph[data-graph-variant="core"]',
  );
  await expect(graphRenderer).toBeVisible();
  await expect(graphRenderer.getByTestId("graph-node-role-badge")).toContainText(
    "Nucleo da rede",
  );
  await expect(graphRenderer.getByTestId("graph-node-kind-chip")).toContainText(
    "Componente",
  );
  await expect(graphRenderer.getByTestId("graph-node-summary")).not.toContainText(
    "Nota",
  );

  const inspector = authenticatedPage.getByTestId("inspector-panel");
  await expect(inspector).toBeVisible();
  await expect(
    inspector.locator(".badge", { hasText: "Nucleo em foco" }).first(),
  ).toBeVisible();
  await expect(inspector.getByTestId("graph-inspector-overview")).toContainText(
    "Leitura da rede",
  );
  await expect(inspector.getByTestId("graph-inspector-context")).toContainText(
    "Papel na rede",
  );
  await expect(inspector.getByTestId("graph-inspector-context")).toContainText(
    "Vizinhanca",
  );
  await expect(inspector.locator(".inspector-relation-item").first()).toContainText(
    /Dependencia|Apoio|Integracao/,
  );
  await expect(
    authenticatedPage.getByTestId("selection-hud-contextual-add-button"),
  ).toContainText("Adicionar componente");
  await expect(
    authenticatedPage.getByTestId(
      "selection-hud-contextual-secondary-graph-add-supporting-service",
    ),
  ).toContainText("Adicionar servico auxiliar");

  const initialNodeCount = snapshot.nodes.length;
  await authenticatedPage.getByTestId("selection-hud-contextual-add-button").click();
  await expect(authenticatedPage.locator('[data-testid^="editor-node-"]')).toHaveCount(
    initialNodeCount + 1,
  );
});

test("inspector mantem selecao coerente ao selecionar no no canvas", async ({
  authenticatedPage,
}) => {
  const projectId = await createProjectWithDraft({
    request: authenticatedPage.request,
    draft: {
      projectName: `E2E Inspector Selection ${Date.now()}`,
      profile: "process",
      startStrategy: "manual",
      initialView: "flow",
      layout: "horizontal",
      detailLevel: "intermediate",
      automation: baseAutomation,
      context: {
        setup: {
          createExamples: true,
          suggestedBlockCount: 3,
          createInitialRoot: false,
          initialRootName: "Fluxo",
        },
        flow: {
          autoCreateStartEnd: true,
          allowDecisions: true,
          direction: "left-right",
          allowMultipleOutputs: false,
        },
      },
    },
  });

  const snapshot = await loadSnapshot({
    request: authenticatedPage.request,
    projectId,
  });
  const targetNode =
    snapshot.nodes.find((node) => node.data?.role === "flow-start") ??
    snapshot.nodes[0];
  expect(targetNode).toBeTruthy();

  await authenticatedPage.goto(`/editor?projectId=${projectId}`);
  await expect(authenticatedPage.getByTestId("editor-canvas")).toBeVisible();

  await authenticatedPage.getByTestId(`editor-node-${targetNode!.id}`).click();

  const inspector = authenticatedPage.getByTestId("inspector-panel");
  await expect(inspector).toBeVisible();
  await expect(
    inspector.locator(".badge", { hasText: "Item em foco" }).first(),
  ).toBeVisible();
  await expect(inspector.locator(".badge", { hasText: "Sem selecao" })).toHaveCount(0);
  await expect(inspector.locator(".inspector-selection-title")).toContainText(
    targetNode!.label,
  );
});
