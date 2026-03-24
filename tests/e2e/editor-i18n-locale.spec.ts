import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function signInWithLocale(page: Page, email: string, password: string) {
  await page.goto("/en-US/login");
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("login-email-input").fill(email);
  await page.getByTestId("login-password-input").fill(password);
  await page.getByTestId("login-submit-button").click();
  await page.waitForURL(/\/en-US\/dashboard/, { timeout: 60_000 });
}

async function createFlowProject(page: Page) {
  const response = await page.request.post("/api/projects/create-with-assistant", {
    data: {
      projectName: `E2E EN Editor ${Date.now()}`,
      projectObjective: "Validate the editor shell in en-US.",
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
          direction: "left-right",
          allowMultipleOutputs: false,
        },
      },
    },
  });

  expect(response.ok()).toBe(true);

  const payload = (await response.json()) as {
    data?: {
      projectId?: string;
    };
  };

  expect(payload.data?.projectId).toBeTruthy();

  return payload.data!.projectId!;
}

test("renders editor chrome in en-US for the alternate locale flow", async ({
  page,
  devCredentials,
}) => {
  await signInWithLocale(page, devCredentials.email, devCredentials.password);

  const projectId = await createFlowProject(page);

  await page.goto(`/en-US/editor?projectId=${projectId}`);

  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  await expect(page.getByTestId("canvas-toolbar")).toBeVisible();
  await expect(page.getByTestId("canvas-toolbar-zoom-in")).toHaveAttribute(
    "aria-label",
    "Zoom in",
  );
  await expect(page.getByTestId("add-node-button")).toContainText(
    "Add activity",
  );
  await expect(page.locator("body")).toContainText(
    "Suggestion: continue the flow or open a branch when a rule applies.",
  );
  await expect(page.getByTestId("canvas-toolbar-quick-find")).toContainText(
    "Search (Ctrl+K)",
  );
  await expect(page.getByTestId("editor-focus-toggle")).toContainText(
    "Enter focus",
  );
  await expect(page.locator("body")).not.toContainText("[missing] Editor.");
  await expect(page.getByTestId("save-status-badge")).toContainText(
    /Saved\.|No pending changes\./,
  );
});
