import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMessages } from "./messages";

function readRepoFile(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("visible multilingual surfaces", () => {
  it("keeps the primary surfaces available in en-US through the official catalog", async () => {
    const messages = await loadMessages("en-US");

    expect(messages.Auth.page.title).toBe("Sign in to MapIA");
    expect(messages.Shell.navigation.dashboard).toBe("Workspace");
    expect(messages.Dashboard.page.title).toBe("Workspace");
    expect(messages.Create.page.title).toBe("Creation assistant");
    expect(messages.Editor.page.title).toBe("Visual editor");
    expect(messages.Common.localeSwitcher.label).toBe("Language");
    expect(messages.Common.localeSwitcher.options["en-US"].label).toBe("EN-US");
  });

  it("keeps login, shell, dashboard, create and editor wired to catalog-backed copy", () => {
    const loginSource = readRepoFile("app/[locale]/login/page.tsx");
    const shellSource = readRepoFile("src/components/layout/protected-shell.tsx");
    const dashboardSource = readRepoFile(
      "src/components/dashboard/dashboard-projects-panel.tsx",
    );
    const createSource = readRepoFile("app/[locale]/(protected)/create/page.tsx");
    const editorSource = readRepoFile("app/[locale]/(protected)/editor/page.tsx");

    expect(loginSource).toContain('getTranslations("Auth.page")');
    expect(loginSource).not.toContain("Entrar no MapIA");
    expect(loginSource).not.toContain("Sign in to MapIA");

    expect(shellSource).toContain('getTranslations("Shell")');
    expect(shellSource).toContain('getTranslations("Common")');
    expect(shellSource).not.toContain("Area de trabalho");
    expect(shellSource).not.toContain("Workspace");
    expect(shellSource).not.toContain("Creation assistant");

    expect(dashboardSource).toContain("useDashboardCopy()");
    expect(dashboardSource).not.toContain("Workspace hub");
    expect(dashboardSource).not.toContain("Hub da area de trabalho");

    expect(createSource).toContain('getTranslations("Create.page")');
    expect(createSource).not.toContain("Assistente de criacao");
    expect(createSource).not.toContain("Creation assistant");

    expect(editorSource).toContain('getTranslations("Editor.page")');
    expect(editorSource).not.toContain("Editor visual");
    expect(editorSource).not.toContain("Visual editor");
  });

  it("marks the active locale explicitly in the switcher UI contract", () => {
    const switcherSource = readRepoFile("src/components/i18n/locale-switcher.tsx");

    expect(switcherSource).toContain("option.locale === locale");
    expect(switcherSource).toContain('aria-current="true"');
    expect(switcherSource).toContain('data-active="true"');
    expect(switcherSource).toContain("currentLocaleTitle");
  });
});
