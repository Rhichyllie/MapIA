import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { loadMessages, type AppMessages } from "@/src/i18n/messages";
import { CanvasToolbar } from "./canvas-toolbar";
import { CommandPalette } from "./command-palette";
import { ProcessOperationalEdgeInspector } from "./process-inspector/process-operational-edge-inspector";

function renderWithLocale(
  locale: "pt-BR" | "en-US",
  messages: AppMessages,
  element: React.ReactNode,
) {
  const providerProps = {
    locale,
    messages,
    timeZone: "UTC",
  } as React.ComponentProps<typeof NextIntlClientProvider>;

  return renderToStaticMarkup(
    React.createElement(NextIntlClientProvider, providerProps, element),
  );
}

function buildProcessInspectorCopy(messages: AppMessages) {
  const inspector = messages.Editor.process.inspector;

  return {
    selectionBadgeLabel: inspector.selectionBadgeLabel,
    emptyTitle: inspector.emptyTitle,
    emptySummary: inspector.emptySummary,
    emptyGuidance: inspector.emptyGuidance,
    titleLabel: inspector.titleLabel,
    kindLabel: inspector.kindLabel,
    descriptionLabel: inspector.descriptionLabel,
    descriptionPlaceholder: inspector.descriptionPlaceholder,
    tagsLabel: inspector.tagsLabel,
    tagsPlaceholder: inspector.tagsPlaceholder,
    tagsHelper: inspector.tagsHelper,
    contextTitle: inspector.contextTitle,
    generalSectionTitle: inspector.generalSectionTitle,
    detailsSectionTitle: inspector.detailsSectionTitle,
    relationsSectionTitle: inspector.relationsSectionTitle,
    edgeGeneralSectionTitle: inspector.edgeGeneralSectionTitle,
    edgeLabelLabel: inspector.edgeLabelLabel,
    edgeKindLabel: inspector.edgeKindLabel,
    edgeSourceLabel: inspector.edgeSourceLabel,
    edgeTargetLabel: inspector.edgeTargetLabel,
    nodeSubtitle: inspector.nodeSubtitle,
    edgeSubtitle: inspector.edgeSubtitle,
    relationsEmptyState: inspector.relationsEmptyState,
    ownerLabel: inspector.ownerLabel,
    ownerPlaceholder: inspector.ownerPlaceholder,
    areaLabel: inspector.areaLabel,
    areaPlaceholder: inspector.areaPlaceholder,
    channelLabel: inspector.channelLabel,
    channelPlaceholder: inspector.channelPlaceholder,
    criticalityLabel: inspector.criticalityLabel,
    slaLabel: inspector.slaLabel,
    slaPlaceholder: inspector.slaPlaceholder,
    ruleLabel: inspector.ruleLabel,
    rulePlaceholder: inspector.rulePlaceholder,
    exceptionLabel: inspector.exceptionLabel,
    exceptionPlaceholder: inspector.exceptionPlaceholder,
    operationsSummaryTitle: inspector.operationsSummaryTitle,
    operationsSummaryEmpty: inspector.operationsSummaryEmpty,
  };
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

  it("renders process inspector actions in en-US without falling back to pt-BR", async () => {
    const messages = await loadMessages("en-US");
    const markup = renderWithLocale(
      "en-US",
      messages,
      React.createElement(ProcessOperationalEdgeInspector, {
        copy: buildProcessInspectorCopy(messages),
        overview: {
          badgeLabel: "Transition",
          transitionTypeLabel: "Continue to",
          summary: "Review the transition between steps.",
          guidance: ["Keep the wording concise."],
        },
        draft: {
          label: "Approved",
          kind: "flows-to",
        },
        edgeKindOptions: ["flows-to", "depends-on"],
        sections: {
          general: true,
          relations: true,
        },
        sourceLabel: "Review request",
        targetLabel: "Approve request",
        edgeReadingKind: "flows-to",
        edgeInspectorErrors: {},
        edgeInspectorMessage: null,
        edgeInspectorHasErrors: false,
        isSaving: false,
        onToggleSection: () => undefined,
        onLabelChange: () => undefined,
        onKindChange: () => undefined,
        onApply: () => undefined,
        onReset: () => undefined,
        onRemove: () => undefined,
      }),
    );

    expect(markup).toContain("Transition reading");
    expect(markup).toContain("Apply changes");
    expect(markup).toContain("Revert");
    expect(markup).toContain("Remove transition");
  });
});
