import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

type CreatedProject = {
  id: string;
  name: string;
};

const DASHBOARD_HYDRATION_SETTLE_MS = 300;
const E2E_API_TIMEOUT_MS = 20_000;

type ApiWaitOptions = {
  page: Page;
  method: "GET" | "POST" | "PUT";
  pathIncludes?: string;
  pathExact?: string;
  context: string;
  action?: () => Promise<void> | void;
  timeoutMs?: number;
};

type SaveCycleOptions = {
  page: Page;
  action: () => Promise<void> | void;
  request: {
    method: "POST" | "PUT";
    pathIncludes: string;
    context: string;
  };
  requireDirty?: boolean;
  requireSavingTransition?: boolean;
};

type ResponseLike = {
  ok(): boolean;
  status(): number;
  json(): Promise<unknown>;
  text(): Promise<string>;
};

function buildProjectIdentity(prefix: string) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const name = `${prefix} ${suffix}`;
  return { name };
}

async function readResponseDebugBody(response: ResponseLike) {
  try {
    return JSON.stringify(await response.json());
  } catch {
    const text = await response.text();
    return text || "<empty response body>";
  }
}

async function waitForApiResponse({
  page,
  method,
  pathIncludes,
  pathExact,
  context,
  action,
  timeoutMs = E2E_API_TIMEOUT_MS,
}: ApiWaitOptions) {
  if (!pathIncludes && !pathExact) {
    throw new Error(`[${context}] waitForApiResponse requires pathIncludes or pathExact.`);
  }

  const pathLabel = pathExact ?? pathIncludes ?? "<missing-path>";
  const responsePromise = page.waitForResponse(
    (response) => {
      if (response.request().method() !== method) {
        return false;
      }

      const url = new URL(response.url());
      const pathname = url.pathname;

      if (pathExact && pathname !== pathExact) {
        return false;
      }

      if (pathIncludes && !pathname.includes(pathIncludes)) {
        return false;
      }

      return true;
    },
    { timeout: timeoutMs },
  );

  if (action) {
    await action();
  }

  const response = await responsePromise;

  if (!response.ok()) {
    const body = await readResponseDebugBody(response);
    throw new Error(
      `[${context}] ${method} ${pathLabel} failed (${response.status()}): ${body}`,
    );
  }

  return response;
}

async function assertApiResponseOk<T extends ResponseLike>(response: T, context: string) {
  if (!response.ok()) {
    const body = await readResponseDebugBody(response);
    throw new Error(`[${context}] request failed (${response.status()}): ${body}`);
  }

  return response;
}

async function startSaveStatusHistoryCapture(page: Page) {
  await page.evaluate(() => {
    const selector = '[data-testid="save-status-badge"]';
    const element = document.querySelector(selector);

    if (!(element instanceof HTMLElement)) {
      throw new Error("save-status-badge not found");
    }

    const globalState = window as Window & {
      __mapiaE2eSaveStatusHistory?: string[];
      __mapiaE2eSaveStatusObserver?: MutationObserver;
    };

    globalState.__mapiaE2eSaveStatusObserver?.disconnect();
    globalState.__mapiaE2eSaveStatusHistory = [
      element.getAttribute("data-save-status") ?? "",
    ];
    globalState.__mapiaE2eSaveStatusObserver = new MutationObserver(() => {
      globalState.__mapiaE2eSaveStatusHistory?.push(
        element.getAttribute("data-save-status") ?? "",
      );
    });
    globalState.__mapiaE2eSaveStatusObserver.observe(element, {
      attributes: true,
      attributeFilter: ["data-save-status"],
    });
  });
}

async function stopSaveStatusHistoryCapture(page: Page) {
  return page.evaluate(() => {
    const globalState = window as Window & {
      __mapiaE2eSaveStatusHistory?: string[];
      __mapiaE2eSaveStatusObserver?: MutationObserver;
    };

    globalState.__mapiaE2eSaveStatusObserver?.disconnect();
    return [...(globalState.__mapiaE2eSaveStatusHistory ?? [])];
  });
}

async function runActionAndWaitForSaveCycle({
  page,
  action,
  request,
  requireDirty = true,
  requireSavingTransition = false,
}: SaveCycleOptions) {
  const saveBadge = page.getByTestId("save-status-badge");

  await startSaveStatusHistoryCapture(page);
  const saveRequestPromise = waitForApiResponse({
    page,
    method: request.method,
    pathIncludes: request.pathIncludes,
    context: request.context,
    action,
  });

  if (requireDirty) {
    await expect
      .poll(() => saveBadge.getAttribute("data-save-status"), {
        timeout: E2E_API_TIMEOUT_MS,
      })
      .toMatch(/dirty|saving|saved/);
  }

  await saveRequestPromise;

  await expect(saveBadge).toHaveAttribute("data-save-status", "saved", {
    timeout: E2E_API_TIMEOUT_MS,
  });

  const statusHistory = await stopSaveStatusHistoryCapture(page);

  if (requireDirty) {
    expect(statusHistory).toContain("dirty");
  }

  if (requireSavingTransition) {
    expect(statusHistory).toContain("saving");
  }

  return statusHistory;
}

async function waitForDashboardCreateFormReady(page: Page) {
  await expect(page.getByTestId("workspace-toolbar")).toBeVisible();
  await expect(page.getByTestId("new-project-button")).toBeVisible();
  await page.getByTestId("new-project-button").click();
  await expect(page.getByTestId("new-project-drawer")).toBeVisible();
  await expect(page.getByTestId("dashboard-create-project-form")).toBeVisible();
  // Intentional fixed wait: Next.js dev mode can render client markup before
  // React event handlers hydrate. This is the only fixed delay kept in the spec.
  await page.waitForTimeout(DASHBOARD_HYDRATION_SETTLE_MS);
}

