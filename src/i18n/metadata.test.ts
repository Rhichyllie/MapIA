import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLocalizedLayoutMetadata,
  buildLocalizedPageMetadata,
} from "./metadata";

function readRepoFile(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("localized metadata", () => {
  it("builds localized layout metadata with a reusable title template", async () => {
    await expect(buildLocalizedLayoutMetadata("pt-BR")).resolves.toMatchObject({
      applicationName: "MapIA",
      description:
        "Plataforma de mapeamento estrutural com assistente de criacao e editor visual.",
      title: {
        default: "MapIA",
        template: "%s | MapIA",
      },
    });

    await expect(buildLocalizedLayoutMetadata("en-US")).resolves.toMatchObject({
      applicationName: "MapIA",
      description:
        "Structural mapping platform with a creation assistant and visual editor.",
      title: {
        default: "MapIA",
        template: "%s | MapIA",
      },
    });
  });

  it("builds localized metadata for the primary product surfaces", async () => {
    await expect(buildLocalizedPageMetadata("pt-BR", "login")).resolves.toMatchObject({
      title: "Entrar",
      description:
        "Acesse o ambiente do MapIA com as credenciais configuradas para o seu fluxo atual.",
      alternates: {
        canonical: "/login",
        languages: {
          "pt-BR": "/login",
          "en-US": "/en-US/login",
        },
      },
    });

    await expect(buildLocalizedPageMetadata("en-US", "dashboard")).resolves.toMatchObject({
      title: "Workspace",
      description:
        "Manage projects, review snapshots and move into the assistant or editor.",
      alternates: {
        canonical: "/en-US/dashboard",
        languages: {
          "pt-BR": "/dashboard",
          "en-US": "/en-US/dashboard",
        },
      },
    });

    await expect(buildLocalizedPageMetadata("en-US", "create")).resolves.toMatchObject({
      title: "Creation assistant",
      alternates: {
        canonical: "/en-US/create",
      },
    });

    await expect(buildLocalizedPageMetadata("pt-BR", "editor")).resolves.toMatchObject({
      title: "Editor visual",
      alternates: {
        canonical: "/editor",
      },
    });
  });

  it("wires localized metadata into the locale layout and primary route files", () => {
    const localeLayoutSource = readRepoFile("app/[locale]/layout.tsx");
    const loginSource = readRepoFile("app/[locale]/login/page.tsx");
    const dashboardSource = readRepoFile(
      "app/[locale]/(protected)/dashboard/page.tsx",
    );
    const createSource = readRepoFile("app/[locale]/(protected)/create/page.tsx");
    const editorSource = readRepoFile("app/[locale]/(protected)/editor/page.tsx");

    expect(localeLayoutSource).toContain("generateMetadata");
    expect(localeLayoutSource).toContain("buildLocalizedLayoutMetadata");
    expect(loginSource).toContain("buildLocalizedPageMetadata(locale, \"login\")");
    expect(dashboardSource).toContain(
      "buildLocalizedPageMetadata(locale, \"dashboard\")",
    );
    expect(createSource).toContain("buildLocalizedPageMetadata(locale, \"create\")");
    expect(editorSource).toContain("buildLocalizedPageMetadata(locale, \"editor\")");
  });
});
