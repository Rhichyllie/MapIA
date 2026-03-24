import { expect, test } from "./fixtures";

test("preserves en-US locale through login and dashboard navigation", async ({
  page,
  devCredentials,
}) => {
  await page.goto("/en-US/login");
  await page.waitForLoadState("domcontentloaded");

  await expect(page.getByRole("heading", { name: "Sign in to MapIA" })).toBeVisible();
  await page.getByTestId("login-email-input").fill(devCredentials.email);
  await page.getByTestId("login-password-input").fill(devCredentials.password);
  await page.getByTestId("login-submit-button").click();

  await page.waitForURL(/\/en-US\/dashboard/, { timeout: 60_000 });
  await expect(page).toHaveURL(/\/en-US\/dashboard/);
  await page.goto("/en-US/dashboard");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("workspace-toolbar")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("new-project-button")).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByRole("link", { name: "Creation assistant" }),
  ).toBeVisible();
});

test("preserves default locale through login and dashboard navigation without prefix", async ({
  page,
  devCredentials,
}) => {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  await expect(page.getByTestId("login-form")).toBeVisible();
  await page.getByTestId("login-email-input").fill(devCredentials.email);
  await page.getByTestId("login-password-input").fill(devCredentials.password);
  await page.getByTestId("login-submit-button").click();

  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/dashboard");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("workspace-toolbar")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("new-project-button")).toBeVisible({
    timeout: 60_000,
  });
});
