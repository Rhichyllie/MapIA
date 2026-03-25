import type { APIRequestContext, Page } from "@playwright/test";
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

async function openEditorAndAssertChrome(
  page: Page,
  input: {
    projectId: string;
    renderer: "flow" | "graph" | "erd";
  },
) {
  await page.goto(`/editor?projectId=${input.projectId}`);
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  await expect(page.getByTestId("editor-canvas")).toHaveAttribute(
    "data-diagram-renderer",
    input.renderer,
  );
  await expect(page.getByTestId("canvas-top-bar")).toBeVisible();
  await expect(page.getByTestId("save-status-badge")).toBeVisible();
  await expect(page.getByTestId("inspector-panel")).toBeVisible();
  await expect(page.getByTestId("editor-panel-metadata-toggle")).toBeVisible();
  await expect(page.getByTestId("editor-panel-versions-toggle")).toBeVisible();
}

async function countCanvasNodes(page: Page) {
  return page.locator('[data-testid^="editor-node-"]').count();
}

test.describe("Editor mode smoke", () => {
  test("graph carrega o shell composto e adiciona um vizinho contextual", async ({
    authenticatedPage,
  }) => {
    const projectId = await createProjectWithDraft({
      request: authenticatedPage.request,
      draft: {
        projectName: `E2E Graph Smoke ${Date.now()}`,
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

    await openEditorAndAssertChrome(authenticatedPage, {
      projectId,
      renderer: "graph",
    });

    const initialNodeCount = await countCanvasNodes(authenticatedPage);
    const coreNodeLocator = authenticatedPage.getByTestId(`editor-node-${coreNode!.id}`);
    await coreNodeLocator.getByTestId("graph-node-click-surface").click();

    const inspector = authenticatedPage.getByTestId("inspector-panel");
    await expect(inspector.getByTestId("graph-inspector-overview")).toContainText(
      "Leitura da rede",
    );
    await expect(
      authenticatedPage.getByTestId("selection-hud-contextual-add-button"),
    ).toBeVisible();

    await authenticatedPage.getByTestId("selection-hud-contextual-add-button").click();
    await expect
      .poll(() => countCanvasNodes(authenticatedPage), { timeout: 10_000 })
      .toBe(initialNodeCount + 1);
  });

  test("flow carrega o shell composto e abre o inspector de processo", async ({
    authenticatedPage,
  }) => {
    const projectId = await createProjectWithDraft({
      request: authenticatedPage.request,
      draft: {
        projectName: `E2E Flow Smoke ${Date.now()}`,
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
      snapshot.nodes.find((node) => node.data?.role === "flow-step") ??
      snapshot.nodes.find((node) => node.data?.role === "flow-start") ??
      snapshot.nodes[0];
    expect(targetNode).toBeTruthy();

    await openEditorAndAssertChrome(authenticatedPage, {
      projectId,
      renderer: "flow",
    });

    const initialNodeCount = await countCanvasNodes(authenticatedPage);
    await authenticatedPage.getByTestId(`editor-node-${targetNode!.id}`).click();

    const inspector = authenticatedPage.getByTestId("inspector-panel");
    await expect(inspector.getByTestId("process-inspector-overview")).toBeVisible();
    await expect(
      authenticatedPage.getByTestId("selection-hud-contextual-add-button"),
    ).toBeVisible();

    await authenticatedPage.getByTestId("selection-hud-contextual-add-button").click();
    await expect
      .poll(() => countCanvasNodes(authenticatedPage), { timeout: 10_000 })
      .toBe(initialNodeCount + 1);
  });

  test("erd carrega o shell composto e edita os campos no inspector por modo", async ({
    authenticatedPage,
  }) => {
    const projectId = await createProjectWithDraft({
      request: authenticatedPage.request,
      draft: {
        projectName: `E2E ERD Smoke ${Date.now()}`,
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
    const entityNode =
      snapshot.nodes.find((node) => node.kind === "entity") ?? snapshot.nodes[0];
    expect(entityNode).toBeTruthy();

    await openEditorAndAssertChrome(authenticatedPage, {
      projectId,
      renderer: "erd",
    });

    const entityNodeLocator = authenticatedPage.getByTestId(`editor-node-${entityNode!.id}`);
    await expect(entityNodeLocator.getByTestId("erd-node-fields-table")).toBeVisible();
    await entityNodeLocator.click();

    const inspector = authenticatedPage.getByTestId("inspector-panel");
    const fieldRows = inspector.locator('[data-testid^="erd-field-row-"]');
    const beforeCount = await fieldRows.count();

    await expect(inspector.getByTestId("erd-entity-fields-grid")).toBeVisible();
    await expect(inspector.getByTestId("erd-fields-add-button")).toBeVisible();
    await inspector.getByTestId("erd-fields-add-button").click();
    await expect
      .poll(() => fieldRows.count(), { timeout: 10_000 })
      .toBe(beforeCount + 1);
  });
});
