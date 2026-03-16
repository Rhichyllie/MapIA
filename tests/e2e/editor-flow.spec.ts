import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

type CreatedProject = {
  id: string;
  name: string;
};

const DASHBOARD_HYDRATION_SETTLE_MS = 300;
const E2E_API_TIMEOUT_MS = 20_000;
const BASE_ASSISTANT_AUTOMATION = {
  inferRelations: true,
  createLinkFields: true,
  applySuggestedNames: true,
  autoOrganizeOnCreate: true,
  detectInconsistenciesEarly: true,
};

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
  if (!page.url().includes("/dashboard")) {
    await page.goto("/dashboard");
  }

  await expect(page.getByTestId("workspace-toolbar")).toBeVisible();
  const newProjectButton = page.getByTestId("new-project-button");
  const newProjectDrawer = page.getByTestId("new-project-drawer");

  await expect(newProjectButton).toBeVisible();

  let drawerVisible = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await newProjectButton.click();
    try {
      await expect(newProjectDrawer).toBeVisible({ timeout: 3_000 });
      drawerVisible = true;
      break;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
    }
  }

  expect(drawerVisible).toBe(true);
  await expect(page.getByTestId("dashboard-create-project-form")).toBeVisible();
  // Intentional fixed wait: Next.js dev mode can render client markup before
  // React event handlers hydrate. This is the only fixed delay kept in the spec.
  await page.waitForTimeout(DASHBOARD_HYDRATION_SETTLE_MS);
}

async function createProjectFromDashboard(
  page: Page,
  prefix = "E2E Editor",
  options?: {
    openWizard?: boolean;
    template?: "graph" | "sitemap" | "flowchart" | "erd";
  },
) {
  const project = buildProjectIdentity(prefix);

  await waitForDashboardCreateFormReady(page);

  const nameInput = page.getByTestId("dashboard-project-name-input");
  await nameInput.fill(project.name);
  await expect(nameInput).toHaveValue(project.name);

  if (options?.template) {
    await page
      .getByTestId("dashboard-project-template-select")
      .selectOption(options.template);
  }

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

async function completeWizardAndOpenEditor(
  page: Page,
  projectId: string,
  options?: { diagramType?: "tree" | "flow" | "mindmap" },
) {
  const diagramType = options?.diagramType ?? "tree";

  await expect(page.getByTestId("wizard-stepper")).toBeVisible();
  await expect(page.getByTestId("wizard-current-panel")).toContainText(
    "1. Tipo de diagrama",
  );
  await page.getByTestId(`wizard-diagram-type-${diagramType}`).click();
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

async function dispatchClickOnCanvasNode(page: Page, nodeId: string) {
  await page.evaluate((targetNodeId) => {
    const element = document.querySelector<HTMLElement>(
      `[data-testid="editor-node-${targetNodeId}"]`,
    );
    if (!element) {
      return;
    }

    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, view: window }),
    );
  }, nodeId);
}

async function resolveVisibleFlowSourceNodeId(
  page: Page,
  preferredRoles: string[] = ["flow-step", "flow-start"],
) {
  return page.evaluate((roles) => {
    const wrappers = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid^="editor-node-"]'),
    );
    const entries = wrappers
      .map((wrapper) => ({
        id: wrapper.dataset.testid?.replace("editor-node-", "") ?? "",
        role:
          wrapper.querySelector<HTMLElement>("[data-diagram-role]")?.dataset.diagramRole ??
          wrapper.querySelector<HTMLElement>("[data-flow-variant]")?.dataset.flowVariant ??
          "",
      }))
      .filter((entry) => entry.id.length > 0);

    return (
      entries.find((entry) => roles.includes(entry.role))?.id ??
      entries[0]?.id ??
      null
    );
  }, preferredRoles);
}

async function readCanvasNodeBoxes(page: Page) {
  return page.evaluate(() => {
    const entries = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid^="editor-node-"]'),
    )
      .map((element) => {
        const id = element.dataset.testid?.replace("editor-node-", "") ?? "";
        const rect = element.getBoundingClientRect();
        if (!id) {
          return null;
        }

        return [
          id,
          {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        ] as const;
      })
      .filter((entry): entry is readonly [string, { x: number; y: number; width: number; height: number }] =>
        Boolean(entry),
      );

    return Object.fromEntries(entries);
  });
}

function countMovedCanvasNodes(
  before: Record<string, { x: number; y: number }>,
  after: Record<string, { x: number; y: number }>,
  threshold = 32,
) {
  return Object.entries(before).filter(([nodeId, beforeBox]) => {
    const afterBox = after[nodeId];
    if (!afterBox) {
      return false;
    }

    return (
      Math.abs(afterBox.x - beforeBox.x) > threshold ||
      Math.abs(afterBox.y - beforeBox.y) > threshold
    );
  }).length;
}

async function readVisibleFlowNodeIdsByRole(page: Page) {
  return page.evaluate(() => {
    const wrappers = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid^="editor-node-"]'),
    );
    const idsByRole: Record<string, string[]> = {};

    for (const wrapper of wrappers) {
      const nodeId = wrapper.dataset.testid?.replace("editor-node-", "") ?? "";
      const role =
        wrapper.querySelector<HTMLElement>("[data-flow-variant]")?.dataset.flowVariant ??
        wrapper.querySelector<HTMLElement>("[data-diagram-role]")?.dataset.diagramRole ??
        "";
      if (!nodeId || !role) {
        continue;
      }

      idsByRole[role] = [...(idsByRole[role] ?? []), nodeId];
    }

    return idsByRole;
  });
}

async function openFlowSelectionMoreMenu(page: Page) {
  const moreButton = page.getByTestId("selection-hud-flow-more-button");
  const menu = page.getByTestId("selection-hud-flow-more-menu");

  await expect(moreButton).toBeVisible();

  if ((await menu.count()) === 0) {
    await moreButton.click();
  }

  await expect(menu).toBeVisible();
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
    try {
      await page.getByTestId("add-node-confirm-button").click({ timeout: 5_000 });
    } catch {
      await titleInput.press("Enter");
    }
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
          edges: Array<{
            id: string;
            sourceNodeId: string;
            targetNodeId: string;
            kind: string;
          }>;
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

async function applyEditorCommand(
  page: Page,
  projectId: string,
  command: Record<string, unknown>,
  context: string,
) {
  const response = await page.request.post(`/api/projects/${projectId}/editor-commands`, {
    data: {
      command,
    },
  });
  await assertApiResponseOk(response, context);
}

async function forceSnapshotDiagramType(
  page: Page,
  projectId: string,
  diagramType: "erd" | "tree" | "flow" | "mindmap",
) {
  const loadResponse = await page.request.get(`/api/projects/${projectId}/editor-snapshot`);
  await assertApiResponseOk(loadResponse, "load snapshot before overriding diagram type");
  const loadPayload = (await loadResponse.json()) as {
    data?: {
      workingSnapshot?: {
        snapshot?: Record<string, unknown>;
      } | null;
    };
  };

  const snapshot = loadPayload.data?.workingSnapshot?.snapshot as
    | Record<string, unknown>
    | undefined;
  if (!snapshot) {
    throw new Error("Could not load working snapshot before overriding diagram type.");
  }

  const response = await page.request.put(
    `/api/projects/${projectId}/working-snapshot`,
    {
      data: {
        label: `e2e-semantic-${Date.now()}`,
        snapshot: {
          ...snapshot,
          diagramType,
        },
      },
    },
  );

  await assertApiResponseOk(response, "override snapshot diagram type");
}

async function waitForSemanticConnectHook(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const globalState = window as Window & {
            __mapiaE2eConnectNodes?: unknown;
          };
          return typeof globalState.__mapiaE2eConnectNodes;
        }),
      { timeout: 8_000 },
    )
    .toBe("function");
}

