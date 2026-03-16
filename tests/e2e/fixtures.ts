import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";

type DevCredentials = {
  email: string;
  password: string;
};

type AppFixtures = {
  authenticatedPage: Page;
  devCredentials: DevCredentials;
};

const DEFAULT_DEV_CREDENTIALS: DevCredentials = {
  email: "admin@mapia.local",
  password: "mapia123",
};

function parseDotEnvValue(rawLine: string) {
  const equalIndex = rawLine.indexOf("=");
  if (equalIndex === -1) {
    return null;
  }

  const key = rawLine.slice(0, equalIndex).trim();
  if (!key || key.startsWith("#")) {
    return null;
  }

  let value = rawLine.slice(equalIndex + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function readDevCredentialsFromEnvFile(): Partial<DevCredentials> {
  const candidates = [".env.local", ".env"];
  const collected: Partial<DevCredentials> = {};

  for (const relativePath of candidates) {
    const absolutePath = join(process.cwd(), relativePath);
    if (!existsSync(absolutePath)) {
      continue;
    }

    const fileContents = readFileSync(absolutePath, "utf8");
    for (const line of fileContents.split(/\r?\n/)) {
      const parsed = parseDotEnvValue(line);
      if (!parsed) continue;

      if (parsed.key === "DEV_LOGIN_EMAIL" && !collected.email) {
        collected.email = parsed.value;
      }
      if (parsed.key === "DEV_LOGIN_PASSWORD" && !collected.password) {
        collected.password = parsed.value;
      }
    }
  }

  return collected;
}

function resolveDevCredentials(): DevCredentials {
  const envFileValues = readDevCredentialsFromEnvFile();

  return {
    email:
      process.env.DEV_LOGIN_EMAIL ??
      envFileValues.email ??
      DEFAULT_DEV_CREDENTIALS.email,
    password:
      process.env.DEV_LOGIN_PASSWORD ??
      envFileValues.password ??
      DEFAULT_DEV_CREDENTIALS.password,
  };
}

async function readVisibleErrorBoxMessage(page: Page) {
  const errorBox = page.locator(".error-box").first();

  if ((await errorBox.count()) === 0) {
    return null;
  }

  if (!(await errorBox.isVisible().catch(() => false))) {
    return null;
  }

  return (await errorBox.textContent())?.trim() || null;
}

export async function ensureLoggedIn(page: Page, credentials: DevCredentials) {
  await page.goto("/dashboard");
  await page.waitForLoadState("domcontentloaded");

  if (page.url().includes("/login")) {
    await expect(page.getByTestId("login-form")).toBeVisible();
    await page.getByTestId("login-email-input").fill(credentials.email);
    await page.getByTestId("login-password-input").fill(credentials.password);
    await page.getByTestId("login-submit-button").click();
    await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  }

  try {
    await expect(page).toHaveURL(/\/dashboard/);
    await page.waitForLoadState("networkidle");
  } catch (error) {
    const loginErrorMessage = await readVisibleErrorBoxMessage(page);
    const extraMessage = loginErrorMessage
      ? ` Mensagem na UI: "${loginErrorMessage}".`
      : "";

    throw new Error(
      `Falha no login dev do E2E. Verifique DEV_LOGIN_EMAIL/DEV_LOGIN_PASSWORD (.env/.env.local) e NODE_ENV=development.${extraMessage}`,
      { cause: error },
    );
  }

  await expect(page.getByTestId("workspace-toolbar")).toBeVisible();
  await expect(page.getByTestId("new-project-button")).toBeVisible();
}

export const test = base.extend<AppFixtures>({
  devCredentials: async ({}, applyFixture) => {
    await applyFixture(resolveDevCredentials());
  },
  authenticatedPage: async ({ page, devCredentials }, applyFixture) => {
    await ensureLoggedIn(page, devCredentials);
    await applyFixture(page);
  },
});

export { expect };