async function createProjectFromDashboard(
  page: Page,
  prefix = "E2E Editor",
  options?: { openWizard?: boolean },
) {
  const project = buildProjectIdentity(prefix);

  await waitForDashboardCreateFormReady(page);

  const nameInput = page.getByTestId("dashboard-project-name-input");
  await nameInput.fill(project.name);
  await expect(nameInput).toHaveValue(project.name);

  await waitForApiResponse({
    page,
    method: "POST",
    pathIncludes: "/api/projects",
    context: "dashboard create project",
    action: () => page.getByTestId("dashboard-create-project-button").click(),
  });

  const projectCard = page
    .getByTestId("dashboard-project-list")
    .locator('[data-testid^="dashboard-project-card-"]')
    .filter({ hasText: project.name })
    .first();
  await expect(projectCard).toBeVisible({ timeout: 30_000 });

  const wizardLink = projectCard.locator('a[data-testid^="dashboard-open-wizard-"]');
  const wizardHref = await wizardLink.getAttribute("href");
  if (!wizardHref) {
    throw new Error("Dashboard project card is missing the wizard link href.");
  }

  const projectId = new URL(wizardHref, "http://localhost").searchParams.get(
    "projectId",
  );
  if (!projectId) {
    throw new Error("Could not resolve projectId from the dashboard wizard link.");
  }

  if (options?.openWizard === false) {
    return { id: projectId, name: project.name } satisfies CreatedProject;
  }

  const actionsTrigger = projectCard.locator("summary").first();
  if ((await actionsTrigger.count()) > 0) {
    await actionsTrigger.click();
  }
  await wizardLink.click();
  await expect(page).toHaveURL(new RegExp(`/wizard\\?projectId=${projectId}`));

  return { id: projectId, name: project.name } satisfies CreatedProject;
}

async function completeWizardAndOpenEditor(page: Page, projectId: string) {
  await expect(page.getByTestId("wizard-stepper")).toBeVisible();
  await expect(page.getByTestId("wizard-current-panel")).toContainText(
    "1. Tipo de diagrama",
  );
  await page.getByTestId("wizard-diagram-type-tree").click();
  await waitForApiResponse({
    page,
    method: "PUT",
    pathIncludes: "/wizard-draft",
    context: "wizard next (tipo)",
    action: () => page.getByTestId("wizard-next-button").click(),
  });

  await expect(page.getByTestId("wizard-current-panel")).toContainText(
    "2. Origem dos dados",
  );
  await page.getByTestId("wizard-data-source-select").selectOption("manual");
  await waitForApiResponse({
    page,
    method: "PUT",
    pathIncludes: "/wizard-draft",
    context: "wizard next (origem)",
    action: () => page.getByTestId("wizard-next-button").click(),
  });

  await expect(page.getByTestId("wizard-current-panel")).toContainText(
    "3. Configuracao",
  );
  await expect(page.getByTestId("wizard-config-name-input")).not.toHaveValue("");
  await waitForApiResponse({
    page,
    method: "PUT",
    pathIncludes: "/wizard-draft",
    context: "wizard next (configuracao)",
    action: () => page.getByTestId("wizard-next-button").click(),
  });

  await expect(page.getByTestId("wizard-current-panel")).toContainText("4. Revisao");
  await waitForApiResponse({
    page,
    method: "PUT",
    pathIncludes: "/wizard-draft",
    context: "wizard next (revisao)",
    action: () => page.getByTestId("wizard-next-button").click(),
  });

  await expect(page.getByTestId("wizard-current-panel")).toContainText(
    "5. Gerar e abrir editor",
  );
  const saveDraftBeforeGeneratePromise = waitForApiResponse({
    page,
    method: "PUT",
    pathIncludes: "/wizard-draft",
    context: "wizard save draft before generate",
  });
  const generateSnapshotPromise = waitForApiResponse({
    page,
    method: "POST",
    pathIncludes: "/wizard-generate",
    context: "wizard generate snapshot",
  });
  await page.getByTestId("wizard-generate-button").click();
  await saveDraftBeforeGeneratePromise;
  await generateSnapshotPromise;
  await expect(page.getByTestId("wizard-open-editor-button")).toBeVisible();
  await page.getByTestId("wizard-open-editor-button").click();

  await expect(page).toHaveURL(new RegExp(`/editor\\?projectId=${projectId}`), {
    timeout: 30_000,
  });
}

async function waitForEditorReady(page: Page) {
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  await expect(page.getByTestId("inspector-panel")).toBeVisible();
  await expect(page.getByTestId("save-status-badge")).toBeVisible();

  const nodeLocator = page.locator('[data-testid^="editor-node-"]');
  await expect.poll(async () => nodeLocator.count()).toBeGreaterThan(0);
}

async function setInspectorMode(page: Page, mode: "operational" | "technical") {
  await expect(page.getByTestId("inspector-mode-toggle")).toBeVisible();
  const target =
    mode === "technical"
      ? page.getByTestId("inspector-technical")
      : page.getByTestId("inspector-operational");
  await target.click();
  await expect(target).toHaveAttribute("aria-pressed", "true");
}

async function assertCanvasRenderer(page: Page, rendererKey: string) {
  await expect(page.getByTestId("editor-canvas")).toHaveAttribute(
    "data-diagram-renderer",
    rendererKey,
  );
}

