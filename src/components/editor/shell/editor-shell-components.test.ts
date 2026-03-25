import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { translateEditor, type EditorTranslationFn } from "../editor-i18n";
import { EditorShellTopBar } from "./editor-shell-top-bar";
import { EditorSelectionHudSurface } from "./editor-selection-hud-surface";
import { EditorSemanticAuditPanel } from "./editor-semantic-audit-panel";
import { EditorInspectorFrame } from "./editor-inspector-frame";
import {
  EditorMetadataPanel,
  EditorPrismaImportPanel,
  EditorVersionsPanel,
} from "./editor-shell-panels";

const editorT: EditorTranslationFn = (key, values) =>
  translateEditor(undefined, key, values);

describe("editor shell extracted components", () => {
  it("renders the canvas top bar and selection HUD surfaces", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(EditorShellTopBar, {
          projectName: "MapIA",
          isCanvasFocusMode: false,
          ariaLabel: editorT("shell.topBar.canvasBarAriaLabel"),
          saveStatusClassName: "badge editor-save-badge editor-save-badge-saved",
          saveStatusLabel: "Saved",
          isSaving: false,
          addPrimaryLabel: "Adicionar",
          quickActionHint: "Atalho",
          quickFindLabel: "Buscar",
          fitViewLabel: "Centralizar",
          organizeLabel: "Organizar",
          validationLabel: "Validar",
          inspectorToggleLabel: "Inspector",
          focusToggleLabel: "Focus",
          onAddNode: () => undefined,
          onOpenQuickFind: () => undefined,
          onFitView: () => undefined,
          onOrganizeDiagram: () => undefined,
          onToggleValidationPanel: () => undefined,
          onToggleInspectorVisibility: () => undefined,
          onToggleCanvasFocusMode: () => undefined,
        }),
        React.createElement(EditorSelectionHudSurface, {
          variant: "default",
          selectedItemLabel: "Cliente",
          kindChipLabel: "Entidade",
          kindChipTone: "slate",
          semanticStatusLabel: "Sem erros",
          semanticStatusSeverity: "info",
          editLabel: "Editar",
          centerLabel: "Centralizar",
          primaryAction: {
            id: "add-related",
            label: "Adicionar relacionado",
            onClick: () => undefined,
          },
          removeLabel: "Remover",
          onOpenInspector: () => undefined,
          onCenterView: () => undefined,
          onRemove: () => undefined,
        }),
      ),
    );

    expect(markup).toContain("MapIA");
    expect(markup).toContain("Adicionar");
    expect(markup).toContain("Cliente");
    expect(markup).toContain("Adicionar relacionado");
  });

  it("renders metadata, prisma and versions panels without inline shell JSX", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(EditorMetadataPanel, {
          editorT,
          project: { id: "project-1", name: "Mapa de Contexto" },
          diagramDefinitionLabel: "Graph",
          rendererLabel: "Graph",
          isSupportedDiagramType: true,
          layoutPolicyLabel: "Allowed",
          isReapplyLayoutBlockedByPolicy: false,
          isOpen: true,
          onToggle: () => undefined,
          pendingCount: 2,
          nodeCount: 8,
          edgeCount: 6,
          lastSavedAtLabel: "10:30",
          saveMessage: "Tudo salvo",
          isRefreshingFromQuery: false,
          querySyncMessage: null,
          onRemoveSelected: () => undefined,
          isRemoveSelectedDisabled: false,
          onManualSave: () => undefined,
          isManualSaveDisabled: false,
          isSaving: false,
          newVersionName: "Base",
          onNewVersionNameChange: () => undefined,
          onCreateVersion: () => undefined,
          isCreateVersionDisabled: false,
          isCreatingVersion: false,
          onReapplyLayout: () => undefined,
          isReapplyLayoutDisabled: false,
          hasDiagramRendererMismatch: false,
          versionCreateFeedback: null,
        }),
        React.createElement(EditorPrismaImportPanel, {
          editorT,
          isOpen: true,
          onToggle: () => undefined,
          onImport: () => undefined,
          isImportDisabled: false,
          isImporting: false,
          canImport: true,
          value: "model User { id String @id }",
          onValueChange: () => undefined,
          feedback: null,
        }),
        React.createElement(EditorVersionsPanel, {
          editorT,
          locale: "pt-BR",
          isOpen: true,
          onToggle: () => undefined,
          onRefresh: () => undefined,
          isRefreshing: false,
          isSaving: false,
          isCreatingVersion: false,
          activeVersionCompareId: null,
          activeVersionRestoreId: null,
          versionActionFeedback: null,
          versionDiffFeedback: null,
          versionDiffSummary: null,
          snapshotVersions: [
            {
              id: "v1",
              projectId: "project-1",
              label: "Base",
              origin: "manual",
              createdAt: "2026-03-25T10:00:00.000Z",
            },
          ],
          versionNameDrafts: { v1: "Base local" },
          onVersionNameDraftChange: () => undefined,
          onSaveVersionName: () => undefined,
          onCompareVersion: () => undefined,
          onRestoreVersion: () => undefined,
          getVersionDisplayName: () => "Base",
        }),
      ),
    );

    expect(markup).toContain("Mapa de Contexto");
    expect(markup).toContain("model User");
    expect(markup).toContain("Base local");
  });

  it("renders the inspector frame and semantic audit panel composition", () => {
    const inspectorProps = {
      ariaLabel: "Inspector",
      isProcessDiagram: false,
      selectionBadge: "Node",
      draftBadgeLabel: "Draft",
      hasDirtyDraft: true,
      selectedItemLabel: "Gateway",
      inspectorSubtitle: "Detalhes",
      mode: "operational" as const,
      modeAriaLabel: "Mode",
      operationalLabel: "Operational",
      technicalLabel: "Technical",
      onModeChange: () => undefined,
      semanticAudit: React.createElement(EditorSemanticAuditPanel, {
        ariaLabel: "Semantic audit",
        title: "Semantic audit",
        summaryLabel: "1 issue",
        isOpen: true,
        safeFixPreviewItems: ["Fix edge kind"],
        issues: [
          {
            id: "issue-1",
            code: "graph.invalid_edge",
            severity: "warning",
            message: "Edge is invalid",
            targetType: "edge",
            targetId: "edge-1",
          },
        ],
        emptyLabel: "No issues",
        collapsedHint: "Collapsed",
        renderSeverityLabel: (severity: string) => severity.toUpperCase(),
        renderIssueActions: () =>
          React.createElement(
            "button",
            { type: "button", className: "btn" },
            "Fix",
          ),
      }),
    } satisfies Omit<React.ComponentProps<typeof EditorInspectorFrame>, "children">;
    const InspectorFrameComponent =
      EditorInspectorFrame as unknown as React.ComponentType<
        React.PropsWithChildren<typeof inspectorProps>
      >;

    const markup = renderToStaticMarkup(
      React.createElement(
        InspectorFrameComponent,
        inspectorProps,
        React.createElement("div", null, "Inspector body"),
      ),
    );

    expect(markup).toContain("Gateway");
    expect(markup).toContain("Semantic audit");
    expect(markup).toContain("Fix edge kind");
    expect(markup).toContain("Inspector body");
  });
});
