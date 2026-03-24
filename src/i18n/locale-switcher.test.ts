import { describe, expect, it } from "vitest";
import {
  buildLocaleSwitcherHref,
  localizeInternalCallbackUrl,
  resolveLocaleSwitcherOptions,
} from "./locale-switcher";

describe("locale switcher helpers", () => {
  it("preserves the current route query while switching locale", () => {
    expect(
      buildLocaleSwitcherHref({
        pathname: "/editor",
        search: "projectId=123&tab=overview",
        locale: "en-US",
      }),
    ).toBe("/editor?projectId=123&tab=overview");
  });

  it("localizes internal callbackUrl values for the selected locale", () => {
    expect(
      buildLocaleSwitcherHref({
        pathname: "/login",
        search: "callbackUrl=%2Feditor%3FprojectId%3D123",
        locale: "en-US",
      }),
    ).toBe("/login?callbackUrl=%2Fen-US%2Feditor%3FprojectId%3D123");

    expect(
      buildLocaleSwitcherHref({
        pathname: "/login",
        search: "callbackUrl=%2Fen-US%2Feditor%3FprojectId%3D123",
        locale: "pt-BR",
      }),
    ).toBe("/login?callbackUrl=%2Feditor%3FprojectId%3D123");
  });

  it("does not rewrite external callback targets", () => {
    expect(
      localizeInternalCallbackUrl(
        "https://accounts.example.com/sso/complete",
        "en-US",
      ),
    ).toBe("https://accounts.example.com/sso/complete");
  });

  it("maps locale options by locale id so the same helper scales to future locales", () => {
    expect(
      resolveLocaleSwitcherOptions(
        {
          "pt-BR": {
            label: "PT-BR",
            description: "Portugues (Brasil)",
          },
          "en-US": {
            label: "EN-US",
            description: "English (US)",
          },
          "es-ES": {
            label: "ES-ES",
            description: "Espanol (Espana)",
          },
        },
        ["pt-BR", "en-US", "es-ES"] as const,
      ),
    ).toEqual([
      {
        locale: "pt-BR",
        label: "PT-BR",
        description: "Portugues (Brasil)",
      },
      {
        locale: "en-US",
        label: "EN-US",
        description: "English (US)",
      },
      {
        locale: "es-ES",
        label: "ES-ES",
        description: "Espanol (Espana)",
      },
    ]);
  });
});