async function runActionAndWaitForAutosave(
  page: Page,
  action: () => Promise<void> | void,
  options?: { strict?: boolean; context?: string },
) {
  await runActionAndWaitForSaveCycle({
    page,
    action,
    request: {
      method: "POST",
      pathIncludes: "/editor-commands",
      context: options?.context ?? "editor autosave command flush",
    },
    requireDirty: true,
    requireSavingTransition: options?.strict ?? false,
  });
}

async function addNodeViaGuidedFlow(
  page: Page,
  input?: {
    title?: string;
    kind?: "page" | "flow-step" | "entity" | "note";
    openWithShortcut?: boolean;
    confirmWithEnter?: boolean;
  },
) {
  const title = input?.title ?? `No ${Date.now()}`;

  if (input?.openWithShortcut) {
    await page.keyboard.press("a");
  } else {
    await page.getByTestId("add-node-button").click();
  }

  await expect(page.getByTestId("add-node-dialog")).toBeVisible();

  if (input?.kind) {
    await page.getByTestId(`add-node-kind-${input.kind}`).click();
  }

  const titleInput = page.getByTestId("add-node-title-input");
  await titleInput.fill(title);

  if (input?.confirmWithEnter) {
    await titleInput.press("Enter");
  } else {
    await page.getByTestId("add-node-confirm-button").click();
  }

  await expect(page.getByTestId("add-node-dialog")).toHaveCount(0);
}

async function waitForAutosaveCycle(
  page: Page,
  options?: { strict?: boolean; requireDirty?: boolean },
) {
  const saveBadge = page.getByTestId("save-status-badge");
  const requireDirty = options?.requireDirty ?? true;

  await startSaveStatusHistoryCapture(page);

  if (requireDirty) {
    await expect(saveBadge).toHaveAttribute("data-save-status", "dirty");
  }

  await expect(saveBadge).toHaveAttribute("data-save-status", "saved", {
    timeout: E2E_API_TIMEOUT_MS,
  });

  const statusHistory = await stopSaveStatusHistoryCapture(page);

  if (requireDirty) {
    expect(statusHistory).toContain("dirty");
  }

  if (options?.strict) {
    expect(statusHistory).toContain("saving");
  }
}

async function runActionAndWaitForManualSave(
  page: Page,
  action: () => Promise<void> | void,
  context = "editor manual save",
) {
  await runActionAndWaitForSaveCycle({
    page,
    action,
    request: {
      method: "PUT",
      pathIncludes: "/working-snapshot",
      context,
    },
    requireDirty: false,
    requireSavingTransition: false,
  });
}

async function getRequiredText(locator: Locator, label = "text content") {
  const value = (await locator.textContent())?.trim();
  if (!value) {
    throw new Error(`Expected non-empty ${label}.`);
  }
  return value;
}

async function loadEditorSnapshot(page: Page, projectId: string) {
  const response = await page.request.get(`/api/projects/${projectId}/editor-snapshot`);
  await assertApiResponseOk(response, "load editor snapshot for E2E assertion");

  const payload = (await response.json()) as {
    data?: {
      workingSnapshot?: {
        snapshot?: {
          nodes: Array<{
            id: string;
            kind: string;
            label: string;
            position: { x: number; y: number };
            data: Record<string, unknown>;
          }>;
          edges: Array<{ id: string }>;
          rootNodeName?: string;
          allowReapplyLayout?: boolean;
        } | null;
      } | null;
    };
  };

  const snapshot = payload.data?.workingSnapshot?.snapshot;
  if (!snapshot) {
    throw new Error("Editor snapshot API returned an empty snapshot.");
  }

  return snapshot;
}

async function tryCreateEdgeViaUi(
  page: Page,
  sourceNodeId: string,
  targetNodeId: string,
) {
  const sourceHandle = page.locator(
    `[data-testid="editor-node-${sourceNodeId}"] .react-flow__handle.source`,
  );
  const targetHandle = page.locator(
    `[data-testid="editor-node-${targetNodeId}"] .react-flow__handle.target`,
  );

  const sourceCount = await sourceHandle.count();
  const targetCount = await targetHandle.count();
  if (sourceCount === 0 || targetCount === 0) {
    return false;
  }

  const beforeCount = await page.locator('[data-testid^="editor-edge-"]').count();
  const sourceBox = await sourceHandle.first().boundingBox();
  const targetBox = await targetHandle.first().boundingBox();
  if (!sourceBox || !targetBox) {
    return false;
  }

  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 16 });
  await page.mouse.up();

  try {
    await expect
      .poll(async () => page.locator('[data-testid^="editor-edge-"]').count(), {
        timeout: 4_000,
      })
      .toBeGreaterThan(beforeCount);
    return true;
  } catch {
    return false;
  }
}

async function createEdgeViaApiFallback(
  page: Page,
  projectId: string,
  sourceNodeId: string,
  targetNodeId: string,
) {
  const response = await page.request.post(`/api/projects/${projectId}/editor-commands`, {
    data: {
      command: {
        type: "addEdge",
        edge: {
          id: randomUUID(),
          sourceNodeId,
          targetNodeId,
          kind: "flows-to",
          label: "relacao",
          data: {},
        },
      },
    },
  });
  await assertApiResponseOk(response, "create edge via API fallback");
}

async function clickEditorPane(page: Page) {
  const pane = page.locator('[data-testid="editor-canvas"] .react-flow__pane');
  const box = await pane.boundingBox();
  if (!box) {
    throw new Error("Could not resolve React Flow pane bounding box.");
  }

  await page.mouse.click(box.x + 24, box.y + 24);
}

