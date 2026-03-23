import { describe, expect, it } from "vitest";
import ptBRMessages from "@/messages/pt-BR.json";
import { getIntlMessageFallback } from "./error-handling";
import { loadMessages, mergeMessagesWithFallback } from "./messages";

describe("i18n messages", () => {
  it("merges locale catalogs with pt-BR fallback when keys are missing", () => {
    const base = {
      Common: {
        appName: "MapIA",
        buttons: {
          close: "Fechar",
          cancel: "Cancelar",
        },
      },
    };
    const overrides = {
      Common: {
        buttons: {
          close: "Close",
        },
      },
    } as unknown as Partial<typeof base>;

    const merged = mergeMessagesWithFallback(
      base,
      overrides,
    );

    expect(merged).toEqual({
      Common: {
        appName: "MapIA",
        buttons: {
          close: "Close",
          cancel: "Cancelar",
        },
      },
    });
  });

  it("loads en-US with pt-BR fallback structure intact", async () => {
    const messages = await loadMessages("en-US");

    expect(messages.Common.appName).toBe("MapIA");
    expect(messages.Create.page.title).toBe("Creation assistant");
    expect(messages.Editor.page.openAssistant).toBe("Open assistant");
    expect(messages.Editor.shell.topBar.quickFind).toBe("Search (Ctrl+K)");
    expect(messages.Metadata.title).toBe(ptBRMessages.Metadata.title);
  });

  it("returns a stable fallback path for missing translation keys", () => {
    expect(
      getIntlMessageFallback({
        namespace: "Editor.page",
        key: "missingKey",
      }),
    ).toBe("Editor.page.missingKey");
  });
});
