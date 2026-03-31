import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { APIResponse, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const E2E_API_TIMEOUT_MS = 20_000;
const ARTIFACT_DIR = join(
  process.cwd(),
  "test-results",
  "flow-visual-execution-recovery",
);

async function assertApiResponseOk(response: APIResponse, context: string) {
  if (response.ok()) {
    return response;
  }

  let body = "<empty response body>";
  try {
    body = JSON.stringify(await response.json());
  } catch {
    body = (await response.text()) || body;
  }

  throw new Error(
    `[${context}] request failed (${response.status()}): ${body}`,
  );
}

async function waitForEditorReady(page: Page) {
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  await expect(page.getByTestId("inspector-panel")).toBeVisible();
  await expect(page.getByTestId("save-status-badge")).toBeVisible();
  const nodeLocator = page.locator('[data-testid^="editor-node-"]');
  await expect
    .poll(async () => nodeLocator.count(), { timeout: E2E_API_TIMEOUT_MS })
    .toBeGreaterThan(5);
}

async function createFlowProjectViaAssistantAndOpenEditor(
  page: Page,
  prefix: string,
) {
  const name = `${prefix} ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const response = await page.request.post(
    "/api/projects/create-with-assistant",
    {
      data: {
        projectName: name,
        projectObjective:
          "Validar delta final da execucao corretiva do modo Fluxograma / Processo",
        profile: "process",
        startStrategy: "manual",
        initialView: "flow",
        layout: "horizontal",
        detailLevel: "intermediate",
        automation: {
          inferRelations: true,
          createLinkFields: true,
          applySuggestedNames: true,
          autoOrganizeOnCreate: true,
          detectInconsistenciesEarly: true,
        },
        context: {
          setup: {
            createExamples: true,
          },
          flow: {
            autoCreateStartEnd: true,
            allowDecisions: true,
            allowMultipleOutputs: true,
            direction: "left-right",
          },
        },
      },
    },
  );

  await assertApiResponseOk(
    response,
    "create flow recovery project via assistant",
  );
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
  return { id: projectId, name };
}

async function collectFlowVisualSummary(page: Page) {
  return page.evaluate(() => {
    const nodeEntries = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid^="editor-node-"]'),
    ).map((element) => {
      const rect = element.getBoundingClientRect();
      const flowNode =
        element.querySelector<HTMLElement>("[data-flow-variant]") ??
        element.querySelector<HTMLElement>("[data-diagram-role]");
      return {
        id: element.dataset.testid?.replace("editor-node-", "") ?? "",
        role:
          flowNode?.dataset.flowVariant ??
          flowNode?.dataset.diagramRole ??
          "unknown",
        x: Number(rect.x.toFixed(2)),
        y: Number(rect.y.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
      };
    });

    const edgeEntries = Array.from(
      document.querySelectorAll<SVGGElement>(".react-flow__edge"),
    )
      .map((edgeGroup) => {
        const groupClasses = edgeGroup.getAttribute("class") ?? "";
        const pathClasses =
          edgeGroup
            .querySelector<SVGPathElement>("path")
            ?.getAttribute("class") ?? "";
        const classes = `${groupClasses} ${pathClasses}`.trim();
        const role = classes.includes("editor-edge-flow-role-reference")
          ? "reference"
          : classes.includes("editor-edge-flow-role-decision")
            ? "decision"
            : classes.includes("editor-edge-flow-role-alternate")
              ? "alternate"
              : "main";
        const label =
          edgeGroup
            .querySelector<SVGTextElement>(".react-flow__edge-text")
            ?.textContent?.trim() ?? "";

        return {
          role,
          label,
          classes,
        };
      })
      .filter((edge) => edge.classes.includes("editor-edge-flow"));

    return {
      viewportTransform:
        document.querySelector<HTMLElement>(".react-flow__viewport")?.style
          .transform ?? "",
      nodes: nodeEntries,
      edges: edgeEntries,
    };
  });
}

test("Flow Visual Execution Recovery: gera prova visual com semantica de arestas e fixture composto", async ({
  authenticatedPage: page,
}) => {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  await page.setViewportSize({ width: 2600, height: 1800 });

  const project = await createFlowProjectViaAssistantAndOpenEditor(
    page,
    "E2E Flow Execution Recovery",
  );

  if (
    await page
      .getByTestId("reapply-layout-button")
      .isVisible()
      .catch(() => false)
  ) {
    await page.getByTestId("reapply-layout-button").click();
    await expect
      .poll(() => page.getByTestId("save-status-badge").getAttribute("class"), {
        timeout: E2E_API_TIMEOUT_MS,
      })
      .toMatch(/editor-save-badge-(dirty|saved)/);
    await page.waitForTimeout(500);
  }

  await page.getByTestId("center-diagram-button").click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document.querySelector<HTMLElement>(".react-flow__viewport")?.style
              .transform ?? "",
        ),
      { timeout: E2E_API_TIMEOUT_MS },
    )
    .toContain("0.78");

  const summary = await collectFlowVisualSummary(page);

  expect(summary.nodes.map((node) => node.role)).toEqual(
    expect.arrayContaining([
      "flow-start",
      "flow-step",
      "flow-decision",
      "flow-note",
      "flow-end",
    ]),
  );
  expect(summary.edges.map((edge) => edge.role)).toEqual(
    expect.arrayContaining(["main", "decision", "alternate", "reference"]),
  );
  expect(summary.edges.some((edge) => edge.label === "Escalonar")).toBe(true);
  expect(summary.viewportTransform).toContain("0.78");

  const screenshotPath = join(
    ARTIFACT_DIR,
    "flow-visual-execution-recovery-canvas.png",
  );
  const summaryPath = join(
    ARTIFACT_DIR,
    "flow-visual-execution-recovery-summary.json",
  );

  await page.getByTestId("editor-canvas").screenshot({
    path: screenshotPath,
  });
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        projectId: project.id,
        projectName: project.name,
        summary,
      },
      null,
      2,
    ),
  );
});
