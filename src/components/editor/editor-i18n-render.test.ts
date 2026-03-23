import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { loadMessages, type AppMessages } from "@/src/i18n/messages";
import { CanvasToolbar } from "./canvas-toolbar";
import { CommandPalette } from "./command-palette";

function renderWithLocale(
  locale: "pt-BR" | "en-US",
  messages: AppMessages,
  element: React.ReactNode,
) {
  return renderToStaticMarkup(
    React.createElement(
      NextIntlClientProvider,
      { locale, messages, timeZone: "UTC" },
      element,
    ),
  );
}

describe("editor i18n render", () => {
  it("renders shared editor controls in pt-BR", async () => {
    const markup = renderWithLocale(
      "pt-BR",
      await loadMessages("pt-BR"),
      React.createElement(CanvasToolbar, {
        onZoomIn: () => undefined,
        onZoomOut: () => undefined,
        onCenterView: () => undefined,
        isInFocusMode: false,
      }),
    );

    expect(markup).toContain("Ferramentas do canvas");
    expect(markup).toContain("Aumentar zoom");
  });

  it("renders shared editor controls in en-US", async () => {
    const markup = renderWithLocale(
      "en-US",
      await loadMessages("en-US"),
      React.createElement(CommandPalette, {
        isOpen: true,
        query: "",
        options: [],
        activeIndex: 0,
        mode: "technical",
        onQueryChange: () => undefined,
        onSelectByIndex: () => undefined,
        onMoveActiveIndex: () => undefined,
        onClose: () => undefined,
      }),
    );

    expect(markup).toContain("Search canvas node");
    expect(markup).toContain("Search node");
    expect(markup).toContain("No node found.");
  });
});