async function createProjectAndOpenEditor(page: Page, prefix: string) {
  const project = await createProjectFromDashboard(page, prefix);
  await completeWizardAndOpenEditor(page, project.id);
  await waitForEditorReady(page);
  return project;
}

test.describe("Editor E2E (Fase 3A)", () => {
  test("Fase 5.4 Workspace: cria projeto via drawer e mostra na lista", async ({
    authenticatedPage: page,
  }) => {
    const project = await createProjectFromDashboard(
      page,
      "E2E Workspace Drawer",
      { openWizard: false },
    );

    await expect(page.getByTestId("new-project-drawer")).toHaveCount(0);
    await expect(page.getByTestId(`dashboard-project-card-${project.id}`)).toBeVisible();
    await expect(page.getByTestId(`dashboard-project-card-${project.id}`)).toHaveClass(
      /is-highlighted/,
    );
  });

  test("Fase 5.5 Workspace: alterna Grid/Lista + Densidade com persistencia", async ({
    authenticatedPage: page,
  }) => {
    await createProjectFromDashboard(page, "E2E Workspace Persist", {
      openWizard: false,
    });

    const projectList = page.getByTestId("dashboard-project-list");

    await page.getByRole("button", { name: "Grid" }).click();
    await expect(projectList).toHaveAttribute("data-view", "grid");

    await page.getByRole("button", { name: "Confortavel" }).click();
    await expect(projectList).toHaveAttribute("data-density", "comfortable");

    await page.getByRole("button", { name: "Tecnico" }).click();
    await expect(page.getByTestId("workspace-mode-technical")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.reload();
    await expect(projectList).toHaveAttribute("data-view", "grid");
    await expect(projectList).toHaveAttribute("data-density", "comfortable");
    await expect(page.getByTestId("workspace-mode-technical")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("Fase 5.4 Workspace: search + filter + sort na toolbar", async ({
    authenticatedPage: page,
  }) => {
    const marker = Date.now();
    const alphaProject = await createProjectFromDashboard(
      page,
      `E2E Workspace ${marker} Alpha`,
      { openWizard: false },
    );
    const zuluProject = await createProjectFromDashboard(
      page,
      `E2E Workspace ${marker} Zulu`,
      { openWizard: false },
    );

    await page.getByTestId("workspace-search").fill(`E2E Workspace ${marker}`);
    await expect(page.getByTestId(`dashboard-project-card-${alphaProject.id}`)).toBeVisible();
    await expect(page.getByTestId(`dashboard-project-card-${zuluProject.id}`)).toBeVisible();

    await page.getByTestId("workspace-filter-snapshot").selectOption("pending");
    await page.getByTestId("workspace-filter-diagram").selectOption("undefined");
    await page.getByTestId("workspace-sort").selectOption("name-asc");

    const firstCard = page
      .getByTestId("dashboard-project-list")
      .locator('[data-testid^="dashboard-project-card-"]')
      .first();
    await expect(firstCard).toContainText("Alpha");

    await page.getByTestId("workspace-clear-filters").click();
    await expect(page.getByTestId("workspace-search")).toHaveValue("");
  });

  test("Fase 5.4 Editor: focus mode colapsa paineis e mantém canvas operável", async ({
    authenticatedPage: page,
  }) => {
    await createProjectAndOpenEditor(page, "E2E Focus Mode");

    await expect(page.getByTestId("editor-panel-prisma-toggle")).toBeVisible();
    await expect(page.getByTestId("editor-panel-versions-toggle")).toBeVisible();
    await expect(page.getByTestId("canvas-toolbar")).toBeVisible();

    await page.getByTestId("editor-focus-toggle").click();
    await expect(page.getByTestId("editor-panel-prisma-toggle")).toHaveCount(0);
    await expect(page.getByTestId("editor-panel-versions-toggle")).toHaveCount(0);
    await expect(page.getByTestId("editor-canvas")).toBeVisible();
    await expect(page.getByTestId("inspector-panel")).toHaveCount(0);
    await expect(page.getByTestId("canvas-toolbar")).toBeVisible();

    await page.getByTestId("center-diagram-button").click();

    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("editor-quick-find-modal")).toBeVisible();
    await page.getByTestId("editor-quick-find-input").press("Enter");
    await expect(page.getByTestId("editor-quick-find-modal")).toHaveCount(0);

    await page.getByRole("button", { name: "Mostrar inspetor" }).click();
    await expect(page.getByTestId("inspector-panel")).toBeVisible();

    const firstNode = page.locator('[data-testid^="editor-node-"]').first();
    await firstNode.click();
    await expect(page.getByTestId("inspector-node-label")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("editor-panel-prisma-toggle")).toBeVisible();
    await expect(page.getByTestId("editor-panel-versions-toggle")).toBeVisible();
  });

  test("Fase 5.4 Inspetor: alterna Operacional/Tecnico e aplica titulo operacional", async ({
    authenticatedPage: page,
  }) => {
    await createProjectAndOpenEditor(page, "E2E Inspector Modes");

    const firstNode = page.locator('[data-testid^="editor-node-"]').first();
    await firstNode.click();
    await expect(page.getByTestId("inspector-mode-toggle")).toBeVisible();
    await expect(page.getByTestId("inspector-operational")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("inspector-node-data-json")).toHaveCount(0);

    await page.getByTestId("inspector-technical").click();
    await expect(page.getByTestId("inspector-node-data-json")).toBeVisible();

    await page.getByTestId("inspector-operational").click();
    await expect(page.getByTestId("inspector-node-data-json")).toHaveCount(0);

    const updatedLabel = `Operacional ${Date.now()}`;
    await page.getByTestId("inspector-node-label").fill(updatedLabel);
    await runActionAndWaitForAutosave(
      page,
      () => page.getByTestId("inspector-apply-node").click(),
      { strict: true, context: "apply node label from operational inspector" },
    );
    await expect(firstNode).toContainText(updatedLabel);
  });

  test("Fase 5.6 Canvas: trocar tipo no inspetor atualiza visual semantico do no", async ({
    authenticatedPage: page,
  }) => {
    await createProjectAndOpenEditor(page, "E2E Kind Visual");

    await runActionAndWaitForAutosave(
      page,
      () =>
        addNodeViaGuidedFlow(page, {
          title: `No tipo ${Date.now()}`,
          kind: "page",
        }),
      { context: "add node before kind visual assertion" },
    );

    await setInspectorMode(page, "technical");
    const selectedNodeId = await getRequiredText(
      page.getByTestId("inspector-node-id"),
      "selected node id for kind visual assertion",
    );
    const selectedNode = page.getByTestId(`editor-node-${selectedNodeId}`);

    await expect(selectedNode.locator('[data-node-kind=\"page\"]')).toBeVisible();
    await setInspectorMode(page, "operational");
    await page.getByTestId("inspector-node-kind").selectOption("entity");
    await runActionAndWaitForAutosave(
      page,
      () => page.getByTestId("inspector-apply-node").click(),
      { strict: true, context: "change node kind and assert visual style update" },
    );

    await expect(selectedNode.locator('[data-node-kind=\"entity\"]')).toBeVisible();
    await expect(page.getByTestId("canvas-selection-kind-chip")).toContainText("Entidade");
  });

  test("Fase 5.6 Adicionar: fluxo guiado com atalhos cria relacao padrao", async ({
    authenticatedPage: page,
  }) => {
    await createProjectAndOpenEditor(page, "E2E Guided Add");

    const nodeLocator = page.locator('[data-testid^="editor-node-"]');
    const edgeLocator = page.locator('[data-testid^="editor-edge-"]');
    const beforeNodes = await nodeLocator.count();
    const beforeEdges = await edgeLocator.count();

    await nodeLocator.first().click();

    await runActionAndWaitForAutosave(
      page,
      () =>
        addNodeViaGuidedFlow(page, {
          title: `Filho ${Date.now()}`,
          openWithShortcut: true,
          confirmWithEnter: true,
        }),
      { context: "guided add via keyboard shortcut" },
    );

    await expect.poll(async () => nodeLocator.count()).toBe(beforeNodes + 1);
    await expect.poll(async () => edgeLocator.count()).toBeGreaterThan(beforeEdges);
    await expect(
      page.locator('[data-testid^="editor-edge-"].editor-edge-kind-contains').first(),
    ).toBeVisible();

    await page.keyboard.press("a");
    await expect(page.getByTestId("add-node-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("add-node-dialog")).toHaveCount(0);
  });

  test("fluxo principal Dashboard -> Wizard -> Editor com persistencia", async ({
    authenticatedPage: page,
  }) => {
    const project = await createProjectAndOpenEditor(page, "E2E Editor Flow");

    const saveBadge = page.getByTestId("save-status-badge");
    const nodeLocator = page.locator('[data-testid^="editor-node-"]');
    const edgeLocator = page.locator('[data-testid^="editor-edge-"]');
    const initialNodeCount = await nodeLocator.count();

    await expect(page.getByTestId("inspector-empty-state")).toBeVisible();
    await expect(saveBadge).toHaveAttribute("data-save-status", "saved");
    await setInspectorMode(page, "technical");

    await runActionAndWaitForAutosave(
      page,
      () => addNodeViaGuidedFlow(page, { title: `No E2E ${Date.now()}` }),
      { context: "add first node" },
    );
    await expect.poll(async () => nodeLocator.count()).toBe(initialNodeCount + 1);

    const createdNodeId = await getRequiredText(
      page.getByTestId("inspector-node-id"),
      "selected node id in inspector",
    );
    const createdNodeLocator = page.getByTestId(`editor-node-${createdNodeId}`);
    await expect(createdNodeLocator).toBeVisible();

    const updatedLabel = `Node E2E ${Date.now()}`;
    await page.getByTestId("inspector-node-label").fill(updatedLabel);
    await page.getByTestId("inspector-node-kind").selectOption("entity");
    await page
      .getByTestId("inspector-node-data-json")
      .fill('{"owner":"e2e","version":1}');
    await runActionAndWaitForAutosave(
      page,
      () => page.getByTestId("inspector-apply-node").click(),
      { strict: true, context: "apply node inspector" },
    );

    await runActionAndWaitForAutosave(
      page,
      () => addNodeViaGuidedFlow(page, { title: `No E2E ${Date.now()} segundo` }),
      { context: "add second node" },
    );
    const secondNodeId = await getRequiredText(
      page.getByTestId("inspector-node-id"),
      "second selected node id in inspector",
    );

    const edgeCreatedViaUi = await tryCreateEdgeViaUi(page, createdNodeId, secondNodeId);
    if (edgeCreatedViaUi) {
      await waitForAutosaveCycle(page, { requireDirty: false });
    } else {
      await createEdgeViaApiFallback(page, project.id, createdNodeId, secondNodeId);
      await page.reload();
      await waitForEditorReady(page);
      await expect
        .poll(async () => edgeLocator.count(), { timeout: 10_000 })
        .toBeGreaterThan(0);
    }

    await runActionAndWaitForManualSave(
      page,
      () => page.getByTestId("save-button").click(),
      "manual save button",
    );

    await page.reload();
    await waitForEditorReady(page);

    await expect
      .poll(async () => page.locator('[data-testid^="editor-edge-"]').count())
      .toBeGreaterThan(0);
    await expect(page.getByTestId(`editor-node-${createdNodeId}`)).toContainText(
      updatedLabel,
    );

    const persistedSnapshot = await loadEditorSnapshot(page, project.id);
    const persistedNode = persistedSnapshot.nodes.find(
      (node) => node.id === createdNodeId,
    );
    expect(persistedNode).toBeTruthy();
    expect(persistedNode?.label).toBe(updatedLabel);
    expect(persistedNode?.kind).toBe("entity");
    expect(persistedNode?.data).toMatchObject({ owner: "e2e", version: 1 });
    expect(persistedSnapshot.edges.length).toBeGreaterThan(0);
  });

  test("regressao UX: estado vazio + erro amigavel de JSON invalido no inspector", async ({
    authenticatedPage: page,
  }) => {
    await createProjectAndOpenEditor(page, "E2E Editor UX");
    await setInspectorMode(page, "technical");

    await clickEditorPane(page);
    await expect(page.getByTestId("inspector-empty-state")).toBeVisible();

    await runActionAndWaitForAutosave(
      page,
      () => addNodeViaGuidedFlow(page, { title: `No JSON ${Date.now()}` }),
      { context: "add node before JSON invalid inspector scenario" },
    );
    await expect(page.getByTestId("inspector-node-label")).toBeVisible();

    await page.getByTestId("inspector-node-data-json").fill('{"broken": }');
    await page.getByTestId("inspector-apply-node").click();

    const feedback = page.getByTestId("inspector-node-feedback");
    await expect(feedback).toBeVisible();
    await expect(feedback).toContainText("JSON invalido");
    await expect(feedback).not.toContainText("ZodError");
    await expect(feedback).not.toContainText("\"issues\"");
    await expect(page.getByTestId("save-status-badge")).toHaveAttribute(
      "data-save-status",
      "saved",
    );
  });

  test("Fase 5.3: canvas aplica renderer tree no fluxo Wizard -> Editor", async ({
    authenticatedPage: page,
  }) => {
    const project = await createProjectAndOpenEditor(page, "E2E Renderer Tree");

    await assertCanvasRenderer(page, "tree");
    await expect(page.getByTestId("visual-mode-badge")).toContainText("Hierarquia");

    const treeStyledEdgeLocator = page.locator(
      '[data-testid^="editor-edge-"].editor-edge-renderer-tree',
    );

    if ((await treeStyledEdgeLocator.count()) === 0) {
      const snapshot = await loadEditorSnapshot(page, project.id);
      if (snapshot.nodes.length < 2) {
        throw new Error(
          "Snapshot inicial possui menos de dois nós e não permite validar estilo de aresta do renderer tree.",
        );
      }

      await createEdgeViaApiFallback(
        page,
        project.id,
        snapshot.nodes[0].id,
        snapshot.nodes[1].id,
      );
      await page.reload();
      await waitForEditorReady(page);
      await assertCanvasRenderer(page, "tree");
    }

    await expect
      .poll(async () =>
        page
          .locator('[data-testid^="editor-edge-"].editor-edge-renderer-tree')
          .count(),
      )
      .toBeGreaterThan(0);
  });

  test("Fase 5.1.2: wizard persiste no raiz e bloqueia reaplicacao de layout no editor", async ({
    authenticatedPage: page,
  }) => {
    const project = await createProjectFromDashboard(page, "E2E Wizard Policy");

    await expect(page.getByTestId("wizard-stepper")).toBeVisible();
    await expect(page.getByTestId("wizard-current-panel")).toContainText(
      "1. Tipo de diagrama",
    );
    await page.getByTestId("wizard-diagram-type-tree").click();
    await waitForApiResponse({
      page,
      method: "PUT",
      pathIncludes: "/wizard-draft",
      context: "wizard next (tipo) for policy scenario",
      action: () => page.getByTestId("wizard-next-button").click(),
    });

    await expect(page.getByTestId("wizard-current-panel")).toContainText(
      "2. Origem dos dados",
    );
    await page.getByTestId("wizard-data-source-select").selectOption("manual");
    await waitForApiResponse({
      page,
      method: "PUT",
      pathIncludes: "/wizard-draft",
      context: "wizard next (origem) for policy scenario",
      action: () => page.getByTestId("wizard-next-button").click(),
    });

    await expect(page.getByTestId("wizard-current-panel")).toContainText("3. Configuracao");
    await expect(page.getByTestId("wizard-config-generate-root-checkbox")).toBeChecked();
    await page
      .getByTestId("wizard-config-root-node-name-input")
      .fill("Arquitetura Geral");
    await page.getByTestId("wizard-config-allow-relayout-checkbox").uncheck();
    await waitForApiResponse({
      page,
      method: "PUT",
      pathIncludes: "/wizard-draft",
      context: "wizard save config draft for policy scenario",
      action: () => page.getByTestId("wizard-save-draft-button").click(),
    });

    await page.reload();
    await expect(page.getByTestId("wizard-current-panel")).toContainText("3. Configuracao");
    await expect(page.getByTestId("wizard-config-root-node-name-input")).toHaveValue(
      "Arquitetura Geral",
    );
    await expect(page.getByTestId("wizard-config-allow-relayout-checkbox")).not.toBeChecked();

    await waitForApiResponse({
      page,
      method: "PUT",
      pathIncludes: "/wizard-draft",
      context: "wizard next (revisao) for policy scenario",
      action: () => page.getByTestId("wizard-next-button").click(),
    });
    await expect(page.getByTestId("wizard-current-panel")).toContainText("4. Revisao");

    await waitForApiResponse({
      page,
      method: "PUT",
      pathIncludes: "/wizard-draft",
      context: "wizard next (gerar) for policy scenario",
      action: () => page.getByTestId("wizard-next-button").click(),
    });
    await expect(page.getByTestId("wizard-current-panel")).toContainText(
      "5. Gerar e abrir editor",
    );

    const saveDraftBeforeGeneratePromise = waitForApiResponse({
      page,
      method: "PUT",
      pathIncludes: "/wizard-draft",
      context: "wizard save draft before generate for policy scenario",
    });
    const generateSnapshotPromise = waitForApiResponse({
      page,
      method: "POST",
      pathIncludes: "/wizard-generate",
      context: "wizard generate snapshot for policy scenario",
    });
    await page.getByTestId("wizard-generate-button").click();
    await saveDraftBeforeGeneratePromise;
    await generateSnapshotPromise;
    await expect(page.getByTestId("wizard-open-editor-button")).toBeVisible();
    await page.getByTestId("wizard-open-editor-button").click();

    await expect(page).toHaveURL(new RegExp(`/editor\\?projectId=${project.id}`), {
      timeout: 30_000,
    });
    await waitForEditorReady(page);
    await expect(page.getByTestId("reapply-layout-button")).toBeDisabled();
    await expect(page.getByTestId("layout-policy-badge")).toContainText(
      "Layout bloqueado",
    );
    await expect(page.getByTestId("layout-policy-open-wizard-link")).toBeVisible();

    const persistedSnapshot = await loadEditorSnapshot(page, project.id);
    expect(
      persistedSnapshot.nodes.some((node) => node.label === "Arquitetura Geral"),
    ).toBe(true);
    expect(persistedSnapshot.allowReapplyLayout).toBe(false);
  });

  test("Fase 3C.1: controles de versao (criar, atualizar lista, comparar e restaurar)", async ({
    authenticatedPage: page,
  }) => {
    const project = await createProjectAndOpenEditor(page, "E2E Editor Versions");

    const saveBadge = page.getByTestId("save-status-badge");
    const versionList = page.getByTestId("version-list");
    const nodeLocator = page.locator('[data-testid^="editor-node-"]');
    const initialNodeCount = await nodeLocator.count();

    expect(initialNodeCount).toBeGreaterThan(0);
    await expect(saveBadge).toHaveAttribute("data-save-status", "saved");
    await expect(versionList).toBeVisible();

    const listVersionsPath = `/api/projects/${project.id}/snapshot-versions`;
    const createVersionResponse = await waitForApiResponse({
      page,
      method: "POST",
      pathExact: listVersionsPath,
      context: "editor create snapshot version",
      action: () => page.getByTestId("create-version-button").click(),
    });

    const createVersionPayload = (await createVersionResponse.json()) as {
      data?: {
        message?: string;
        snapshotVersion?: { id?: string; projectId?: string };
      };
    };
    const versionId = createVersionPayload.data?.snapshotVersion?.id;
    if (!versionId) {
      throw new Error("Create snapshot version API response is missing snapshotVersion.id.");
    }

    expect(createVersionPayload.data?.snapshotVersion?.projectId).toBe(project.id);
    await expect(page.getByTestId("create-version-feedback")).toBeVisible();
    await expect(page.getByTestId("create-version-feedback")).toContainText(
      "Versao criada com sucesso",
    );

    const refreshVersionsButton = page.getByTestId("version-list-refresh-button");
    await expect(refreshVersionsButton).toBeEnabled({ timeout: E2E_API_TIMEOUT_MS });

    const listVersionsResponse = await waitForApiResponse({
      page,
      method: "GET",
      pathExact: listVersionsPath,
      context: "editor refresh snapshot versions list",
      action: () => refreshVersionsButton.click(),
    });
    const listVersionsPayload = (await listVersionsResponse.json()) as {
      data?: {
        snapshotVersions?: Array<{ id: string }>;
      };
    };
    expect(
      listVersionsPayload.data?.snapshotVersions?.some((version) => version.id === versionId),
    ).toBe(true);

    const versionItem = page.getByTestId(`version-item-${versionId}`);
    const compareButton = page.getByTestId(`version-compare-button-${versionId}`);
    const restoreButton = page.getByTestId(`version-restore-button-${versionId}`);

    await expect(versionItem).toBeVisible();
    await expect(page.getByTestId("version-action-feedback")).toContainText(
      "Versoes atualizadas",
    );

    const diffPath = `/api/projects/${project.id}/snapshot-versions/${versionId}/diff`;
    const firstDiffResponse = await waitForApiResponse({
      page,
      method: "GET",
      pathExact: diffPath,
      context: "editor compare version without changes",
      action: () => compareButton.click(),
    });
    const firstDiffPayload = (await firstDiffResponse.json()) as {
      data?: {
        version?: { id?: string };
        diff?: { hasChanges?: boolean };
      };
    };
    expect(firstDiffPayload.data?.version?.id).toBe(versionId);
    expect(firstDiffPayload.data?.diff?.hasChanges).toBe(false);
    await expect(page.getByTestId("version-diff-feedback")).toBeVisible();
    await expect(page.getByTestId("version-diff-feedback")).toContainText(
      "Sem alteracoes entre a versao selecionada e o snapshot de trabalho.",
    );
    await expect(page.getByTestId("version-diff-executive-summary")).toBeVisible();
    await expect(page.getByTestId("version-diff-card-nodes-added")).toBeVisible();
    await expect(page.getByTestId("version-diff-card-nodes-removed")).toBeVisible();
    await expect(page.getByTestId("version-diff-card-nodes-changed")).toBeVisible();
    await expect(page.getByTestId("version-diff-card-edges-changed")).toBeVisible();

    await runActionAndWaitForAutosave(
      page,
      () => addNodeViaGuidedFlow(page, { title: `No Compare ${Date.now()}` }),
      { context: "add node before compare/restore snapshot version" },
    );
    await expect.poll(async () => nodeLocator.count()).toBe(initialNodeCount + 1);
    await expect(saveBadge).toHaveAttribute("data-save-status", "saved");

    await expect(compareButton).toBeEnabled();
    const secondDiffResponse = await waitForApiResponse({
      page,
      method: "GET",
      pathExact: diffPath,
      context: "editor compare version after local graph change",
      action: () => compareButton.click(),
    });
    const secondDiffPayload = (await secondDiffResponse.json()) as {
      data?: {
        version?: { id?: string };
        diff?: {
          hasChanges?: boolean;
          nodesAdded?: string[];
          summary?: { added?: number; removed?: number; changed?: number };
        };
      };
    };
    expect(secondDiffPayload.data?.version?.id).toBe(versionId);
    expect(secondDiffPayload.data?.diff?.hasChanges).toBe(true);
    expect(secondDiffPayload.data?.diff?.nodesAdded?.length ?? 0).toBeGreaterThan(0);
    expect((secondDiffPayload.data?.diff?.summary?.added ?? 0) >= 1).toBe(true);
    await expect(page.getByTestId("version-diff-feedback")).toContainText("Resumo:");
    await expect(page.getByTestId("version-diff-feedback")).toContainText(
      "no(s) adicionados",
    );
    await expect(page.getByTestId("version-diff-top-changes")).toBeVisible();

    const restorePath = `/api/projects/${project.id}/snapshot-versions/${versionId}/restore`;
    const restoreResponse = await waitForApiResponse({
      page,
      method: "POST",
      pathExact: restorePath,
      context: "editor restore snapshot version",
      action: async () => {
        page.once("dialog", async (dialog) => {
          expect(dialog.type()).toBe("confirm");
          await dialog.accept();
        });
        await restoreButton.click();
      },
    });
    const restorePayload = (await restoreResponse.json()) as {
      data?: {
        message?: string;
        restoredFromVersionId?: string;
        workingSnapshot?: {
          snapshot?: {
            nodes?: Array<{ id: string }>;
          };
        };
      };
    };
    expect(restorePayload.data?.restoredFromVersionId).toBe(versionId);
    expect(restorePayload.data?.workingSnapshot?.snapshot?.nodes?.length).toBe(
      initialNodeCount,
    );

    await expect(page.getByTestId("version-action-feedback")).toBeVisible();
    await expect(page.getByTestId("version-action-feedback")).toContainText(
      "restaurado com sucesso",
    );
    await expect(page.getByTestId("inspector-empty-state")).toBeVisible();
    await expect.poll(async () => nodeLocator.count()).toBe(initialNodeCount);
    await expect(saveBadge).toHaveAttribute("data-save-status", "saved");

    await runActionAndWaitForManualSave(
      page,
      () => page.getByTestId("save-button").click(),
      "manual save after snapshot restore",
    );
    await expect(page.getByTestId("save-status-badge")).toHaveAttribute(
      "data-save-status",
      "saved",
    );
  });

  test("Fase 5.2: cria versao com nome e confirma feedback local", async ({
    authenticatedPage: page,
  }) => {
    const project = await createProjectAndOpenEditor(page, "E2E Version Name");
    const versionName = `Baseline ${Date.now()}`;
    const listVersionsPath = `/api/projects/${project.id}/snapshot-versions`;

    await page.getByLabel("Nome da nova versao (local)").fill(versionName);

    const createVersionResponse = await waitForApiResponse({
      page,
      method: "POST",
      pathExact: listVersionsPath,
      context: "editor create named snapshot version",
      action: () => page.getByTestId("create-version-button").click(),
    });
    const createVersionPayload = (await createVersionResponse.json()) as {
      data?: {
        snapshotVersion?: { id?: string; label?: string };
      };
    };
    const versionId = createVersionPayload.data?.snapshotVersion?.id;
    if (!versionId) {
      throw new Error("Create version response is missing snapshotVersion.id.");
    }

    expect(createVersionPayload.data?.snapshotVersion?.label).toBe(versionName);
    await expect(page.getByTestId("create-version-feedback")).toBeVisible();
    await expect(page.getByTestId("create-version-feedback")).toContainText(
      "Versao criada com sucesso",
    );

    await waitForApiResponse({
      page,
      method: "GET",
      pathExact: listVersionsPath,
      context: "editor refresh named version list",
      action: () => page.getByTestId("version-list-refresh-button").click(),
    });

    const versionItem = page.getByTestId(`version-item-${versionId}`);
    await expect(versionItem).toBeVisible({ timeout: E2E_API_TIMEOUT_MS });
    await expect(versionItem).toContainText(versionName);

    const localName = `${versionName} local`;
    await page.getByTestId(`version-name-input-${versionId}`).fill(localName);
    await page.getByTestId(`version-save-name-button-${versionId}`).click();
    await expect(page.getByTestId("version-action-feedback")).toContainText(
      "salvo localmente",
    );
    await expect(versionItem).toContainText(localName);
  });
});