async function connectNodesViaSemanticHook(
  page: Page,
  sourceNodeId: string,
  targetNodeId: string,
) {
  await waitForSemanticConnectHook(page);
  return page.evaluate(
    ({ sourceNodeId: source, targetNodeId: target }) => {
      const globalState = window as Window & {
        __mapiaE2eConnectNodes?: (
          sourceNodeId: string,
          targetNodeId: string,
        ) => Promise<boolean>;
      };

      return globalState.__mapiaE2eConnectNodes?.(source, target) ?? false;
    },
    { sourceNodeId, targetNodeId },
  );
}

async function hasEdgeBetweenNodes(
  page: Page,
  projectId: string,
  sourceNodeId: string,
  targetNodeId: string,
  expectedKind?: string,
) {
  const snapshot = await loadEditorSnapshot(page, projectId);
  return snapshot.edges.some((edge) => {
    if (edge.sourceNodeId !== sourceNodeId || edge.targetNodeId !== targetNodeId) {
      return false;
    }

    if (expectedKind && edge.kind !== expectedKind) {
      return false;
    }

    return true;
  });
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

  if (response.ok()) {
    return true;
  }

  const body = await readResponseDebugBody(response);
  if (response.status() === 400 && body.toLowerCase().includes("already exists")) {
    return false;
  }

  throw new Error(
    `[create edge via API fallback] request failed (${response.status()}): ${body}`,
  );
}

async function clickEditorPane(page: Page) {
  const pane = page.locator('[data-testid="editor-canvas"] .react-flow__pane');
  const box = await pane.boundingBox();
  if (!box) {
    throw new Error("Could not resolve React Flow pane bounding box.");
  }

  await page.mouse.click(box.x + 24, box.y + 24);
}

async function createProjectAndOpenEditor(
  page: Page,
  prefix: string,
  options?: {
    diagramType?: "tree" | "flow" | "mindmap";
    template?: "graph" | "sitemap" | "flowchart" | "erd";
  },
) {
  const project = await createProjectFromDashboard(page, prefix, {
    template: options?.template,
  });
  await completeWizardAndOpenEditor(page, project.id, {
    diagramType: options?.diagramType,
  });
  await waitForEditorReady(page);
  return project;
}

