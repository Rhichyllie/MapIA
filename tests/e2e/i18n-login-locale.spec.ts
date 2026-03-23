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
  await expect(
    page.getByRole("heading", { name: "Workspace hub" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Creation assistant" }),
  ).toBeVisible();
});
