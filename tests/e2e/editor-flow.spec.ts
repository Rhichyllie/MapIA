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
  const slug = `${prefix.toLowerCase().replace(/\s+/g, "-")}-${suffix}`.slice(
    0,
    70,
  );
  return { name, slug };
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
  await expect(page.getByTestId("dashboard-create-project-form")).toBeVisible();
  // Intentional fixed wait: Next.js dev mode can render client markup before
  // React event handlers hydrate. This is the only fixed delay kept in the spec.
  await page.waitForTimeout(DASHBOARD_HYDRATION_SETTLE_MS);
}

async function createProjectFromDashboard(page: Page, prefix = "E2E Editor") {
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
    .locator("article")
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

  await wizardLink.click();
  await expect(page).toHaveURL(new RegExp(`/wizard\\?projectId=${projectId}`));

  return { id: projectId, name: project.name } satisfies CreatedProject;
}

async function completeWizardAndOpenEditor(page: Page, projectId: string) {
  await expect(page.getByTestId("wizard-stepper")).toBeVisible();
  await expect(page.getByTestId("wizard-current-panel")).toContainText("1. Tipo");
  await page.getByTestId("wizard-diagram-type-tree").click();
  await waitForApiResponse({
    page,
    method: "PUT",
    pathIncludes: "/wizard-draft",
    context: "wizard next (tipo)",
    action: () => page.getByTestId("wizard-next-button").click(),
  });

  await expect(page.getByTestId("wizard-current-panel")).toContainText(
    "2. Origem",
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

  await expect(page.getByTestId("wizard-current-panel")).toContainText("5. Gerar");
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

    await page.getByTestId("add-node-button").click();
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
      () => page.getByTestId("add-node-button").click(),
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

    await clickEditorPane(page);
    await expect(page.getByTestId("inspector-empty-state")).toBeVisible();

    await runActionAndWaitForAutosave(
      page,
      () => page.getByTestId("add-node-button").click(),
      { context: "add node before JSON invalid inspector scenario" },
    );
    await expect(page.getByTestId("inspector-node-label")).toBeVisible();

    await page.getByTestId("inspector-node-data-json").fill('{"broken": }');
    await page.getByTestId("inspector-apply-node").click();

    const feedback = page.getByTestId("inspector-node-feedback");
    await expect(feedback).toBeVisible();
    await expect(feedback).toHaveText(
      "JSON invalido. Verifique chaves, virgulas e aspas.",
    );
    await expect(feedback).not.toContainText("ZodError");
    await expect(feedback).not.toContainText("\"issues\"");
    await expect(page.getByTestId("save-status-badge")).toHaveAttribute(
      "data-save-status",
      "saved",
    );
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

    await runActionAndWaitForAutosave(
      page,
      () => page.getByTestId("add-node-button").click(),
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
      "node(s) adicionados",
    );

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
});