async function createFlowProjectViaAssistantAndOpenEditor(
  page: Page,
  prefix: string,
) {
  const name = `${prefix} ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const response = await page.request.post("/api/projects/create-with-assistant", {
    data: {
      projectName: name,
      projectObjective: "Validar polimento visual do modo Processo",
      profile: "process",
      startStrategy: "manual",
      initialView: "flow",
      layout: "horizontal",
      detailLevel: "intermediate",
      automation: BASE_ASSISTANT_AUTOMATION,
      context: {
        setup: {
          createExamples: true,
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

  await assertApiResponseOk(response, "create flow project via assistant");

  const payload = (await response.json()) as {
    data?: {
      projectId?: string;
    };
  };
  const projectId = payload.data?.projectId;
  if (!projectId) {
    throw new Error("Assistant create API did not return a projectId.");
  }

  await page.goto(`/editor?projectId=${projectId}`);
  await waitForEditorReady(page);
  return { id: projectId, name } satisfies CreatedProject;
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

  test("Fase 5.7 Semantica: bloqueia conexao invalida em ERD com assistant", async ({
    authenticatedPage: page,
  }) => {
    const project = await createProjectAndOpenEditor(page, "E2E Semantic ERD");

    await runActionAndWaitForAutosave(
      page,
      () => addNodeViaGuidedFlow(page, { title: `Entidade ${Date.now()}`, kind: "entity" }),
      { context: "add entity node before ERD semantic validation" },
    );
    await setInspectorMode(page, "technical");
    const entityNodeId = await getRequiredText(
      page.getByTestId("inspector-node-id"),
      "entity node id",
    );

    await runActionAndWaitForAutosave(
      page,
      () =>
        addNodeViaGuidedFlow(page, {
          title: `Etapa ${Date.now()}`,
          kind: "flow-step",
        }),
      { context: "add flow-step node before ERD semantic validation" },
    );
    const flowStepNodeId = await getRequiredText(
      page.getByTestId("inspector-node-id"),
      "flow-step node id",
    );

    await forceSnapshotDiagramType(page, project.id, "erd");
    await page.reload();
    await waitForEditorReady(page);
    await assertCanvasRenderer(page, "erd");

    const createdEdge = await connectNodesViaSemanticHook(page, entityNodeId, flowStepNodeId);
    expect(createdEdge).toBe(false);
    await expect(page.getByTestId("semantic-connection-assistant")).toBeVisible();
    await expect(page.getByTestId("semantic-connection-assistant")).toContainText(
      "Conexao invalida",
    );
    await page.getByTestId("semantic-connection-cancel").click();
    await expect(page.getByTestId("semantic-connection-assistant")).toHaveCount(0);
  });

  test("Fase 5.7 Semantica: troca de tipo abre repair dialog e aplica correcao", async ({
    authenticatedPage: page,
  }) => {
    const project = await createProjectAndOpenEditor(page, "E2E Semantic Repair", {
      diagramType: "flow",
    });

    await setInspectorMode(page, "technical");

    await runActionAndWaitForAutosave(
      page,
      () =>
        addNodeViaGuidedFlow(page, {
          title: `Etapa A ${Date.now()}`,
          kind: "flow-step",
        }),
      { context: "add first flow-step before repair dialog scenario" },
    );
    const sourceNodeId = await getRequiredText(
      page.getByTestId("inspector-node-id"),
      "source node id",
    );

    await runActionAndWaitForAutosave(
      page,
      () =>
        addNodeViaGuidedFlow(page, {
          title: `Etapa B ${Date.now()}`,
          kind: "flow-step",
        }),
      { context: "add second flow-step before repair dialog scenario" },
    );
    const targetNodeId = await getRequiredText(
      page.getByTestId("inspector-node-id"),
      "target node id",
    );

    const hasFlowEdgeBeforeCreation = await hasEdgeBetweenNodes(
      page,
      project.id,
      sourceNodeId,
      targetNodeId,
      "flows-to",
    );

    if (!hasFlowEdgeBeforeCreation) {
      const createdViaHook = await connectNodesViaSemanticHook(
        page,
        sourceNodeId,
        targetNodeId,
      );
      if (createdViaHook) {
        await waitForAutosaveCycle(page, { requireDirty: false });
      } else {
        const createdViaApi = await createEdgeViaApiFallback(
          page,
          project.id,
          sourceNodeId,
          targetNodeId,
        );
        if (createdViaApi) {
          await page.reload();
          await waitForEditorReady(page);
          await setInspectorMode(page, "technical");
        }
      }
    }

    const hasFlowEdgeAfterCreation = await hasEdgeBetweenNodes(
      page,
      project.id,
      sourceNodeId,
      targetNodeId,
      "flows-to",
    );
    expect(hasFlowEdgeAfterCreation).toBe(true);

    const edgeLocator = page.locator('[data-testid^="editor-edge-"]');
    const edgeCountBeforeRepair = await edgeLocator.count();
    expect(edgeCountBeforeRepair).toBeGreaterThan(0);

    await page.getByTestId(`editor-node-${sourceNodeId}`).click();
    await page.getByTestId("inspector-node-kind").selectOption("entity");
    await page.getByTestId("inspector-apply-node").click();

    await expect(page.getByTestId("semantic-repair-dialog")).toBeVisible();
    await runActionAndWaitForAutosave(
      page,
      () => page.getByTestId("semantic-repair-apply-fix").click(),
      { context: "apply semantic repair after node kind change" },
    );
    await expect(page.getByTestId("semantic-repair-dialog")).toHaveCount(0);

    await expect
      .poll(async () => edgeLocator.count(), { timeout: E2E_API_TIMEOUT_MS })
      .toBeLessThan(edgeCountBeforeRepair);
    await expect(
      page.getByTestId(`editor-node-${sourceNodeId}`).locator('[data-node-kind="entity"]'),
    ).toBeVisible();
  });

  test("Fase 5.7 Semantica: Verificar lista issues e Ir para seleciona item", async ({
    authenticatedPage: page,
  }) => {
    await createProjectAndOpenEditor(page, "E2E Semantic Audit", {
      diagramType: "flow",
    });
    await setInspectorMode(page, "technical");

    await runActionAndWaitForAutosave(
      page,
      () =>
        addNodeViaGuidedFlow(page, {
          title: `No fora do perfil ${Date.now()}`,
          kind: "entity",
        }),
      { context: "create semantic issue before audit panel assertion" },
    );
    const problematicNodeId = await getRequiredText(
      page.getByTestId("inspector-node-id"),
      "problematic node id",
    );

    await clickEditorPane(page);
    await page.getByTestId("semantic-audit-button").click();

    await expect(page.getByTestId("semantic-audit-panel")).toBeVisible();
    await expect(page.getByTestId("semantic-audit-issues")).toBeVisible();
    await page
      .locator('[data-testid^="semantic-issue-item-"]')
      .filter({ hasText: "No fora do perfil" })
      .first()
      .getByRole("button", { name: "Ir para" })
      .click();

    await expect(page.getByTestId("inspector-node-id")).toContainText(problematicNodeId);
    await expect(page.getByTestId("canvas-selection-semantic-status")).toContainText(
      "Semantica",
    );
  });

  test("Fase 5.7 Editor: atalhos Delete/Ctrl+C/Ctrl+V/Ctrl+X/Ctrl+D", async ({
    authenticatedPage: page,
  }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await createProjectAndOpenEditor(page, "E2E Keyboard Shortcuts");
    await setInspectorMode(page, "technical");

    const nodeLocator = page.locator('[data-testid^="editor-node-"]');
    const initialNodeCount = await nodeLocator.count();

    await runActionAndWaitForAutosave(
      page,
      () => addNodeViaGuidedFlow(page, { title: `No atalhos ${Date.now()}` }),
      { context: "create node before keyboard shortcuts assertions" },
    );
    await expect.poll(async () => nodeLocator.count()).toBe(initialNodeCount + 1);
    const createdNodeId = await getRequiredText(
      page.getByTestId("inspector-node-id"),
      "created node id",
    );

    await page.getByTestId(`editor-node-${createdNodeId}`).click();
    await runActionAndWaitForAutosave(
      page,
      () => page.keyboard.press("ControlOrMeta+D"),
      { context: "duplicate selected node via keyboard shortcut" },
    );
    await expect.poll(async () => nodeLocator.count()).toBe(initialNodeCount + 2);
    const duplicatedNodeId = await getRequiredText(
      page.getByTestId("inspector-node-id"),
      "duplicated node id",
    );

    await page.keyboard.press("ControlOrMeta+C");
    await runActionAndWaitForAutosave(
      page,
      () => page.keyboard.press("ControlOrMeta+V"),
      { context: "paste selected node via keyboard shortcut" },
    );
    await expect.poll(async () => nodeLocator.count()).toBe(initialNodeCount + 3);
    const pastedNodeId = await getRequiredText(
      page.getByTestId("inspector-node-id"),
      "pasted node id",
    );

    await runActionAndWaitForAutosave(
      page,
      () => page.keyboard.press("ControlOrMeta+X"),
      { context: "cut selected node via keyboard shortcut" },
    );
    await expect.poll(async () => nodeLocator.count()).toBe(initialNodeCount + 2);
    await expect(page.getByTestId(`editor-node-${pastedNodeId}`)).toHaveCount(0);

    await page.getByTestId(`editor-node-${duplicatedNodeId}`).click();
    await runActionAndWaitForAutosave(
      page,
      () => page.keyboard.press("Delete"),
      { context: "delete selected node via keyboard shortcut" },
    );
    await expect.poll(async () => nodeLocator.count()).toBe(initialNodeCount + 1);
  });

  test("Fase 5.7 ERD: import Prisma gera entities/references e passa audit", async ({
    authenticatedPage: page,
  }) => {
    const project = await createProjectAndOpenEditor(page, "E2E ERD Import Audit");

    const policyResponse = await page.request.put(
      `/api/projects/${project.id}/semantic/policy`,
      {
        data: {
          diagramType: "erd",
          strictEnabled: true,
          enforceOnServer: true,
        },
      },
    );
    await assertApiResponseOk(policyResponse, "set semantic policy diagramType=erd before import");

    const schema = `
model User {
  id    String @id @default(cuid())
  posts Post[]
}

model Post {
  id       String @id @default(cuid())
  authorId String
  author   User   @relation(fields: [authorId], references: [id], onDelete: Cascade, onUpdate: Cascade)
}
`;

    const importResponse = await page.request.post(
      `/api/projects/${project.id}/imports/prisma-schema`,
      {
        data: {
          schema,
        },
      },
    );
    await assertApiResponseOk(importResponse, "import prisma schema into ERD snapshot");

    await page.reload();
    await waitForEditorReady(page);
    await assertCanvasRenderer(page, "erd");

    const snapshot = await loadEditorSnapshot(page, project.id);
    expect(snapshot.nodes.filter((node) => node.kind === "entity").length).toBeGreaterThanOrEqual(2);
    expect(snapshot.edges.some((edge) => edge.kind === "references")).toBe(true);

    await clickEditorPane(page);
    await page.getByTestId("semantic-audit-button").click();
    await expect(page.getByTestId("semantic-audit-panel")).toBeVisible();
    await expect(page.getByTestId("semantic-audit-empty")).toBeVisible();
  });

  test("Fase 5.8 Flow: adicionar proxima etapa posiciona a direita e conecta flows-to", async ({
    authenticatedPage: page,
  }) => {
    const project = await createFlowProjectViaAssistantAndOpenEditor(
      page,
      "E2E Flow Diferenca",
    );

    await setInspectorMode(page, "technical");
    const sourceNodeId = await resolveVisibleFlowSourceNodeId(page);
    if (!sourceNodeId) {
      throw new Error("Flow sem no visivel para validar adicao contextual.");
    }

    const sourceLocator = page.getByTestId(`editor-node-${sourceNodeId}`);
    const nodeLocator = page.locator('[data-testid^="editor-node-"]');
    const flowEdgeLocator = page.locator(
      '[data-testid^="editor-edge-"].editor-edge-kind-flows-to',
    );
    const beforeNodeCount = await nodeLocator.count();
    const beforeFlowEdgeCount = await flowEdgeLocator.count();
    const sourceBox = await sourceLocator.boundingBox();
    const nodeBoxesBefore = await readCanvasNodeBoxes(page);
    if (!sourceBox) {
      throw new Error("Flow source node bounding box ausente.");
    }

    await dispatchClickOnCanvasNode(page, sourceNodeId);
    await expect(page.getByTestId("selection-hud-contextual-add-button")).toContainText(
      "Continuar fluxo",
    );

    await page.getByTestId("selection-hud-contextual-add-button").click();
    await expect
      .poll(async () => nodeLocator.count(), { timeout: E2E_API_TIMEOUT_MS })
      .toBe(beforeNodeCount + 1);

    const insertedNodeId = await getRequiredText(
      page.getByTestId("inspector-node-id"),
      "inserted flow node id",
    );
    const insertedBox = await page.getByTestId(`editor-node-${insertedNodeId}`).boundingBox();
    if (!insertedBox) {
      throw new Error("Flow inserted node bounding box ausente.");
    }
    const nodeBoxesAfter = await readCanvasNodeBoxes(page);
    const sourceBoxAfter = nodeBoxesAfter[sourceNodeId];

    expect(insertedBox.x).toBeGreaterThan(sourceBox.x);
    expect(sourceBoxAfter).toBeDefined();
    expect(Math.abs((sourceBoxAfter?.x ?? sourceBox.x) - sourceBox.x)).toBeLessThanOrEqual(12);
    expect(Math.abs((sourceBoxAfter?.y ?? sourceBox.y) - sourceBox.y)).toBeLessThanOrEqual(12);
    expect(countMovedCanvasNodes(nodeBoxesBefore, nodeBoxesAfter, 36)).toBeLessThanOrEqual(2);
    await expect
      .poll(async () => flowEdgeLocator.count(), { timeout: E2E_API_TIMEOUT_MS })
      .toBeGreaterThan(beforeFlowEdgeCount);
  });

  test("Fase 5.8 Flow: criar bifurcacao posiciona abaixo do tronco e conecta depends-on", async ({
    authenticatedPage: page,
  }) => {
    await createFlowProjectViaAssistantAndOpenEditor(page, "E2E Flow Branch Layout");

    await setInspectorMode(page, "technical");
    const sourceNodeId = await resolveVisibleFlowSourceNodeId(page, ["flow-step", "flow-start"]);
    if (!sourceNodeId) {
      throw new Error("Flow sem no visivel para validar bifurcacao contextual.");
    }

    const sourceLocator = page.getByTestId(`editor-node-${sourceNodeId}`);
    await dispatchClickOnCanvasNode(page, sourceNodeId);
    await openFlowSelectionMoreMenu(page);
    await expect(
      page.getByTestId("selection-hud-contextual-secondary-flow-add-branch"),
    ).toContainText("Criar bifurcacao");

    const nodeLocator = page.locator('[data-testid^="editor-node-"]');
    const branchEdgeLocator = page.locator(
      '[data-testid^="editor-edge-"].editor-edge-kind-depends-on',
    );
    const beforeNodeCount = await nodeLocator.count();
    const beforeBranchEdgeCount = await branchEdgeLocator.count();
    const nodeBoxesBefore = await readCanvasNodeBoxes(page);

    await page
      .getByTestId("selection-hud-contextual-secondary-flow-add-branch")
      .click();
    await expect
      .poll(async () => nodeLocator.count(), { timeout: E2E_API_TIMEOUT_MS })
      .toBe(beforeNodeCount + 1);

    const insertedNodeId = await getRequiredText(
      page.getByTestId("inspector-node-id"),
      "inserted flow branch node id",
    );
    const insertedBox = await page.getByTestId(`editor-node-${insertedNodeId}`).boundingBox();
    const sourceBox = await sourceLocator.boundingBox();
    if (!insertedBox || !sourceBox) {
      throw new Error("Flow source/branch node bounding box ausente.");
    }
    const nodeBoxesAfter = await readCanvasNodeBoxes(page);

    expect(insertedBox.x).toBeGreaterThan(sourceBox.x + sourceBox.width * 0.45);
    expect(insertedBox.y).toBeGreaterThan(sourceBox.y + 180);
    expect(countMovedCanvasNodes(nodeBoxesBefore, nodeBoxesAfter, 36)).toBeLessThanOrEqual(1);
    await expect
      .poll(async () => branchEdgeLocator.count(), { timeout: E2E_API_TIMEOUT_MS })
      .toBeGreaterThan(beforeBranchEdgeCount);
  });

  test("Fase 5.8 Flow: registrar observacao posiciona acima do tronco e conecta references", async ({
    authenticatedPage: page,
  }) => {
    await createFlowProjectViaAssistantAndOpenEditor(page, "E2E Flow Note Layout");

    await setInspectorMode(page, "technical");
    const sourceNodeId = await resolveVisibleFlowSourceNodeId(page, ["flow-step", "flow-start"]);
    if (!sourceNodeId) {
      throw new Error("Flow sem no visivel para validar observacao contextual.");
    }

    const sourceLocator = page.getByTestId(`editor-node-${sourceNodeId}`);
    await dispatchClickOnCanvasNode(page, sourceNodeId);
    await openFlowSelectionMoreMenu(page);
    await expect(
      page.getByTestId("selection-hud-contextual-secondary-flow-add-note"),
    ).toContainText("Registrar observacao");

    const nodeLocator = page.locator('[data-testid^="editor-node-"]');
    const beforeNodeCount = await nodeLocator.count();
    const nodeBoxesBefore = await readCanvasNodeBoxes(page);

    await page
      .getByTestId("selection-hud-contextual-secondary-flow-add-note")
      .click();
    await expect
      .poll(async () => nodeLocator.count(), { timeout: E2E_API_TIMEOUT_MS })
      .toBe(beforeNodeCount + 1);

    const insertedNodeId = await getRequiredText(
      page.getByTestId("inspector-node-id"),
      "inserted flow note node id",
    );
    const insertedBox = await page.getByTestId(`editor-node-${insertedNodeId}`).boundingBox();
    const sourceBox = await sourceLocator.boundingBox();
    if (!insertedBox || !sourceBox) {
      throw new Error("Flow source/note node bounding box ausente.");
    }
    const nodeBoxesAfter = await readCanvasNodeBoxes(page);

    expect(insertedBox.x).toBeGreaterThan(sourceBox.x + sourceBox.width * 0.25);
    expect(insertedBox.y).toBeLessThan(sourceBox.y - 140);
    expect(countMovedCanvasNodes(nodeBoxesBefore, nodeBoxesAfter, 36)).toBeLessThanOrEqual(1);
    await expect(
      page
        .getByTestId(`editor-node-${insertedNodeId}`)
        .locator('[data-flow-variant="flow-note"]'),
    ).toHaveCount(1);
  });

  test("Fase 5.8 Flow: Organizar e Reaplicar layout recompõem trunk, branch e note", async ({
    authenticatedPage: page,
  }) => {
    const project = await createFlowProjectViaAssistantAndOpenEditor(
      page,
      "E2E Flow Organize Reapply",
    );

    await setInspectorMode(page, "technical");
    const sourceNodeId = await resolveVisibleFlowSourceNodeId(page, ["flow-step", "flow-start"]);
    if (!sourceNodeId) {
      throw new Error("Flow sem no visivel para validar organizar/reaplicar.");
    }

    const initialSnapshot = await loadEditorSnapshot(page, project.id);
    const idsByRoleInitial = await readVisibleFlowNodeIdsByRole(page);
    const startNodeId = idsByRoleInitial["flow-start"]?.[0];
    const stepNodeId = idsByRoleInitial["flow-step"]?.[0];
    const endNodeId = idsByRoleInitial["flow-end"]?.[0];
    const sourceNode = initialSnapshot.nodes.find((node) => node.id === sourceNodeId);
    const startNode = initialSnapshot.nodes.find((node) => node.id === startNodeId);
    const stepNode = initialSnapshot.nodes.find((node) => node.id === stepNodeId);
    const endNode = initialSnapshot.nodes.find((node) => node.id === endNodeId);
    if (!sourceNode || !startNode || !stepNode || !endNode) {
      throw new Error("Snapshot inicial do flow nao retornou trunk suficiente para organizar.");
    }

    const decisionNodeId = randomUUID();
    const noteNodeId = randomUUID();
    await applyEditorCommand(
      page,
      project.id,
      {
        type: "addNode",
        node: {
          id: decisionNodeId,
          kind: "flow-step",
          label: `Decisao ${Date.now()}`,
          position: {
            x: sourceNode.position.x + 240,
            y: sourceNode.position.y + 220,
          },
          data: {
            __mapia: {
              role: "flow-decision",
            },
          },
        },
      },
      "add flow decision via API before organize/reapply",
    );
    await applyEditorCommand(
      page,
      project.id,
      {
        type: "addEdge",
        edge: {
          id: randomUUID(),
          sourceNodeId,
          targetNodeId: decisionNodeId,
          kind: "depends-on",
          label: "bifurca",
          data: {},
        },
      },
      "connect flow decision via API before organize/reapply",
    );
    await applyEditorCommand(
      page,
      project.id,
      {
        type: "addNode",
        node: {
          id: noteNodeId,
          kind: "note",
          label: `Observacao ${Date.now()}`,
          position: {
            x: sourceNode.position.x + 110,
            y: sourceNode.position.y - 190,
          },
          data: {
            __mapia: {
              role: "flow-note",
            },
          },
        },
      },
      "add flow note via API before organize/reapply",
    );

    await page.reload();
    await waitForEditorReady(page);

    const distortPositions = async (variant: "organize" | "reapply") => {
      const offset =
        variant === "organize"
          ? { step: 260, end: 340, decision: -140, note: 310 }
          : { step: 220, end: 300, decision: -170, note: 280 };

      await applyEditorCommand(
        page,
        project.id,
        {
          type: "moveNode",
          nodeId: stepNode.id,
          position: {
            x: stepNode.position.x + 120,
            y: stepNode.position.y + offset.step,
          },
        },
        `distort step before ${variant} flow layout`,
      );
      await applyEditorCommand(
        page,
        project.id,
        {
          type: "moveNode",
          nodeId: endNode.id,
          position: {
            x: endNode.position.x - 180,
            y: endNode.position.y + offset.end,
          },
        },
        `distort end before ${variant} flow layout`,
      );
      await applyEditorCommand(
        page,
        project.id,
        {
          type: "moveNode",
          nodeId: decisionNodeId,
          position: {
            x: sourceNode.position.x - 220,
            y: sourceNode.position.y + offset.decision,
          },
        },
        `distort branch before ${variant} flow layout`,
      );
      await applyEditorCommand(
        page,
        project.id,
        {
          type: "moveNode",
          nodeId: noteNodeId,
          position: {
            x: sourceNode.position.x - 140,
            y: sourceNode.position.y + offset.note,
          },
        },
        `distort note before ${variant} flow layout`,
      );
    };

    const expectFlowComposed = async () => {
      await expect
        .poll(
          async () => {
            const sourceBox = await page.getByTestId(`editor-node-${sourceNode.id}`).boundingBox();
            const startBox = await page.getByTestId(`editor-node-${startNode.id}`).boundingBox();
            const stepBox = await page.getByTestId(`editor-node-${stepNode.id}`).boundingBox();
            const endBox = await page.getByTestId(`editor-node-${endNode.id}`).boundingBox();
            const decisionBox = await page
              .getByTestId(`editor-node-${decisionNodeId}`)
              .boundingBox();
            const noteBox = await page.getByTestId(`editor-node-${noteNodeId}`).boundingBox();
            if (!sourceBox || !startBox || !stepBox || !endBox || !decisionBox || !noteBox) {
              return false;
            }

            return (
              Math.abs(startBox.y - stepBox.y) <= 20 &&
              Math.abs(stepBox.y - endBox.y) <= 20 &&
              startBox.x < stepBox.x &&
              stepBox.x < endBox.x &&
              decisionBox.x > sourceBox.x + sourceBox.width * 0.45 &&
              decisionBox.y > sourceBox.y + 180 &&
              noteBox.x > sourceBox.x + sourceBox.width * 0.25 &&
              noteBox.y < sourceBox.y - 140
            );
          },
          { timeout: E2E_API_TIMEOUT_MS },
        )
        .toBe(true);
    };

    await distortPositions("organize");
    await page.reload();
    await waitForEditorReady(page);
    await page.getByTestId("organize-diagram-button").click();
    await expectFlowComposed();

    await distortPositions("reapply");
    await page.reload();
    await waitForEditorReady(page);
    await expect(page.getByTestId("reapply-layout-button")).toBeEnabled();
    await page.getByTestId("reapply-layout-button").click();
    await expectFlowComposed();
  });

  test("Fase 5.8 Roles Flow: badge de projeto nao aparece como Etapa e QuickAdd mostra papeis", async ({
    authenticatedPage: page,
  }) => {
    const project = await createFlowProjectViaAssistantAndOpenEditor(
      page,
      "E2E Flow Roles",
    );

    await page.getByTestId("add-node-button").click();
    await expect(page.getByTestId("add-node-dialog")).toBeVisible();
    await expect(page.getByTestId("add-node-kind-workspace")).toHaveCount(0);
    await expect(page.getByTestId("add-node-kind-project")).toHaveCount(0);
    await expect(page.getByTestId("quick-add-role-flow-start")).toBeVisible();
    await expect(page.getByTestId("quick-add-role-flow-step")).toBeVisible();
    await expect(page.getByTestId("quick-add-role-flow-decision")).toBeVisible();
    await expect(page.getByTestId("quick-add-role-flow-note")).toBeVisible();
    await expect(page.getByTestId("quick-add-role-flow-end")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("add-node-dialog")).toHaveCount(0);

    const startLocator = page
      .locator('[data-testid^="editor-node-"]')
      .filter({ hasText: "Inicio" })
      .first();
    await expect(startLocator).toBeVisible();
    await expect(startLocator).toContainText("Inicio");
    await expect(startLocator).not.toContainText("Etapa");
  });

  test("Fase 5.10 Flow UI: variantes principais usam leitura dedicada no canvas", async ({
    authenticatedPage: page,
  }) => {
    await createFlowProjectViaAssistantAndOpenEditor(page, "E2E Flow Visual Grammar");

    await setInspectorMode(page, "technical");

    const startNode = page.locator('[data-flow-variant="flow-start"]').first();
    const stepNode = page.locator('[data-flow-variant="flow-step"]').first();
    const endNode = page.locator('[data-flow-variant="flow-end"]').first();

    await expect(startNode).toBeVisible();
    await expect(stepNode).toBeVisible();
    await expect(endNode).toBeVisible();
    await expect(startNode.locator(".diagram-node-flow__badge")).toHaveText("Inicio");
    await expect(stepNode.locator(".diagram-node-flow__badge")).toHaveText("Atividade");
    await expect(stepNode.locator(".diagram-node-flow__badge")).not.toHaveText("Etapa");
    await expect(stepNode.locator(".diagram-node-flow__summary")).toHaveText(
      "Executa um trabalho observavel dentro da operacao.",
    );
    await expect(stepNode).not.toContainText("Recebe");
    await expect(stepNode).not.toContainText("Segue");
    await expect(endNode.locator(".diagram-node-flow__badge")).toHaveText("Fim");

    const sourceNodeId = await resolveVisibleFlowSourceNodeId(page, ["flow-step", "flow-start"]);
    if (!sourceNodeId) {
      throw new Error("Flow sem no visivel para validar variantes principais no canvas.");
    }

    await dispatchClickOnCanvasNode(page, sourceNodeId);
    await openFlowSelectionMoreMenu(page);
    await page
      .getByTestId("selection-hud-contextual-secondary-flow-add-branch")
      .click();
    await expect(page.locator('[data-flow-variant="flow-decision"]').first()).toBeVisible();

    await dispatchClickOnCanvasNode(page, sourceNodeId);
    await openFlowSelectionMoreMenu(page);
    await page
      .getByTestId("selection-hud-contextual-secondary-flow-add-note")
      .click();
    await expect(page.locator('[data-flow-variant="flow-note"]').first()).toBeVisible();

    const decisionNode = page.locator('[data-flow-variant="flow-decision"]').first();
    const noteNode = page.locator('[data-flow-variant="flow-note"]').first();

    await expect(startNode).toBeVisible();
    await expect(stepNode).toBeVisible();
    await expect(decisionNode).toBeVisible();
    await expect(noteNode).toBeVisible();
    await expect(endNode).toBeVisible();
    await expect(decisionNode.locator(".diagram-node-flow__badge")).toHaveText("Decisao");
    await expect(decisionNode).not.toContainText("Ponto de decisao");
    await expect(decisionNode.locator(".diagram-node-flow__summary")).toHaveText(
      "Avalia uma regra e abre caminhos alternativos.",
    );
    await expect(noteNode.locator(".diagram-node-flow__badge")).toHaveText("Observacao");
    await expect(noteNode).not.toContainText("Anotacao operacional");
    await expect(noteNode.locator(".diagram-node-flow__summary")).toHaveText(
      "Registra risco, excecao ou contexto sem mover o fluxo.",
    );
    await expect
      .poll(async () => {
        const labels = await page.locator(".react-flow__edge-text").allTextContents();
        return labels.join(" ");
      })
      .toContain("Condicao");
    await expect
      .poll(async () => {
        const labels = await page.locator(".react-flow__edge-text").allTextContents();
        return labels.join(" ");
      })
      .toContain("Observacao");
  });

  test("Fase 5.9 Flow UI: canvas lidera a tela e inspetor le o processo antes da edicao", async ({
    authenticatedPage: page,
  }) => {
    await createFlowProjectViaAssistantAndOpenEditor(page, "E2E Flow UI Polish");
    const clickFlowNodeById = async (nodeId: string) => {
      await page.evaluate((targetNodeId) => {
        const element = document.querySelector<HTMLElement>(
          `[data-testid="editor-node-${targetNodeId}"]`,
        );
        element?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true, view: window }),
        );
      }, nodeId);
    };

    const readFlowNodeIds = async () =>
      page.evaluate(() => {
        const wrappers = Array.from(
          document.querySelectorAll<HTMLElement>('[data-testid^="editor-node-"]'),
        );
        const resolveNodeId = (variant: string) =>
          wrappers
            .find((wrapper) =>
              wrapper.querySelector<HTMLElement>(`[data-flow-variant="${variant}"]`),
            )
            ?.dataset.testid?.replace("editor-node-", "") ?? null;

        return {
          startId: resolveNodeId("flow-start"),
          stepId: resolveNodeId("flow-step"),
          decisionId: resolveNodeId("flow-decision"),
        };
      });

    const canvasBox = await page.getByTestId("editor-canvas").boundingBox();
    const metadataToggleBox = await page
      .getByTestId("editor-panel-metadata-toggle")
      .boundingBox();
    if (!canvasBox || !metadataToggleBox) {
      throw new Error("Bounding boxes ausentes para validar protagonismo do canvas.");
    }

    expect(canvasBox.y).toBeLessThan(metadataToggleBox.y);

    await setInspectorMode(page, "operational");
    const processOverview = page.getByTestId("process-inspector-overview");
    const initialFlowNodes = await readFlowNodeIds();
    if (!initialFlowNodes.startId || !initialFlowNodes.stepId) {
      throw new Error("Fluxo sem nos suficientes para validar overview operacional.");
    }

    await clickFlowNodeById(initialFlowNodes.startId);
    await expect(processOverview).toBeVisible();
    await expect(processOverview).toContainText("Leitura do fluxo");
    await expect(processOverview).toContainText("Inicio");
    await expect(processOverview).toContainText("Ponto de partida");

    await clickFlowNodeById(initialFlowNodes.stepId);

    await expect(processOverview).toContainText("Etapa");
    await expect(processOverview).toContainText("Atividade");
    await expect(processOverview).toContainText("Posicao no processo");
    await expect(page.getByTestId("selection-hud-contextual-add-button")).toContainText(
      "Continuar fluxo",
    );
    await expect(page.getByTestId("selection-hud-open-inspector-button")).toContainText(
      "Editar no inspetor",
    );
    await expect(page.getByTestId("selection-hud-flow-more-button")).toBeVisible();
    await expect(page.getByTestId("selection-hud-flow-more-menu")).toHaveCount(0);
    await openFlowSelectionMoreMenu(page);
    await expect(
      page.getByTestId("selection-hud-contextual-secondary-flow-add-branch"),
    ).toContainText("Criar bifurcacao");

    await expect(page.getByTestId("process-relations-panel")).toBeVisible();
    await expect(page.getByTestId("process-relations-panel")).toContainText("Antes");
    await expect(page.getByTestId("process-relations-panel")).toContainText("Vem antes");
    await expect(page.getByTestId("inspector-panel")).not.toContainText("Papel atual:");

    const nodeLocator = page.locator('[data-testid^="editor-node-"]');
    const beforeDecisionCount = await nodeLocator.count();
    await page
      .getByTestId("selection-hud-contextual-secondary-flow-add-branch")
      .click();
    await expect
      .poll(async () => nodeLocator.count(), { timeout: E2E_API_TIMEOUT_MS })
      .toBe(beforeDecisionCount + 1);
    const flowNodesAfterBranch = await readFlowNodeIds();
    if (!flowNodesAfterBranch.decisionId) {
      throw new Error("Fluxo sem decisao visivel apos criar bifurcacao contextual.");
    }
    await clickFlowNodeById(flowNodesAfterBranch.decisionId);
    await expect(processOverview).toContainText("Decisao");
    await expect(processOverview).toContainText("Ponto de decisao");

    await page.getByRole("button", { name: "Abrir transicao" }).first().click();
    await expect(page.getByTestId("process-edge-overview")).toBeVisible();
    await expect(page.getByTestId("process-edge-overview")).toContainText(
      "Leitura da transicao",
    );
  });

  test("Fase 5.11 Flow Inspector: overview, edicao e relacoes ficam confortaveis", async ({
    authenticatedPage: page,
  }) => {
    await createFlowProjectViaAssistantAndOpenEditor(page, "E2E Flow Inspector Comfort");
    await setInspectorMode(page, "operational");

    const stepNodeId = await resolveVisibleFlowSourceNodeId(page, ["flow-step"]);
    if (!stepNodeId) {
      throw new Error("Fluxo sem etapa visivel para validar conforto do inspector.");
    }

    await dispatchClickOnCanvasNode(page, stepNodeId);

    const inspector = page.getByTestId("inspector-panel");
    const overview = page.getByTestId("process-inspector-overview");
    const identification = page.getByTestId("process-inspector-identification");
    const details = page.getByTestId("process-inspector-details");
    const relations = page.getByTestId("process-relations-panel");
    const labelInput = page.getByTestId("inspector-node-label");
    const descriptionInput = page.getByTestId("inspector-node-description");
    const tagsInput = page.getByTestId("inspector-node-tags");

    await expect(overview).toBeVisible();
    await expect(identification).toBeVisible();
    await expect(details).toBeVisible();
    await expect(relations).toBeVisible();
    await expect(page.getByTestId("process-inspector-context-actions")).toBeVisible();
    await expect(page.locator('[data-testid^="process-relation-item-"]').first()).toBeVisible();
    await expect(relations.getByRole("button", { name: "Abrir transicao" }).first()).toBeVisible();

    const inspectorBox = await inspector.boundingBox();
    const overviewBox = await overview.boundingBox();
    const identificationBox = await identification.boundingBox();
    const detailsBox = await details.boundingBox();
    const relationsBox = await relations.boundingBox();
    const labelBox = await labelInput.boundingBox();
    const descriptionBox = await descriptionInput.boundingBox();
    if (
      !inspectorBox ||
      !overviewBox ||
      !identificationBox ||
      !detailsBox ||
      !relationsBox ||
      !labelBox ||
      !descriptionBox
    ) {
      throw new Error("Bounding boxes ausentes para validar ergonomia do inspector.");
    }

    expect(inspectorBox.width).toBeGreaterThanOrEqual(360);
    expect(overviewBox.y).toBeLessThan(identificationBox.y);
    expect(identificationBox.y).toBeLessThan(detailsBox.y);
    expect(detailsBox.y).toBeLessThan(relationsBox.y);
    expect(labelBox.height).toBeGreaterThanOrEqual(48);
    expect(descriptionBox.height).toBeGreaterThanOrEqual(170);

    const updatedLabel = `Etapa conforto ${Date.now()}`;
    const updatedDescription =
      "Coordena a triagem, valida a entrada e libera a proxima passagem.";
    const updatedTags = "triagem, prioridade, fila";

    await labelInput.fill(updatedLabel);
    await descriptionInput.fill(updatedDescription);
    await tagsInput.fill(updatedTags);
    await expect(details).toContainText("triagem");
    await expect(details).toContainText("prioridade");

    await page.getByTestId("inspector-apply-node").click();
    await expect(page.getByTestId(`editor-node-${stepNodeId}`)).toContainText(updatedLabel);
    await runActionAndWaitForManualSave(
      page,
      () => page.getByTestId("save-button").click(),
      "flow inspector comfort manual save",
    );
  });

  test("Fase 5.12 Flow Interaction: menu fecha por clique fora, Escape e troca de selecao", async ({
    authenticatedPage: page,
  }) => {
    await createFlowProjectViaAssistantAndOpenEditor(page, "E2E Flow Selection Menu");
    await setInspectorMode(page, "operational");

    const stepNodeId = await resolveVisibleFlowSourceNodeId(page, ["flow-step"]);
    const startNodeId = await resolveVisibleFlowSourceNodeId(page, ["flow-start"]);
    if (!stepNodeId || !startNodeId || stepNodeId === startNodeId) {
      throw new Error("Fluxo sem nos suficientes para validar o ciclo de vida do menu.");
    }

    await dispatchClickOnCanvasNode(page, stepNodeId);
    const menu = page.getByTestId("selection-hud-flow-more-menu");

    await openFlowSelectionMoreMenu(page);
    await page.getByTestId("inspector-panel").click({ position: { x: 48, y: 48 } });
    await expect(menu).toHaveCount(0);

    await openFlowSelectionMoreMenu(page);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);

    await openFlowSelectionMoreMenu(page);
    await dispatchClickOnCanvasNode(page, startNodeId);
    await expect(menu).toHaveCount(0);
    await expect(page.getByTestId("process-inspector-overview")).toContainText(
      "Ponto de partida",
    );
  });

  test("Fase 5.12 Flow Interaction: relacao abre no e transicao abre aresta", async ({
    authenticatedPage: page,
  }) => {
    await createFlowProjectViaAssistantAndOpenEditor(page, "E2E Flow Relation Open");
    await setInspectorMode(page, "operational");

    const stepNodeId = await resolveVisibleFlowSourceNodeId(page, ["flow-step"]);
    if (!stepNodeId) {
      throw new Error("Fluxo sem etapa visivel para validar abertura de relacao.");
    }

    await dispatchClickOnCanvasNode(page, stepNodeId);
    const relations = page.getByTestId("process-relations-panel");
    await expect(relations).toBeVisible();

    await relations.getByRole("button", { name: "Abrir anterior" }).first().click();
    await expect(page.getByTestId("process-inspector-overview")).toContainText(
      "Ponto de partida",
    );
    await expect(page.getByTestId("process-edge-overview")).toHaveCount(0);

    await dispatchClickOnCanvasNode(page, stepNodeId);
    await relations.getByRole("button", { name: "Abrir transicao" }).first().click();
    await expect(page.getByTestId("process-edge-overview")).toBeVisible();
    await expect(page.getByTestId("selection-hud-open-inspector-button")).toContainText(
      "Editar transicao",
    );
  });

  test("Fase 5.8 Roles Flow: highlight semantico permite alvo valido a partir do inicio", async ({
    authenticatedPage: page,
  }) => {
    const project = await createFlowProjectViaAssistantAndOpenEditor(
      page,
      "E2E Flow Highlight",
    );
    const snapshotBefore = await loadEditorSnapshot(page, project.id);
    const sourceNode =
      snapshotBefore.nodes.find((node) => node.kind === "project") ??
      snapshotBefore.nodes.find((node) => node.kind === "flow-step");
    if (!sourceNode) {
      throw new Error("Flow sem no de origem para validar semantica de conexao.");
    }

    const targetNodeId = randomUUID();
    const targetNodeLabel = `Etapa Hook ${Date.now()}`;
    const createTargetResponse = await page.request.post(
      `/api/projects/${project.id}/editor-commands`,
      {
        data: {
          command: {
            type: "addNode",
            node: {
              id: targetNodeId,
              kind: "flow-step",
              label: targetNodeLabel,
              position: {
                x: sourceNode.position.x + 280,
                y: sourceNode.position.y + 120,
              },
              data: {},
            },
          },
        },
      },
    );
    await assertApiResponseOk(createTargetResponse, "create target flow-step via API before semantic connect check");

    await page.reload();
    await waitForEditorReady(page);

    const connected = await connectNodesViaSemanticHook(
      page,
      sourceNode.id,
      targetNodeId,
    );
    expect(connected).toBe(true);
  });

  test("Fase 5.8 Tree: adicionar filho posiciona abaixo e conecta contains", async ({
    authenticatedPage: page,
  }) => {
    const project = await createProjectAndOpenEditor(page, "E2E Tree Diferenca", {
      diagramType: "tree",
    });

    await setInspectorMode(page, "technical");
    const snapshotBefore = await loadEditorSnapshot(page, project.id);
    const parentNode = snapshotBefore.nodes[0];
    if (!parentNode) {
      throw new Error("Tree snapshot inicial sem no para validar adicao de filho.");
    }

    const parentLocator = page.getByTestId(`editor-node-${parentNode.id}`);
    const nodeLocator = page.locator('[data-testid^="editor-node-"]');
    const containsEdgeLocator = page.locator(
      '[data-testid^="editor-edge-"].editor-edge-kind-contains',
    );
    const beforeNodeCount = await nodeLocator.count();
    const beforeContainsEdgeCount = await containsEdgeLocator.count();
    await parentLocator.click();
    await expect(page.getByTestId("selection-hud-contextual-add-button")).toContainText(
      "Adicionar filho",
    );

    await page.getByTestId("selection-hud-contextual-add-button").click();
    await expect
      .poll(async () => nodeLocator.count(), { timeout: E2E_API_TIMEOUT_MS })
      .toBe(beforeNodeCount + 1);

    const childNodeId = await getRequiredText(
      page.getByTestId("inspector-node-id"),
      "inserted tree child node id",
    );
    const childBox = await page.getByTestId(`editor-node-${childNodeId}`).boundingBox();
    const parentAfterBox = await parentLocator.boundingBox();
    if (!childBox || !parentAfterBox) {
      throw new Error("Tree parent/child node bounding box ausente.");
    }

    expect(childBox.y).toBeGreaterThan(parentAfterBox.y);
    await expect
      .poll(async () => containsEdgeLocator.count(), { timeout: E2E_API_TIMEOUT_MS })
      .toBeGreaterThan(beforeContainsEdgeCount);
  });

  test("Fase 5.8 Mindmap: adicionar ramificacao posiciona radial e preserva root", async ({
    authenticatedPage: page,
  }) => {
    await createProjectAndOpenEditor(page, "E2E Mindmap Diferenca", {
      diagramType: "mindmap",
    });

    await setInspectorMode(page, "technical");
    const rootLocator = page.locator(".diagram-node-mindmap.is-root").first();
    await expect(rootLocator).toBeVisible();
    const nodeLocator = page.locator('[data-testid^="editor-node-"]');
    const relatesEdgeLocator = page.locator(
      '[data-testid^="editor-edge-"].editor-edge-kind-relates-to',
    );
    const beforeNodeCount = await nodeLocator.count();
    const beforeRelatesCount = await relatesEdgeLocator.count();
    const rootBox = await rootLocator.boundingBox();
    if (!rootBox) {
      throw new Error("Mindmap root node bounding box ausente.");
    }

    await rootLocator.click();
    await expect(page.getByTestId("selection-hud-contextual-add-button")).toContainText(
      "Adicionar ramificacao",
    );

    await page.getByTestId("selection-hud-contextual-add-button").click();
    await expect
      .poll(async () => nodeLocator.count(), { timeout: E2E_API_TIMEOUT_MS })
      .toBe(beforeNodeCount + 1);

    const branchNodeId = await getRequiredText(
      page.getByTestId("inspector-node-id"),
      "inserted mindmap branch node id",
    );
    const branchBox = await page.getByTestId(`editor-node-${branchNodeId}`).boundingBox();
    if (!branchBox) {
      throw new Error("Mindmap branch node bounding box ausente.");
    }

    const rootCenterX = rootBox.x + rootBox.width / 2;
    const rootCenterY = rootBox.y + rootBox.height / 2;
    const branchCenterX = branchBox.x + branchBox.width / 2;
    const branchCenterY = branchBox.y + branchBox.height / 2;
    const distanceFromRoot = Math.hypot(
      branchCenterX - rootCenterX,
      branchCenterY - rootCenterY,
    );
    expect(distanceFromRoot).toBeGreaterThan(100);
    await expect(rootLocator).toBeVisible();
    await expect
      .poll(async () => relatesEdgeLocator.count(), { timeout: E2E_API_TIMEOUT_MS })
      .toBeGreaterThan(beforeRelatesCount);
  });

  test("Fase 5.8 Roles Mindmap: root permanece o mesmo apos Organizar", async ({
    authenticatedPage: page,
  }) => {
    await createProjectAndOpenEditor(page, "E2E Mindmap Root Stable", {
      diagramType: "mindmap",
    });

    const rootNodeTestIdBefore = await page.evaluate(() => {
      const rootElement = document.querySelector<HTMLElement>(
        ".diagram-node-mindmap.is-root",
      );
      const wrapper = rootElement?.closest<HTMLElement>('[data-testid^="editor-node-"]');
      return wrapper?.dataset.testid ?? null;
    });

    if (!rootNodeTestIdBefore) {
      throw new Error("Nao foi possivel detectar root inicial do mindmap.");
    }

    await page.getByRole("button", { name: "Organizar" }).click();
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const rootElement = document.querySelector<HTMLElement>(
            ".diagram-node-mindmap.is-root",
          );
          const wrapper = rootElement?.closest<HTMLElement>(
            '[data-testid^="editor-node-"]',
          );
          return wrapper?.dataset.testid ?? null;
        });
      })
      .toBe(rootNodeTestIdBefore);
  });

  test("Fase 5.8 ERD: import Prisma mostra fields em tabela e references com cardinalidade", async ({
    authenticatedPage: page,
  }) => {
    const project = await createProjectAndOpenEditor(page, "E2E ERD Fields");

    const policyResponse = await page.request.put(
      `/api/projects/${project.id}/semantic/policy`,
      {
        data: {
          diagramType: "erd",
          strictEnabled: true,
          enforceOnServer: true,
        },
      },
    );
    await assertApiResponseOk(policyResponse, "set semantic policy diagramType=erd for ERD fields scenario");

    const schema = `
model User {
  id    String @id @default(cuid())
  email String @unique
  posts Post[]
}

model Post {
  id       String @id @default(cuid())
  authorId String
  author   User   @relation(fields: [authorId], references: [id])
}
`;

    const importResponse = await page.request.post(
      `/api/projects/${project.id}/imports/prisma-schema`,
      {
        data: {
          schema,
        },
      },
    );
    await assertApiResponseOk(importResponse, "import prisma schema for ERD fields scenario");

    await page.reload();
    await waitForEditorReady(page);
    await assertCanvasRenderer(page, "erd");

    const snapshot = await loadEditorSnapshot(page, project.id);
    const firstEntity = snapshot.nodes.find((node) => node.kind === "entity");
    if (!firstEntity) {
      throw new Error("ERD snapshot apos import nao retornou entidade.");
    }

    await page.getByTestId(`editor-node-${firstEntity.id}`).click();
    await expect(page.getByTestId("erd-node-fields-table").first()).toBeVisible();
    await expect(page.getByTestId("erd-node-fields-table").first()).toContainText(
      "Campo",
    );
    await expect(page.getByTestId("erd-node-fields-table").first()).toContainText("id");
    await expect(
      page.locator('[data-testid^="editor-edge-"].editor-edge-kind-references').first(),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const allLabels = await page.locator(".react-flow__edge-text").allTextContents();
        return allLabels.join(" ");
      })
      .toMatch(/1:1|1:N|N:N/);
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
