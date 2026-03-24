import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function signIn(page: Page, email: string, password: string) {
  await page.getByTestId("login-email-input").fill(email);
  await page.getByTestId("login-password-input").fill(password);
  await page.getByTestId("login-submit-button").click();
}

async function clickPrimaryStepAction(page: Page) {
  await page.locator("nav.step-nav .btn-primary").click();
}

test("switches locale on login and persists the preference across refresh and direct navigation", async ({
  page,
  devCredentials,
}) => {
  await page.goto("/login");
  await expect(page.getByTestId("locale-switcher")).toBeVisible();

  await page.getByTestId("locale-switcher-option-en-US").click();
  await page.waitForURL(/\/en-US\/login/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Sign in to MapIA" })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/en-US\/login/);
  await expect(page.getByRole("heading", { name: "Sign in to MapIA" })).toBeVisible();

  await page.goto("/login");
  await page.waitForURL(/\/en-US\/login/, { timeout: 60_000 });
  await expect(page).toHaveURL(/\/en-US\/login/);

  await signIn(page, devCredentials.email, devCredentials.password);
  await page.waitForURL(/\/en-US\/dashboard/, { timeout: 60_000 });
  await expect(page.getByTestId("workspace-toolbar")).toBeVisible();
});

test("keeps callbackUrl locale-aware when switching language after a protected redirect", async ({
  page,
  devCredentials,
}) => {
  const projectId = "locale-switch-callback";

  await page.goto(`/editor?projectId=${projectId}`);
  await page.waitForURL(
    new RegExp(`/login\\?callbackUrl=%2Feditor%3FprojectId%3D${projectId}`),
    { timeout: 60_000 },
  );

  await page.getByTestId("locale-switcher-option-en-US").click();
  await page.waitForURL(
    new RegExp(
      `/en-US/login\\?callbackUrl=%2Fen-US%2Feditor%3FprojectId%3D${projectId}`,
    ),
    { timeout: 60_000 },
  );

  await signIn(page, devCredentials.email, devCredentials.password);
  await page.waitForURL(
    new RegExp(`/en-US/editor\\?projectId=${projectId}`),
    { timeout: 60_000 },
  );
});

test("switches locale from the dashboard and continues the create assistant flow in en-US", async ({
  authenticatedPage,
}) => {
  await authenticatedPage.goto("/dashboard");
  await expect(authenticatedPage.getByTestId("workspace-toolbar")).toBeVisible();

  await authenticatedPage.getByTestId("locale-switcher-option-en-US").click();
  await authenticatedPage.waitForURL(/\/en-US\/dashboard/, { timeout: 60_000 });
  await authenticatedPage.reload();
  await expect(authenticatedPage).toHaveURL(/\/en-US\/dashboard/);

  await authenticatedPage
    .getByRole("link", { name: "Creation assistant" })
    .click();
  await authenticatedPage.waitForURL(/\/en-US\/create/, { timeout: 60_000 });
  await expect(
    authenticatedPage.getByTestId("creation-assistant-shell"),
  ).toBeVisible();
  await expect(
    authenticatedPage.getByRole("button", { name: "Continue" }),
  ).toBeVisible();

  await authenticatedPage.locator("#assistant-project-name").fill("Visible multilingual");
  await clickPrimaryStepAction(authenticatedPage);
  await expect(
    authenticatedPage.getByRole("heading", { name: "Scope" }),
  ).toBeVisible();
});
