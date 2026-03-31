import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { loadMessages, type AppMessages } from "@/src/i18n/messages";
import {
  resolveProcessEdgeInspectorViewModel,
  resolveProcessNodeInspectorViewModel,
} from "../../process-inspector/process-inspector-view-model";
import { ErdInspectorAdapter } from "./erd-inspector-adapter";
import { FlowInspectorAdapter } from "./flow-inspector-adapter";
import { GraphInspectorAdapter } from "./graph-inspector-adapter";
import { resolveEditorDiagramInspectorAdapter } from "./registry";
import type { EditorDiagramInspectorAdapterProps } from "./types";

const editorT = ((key: string) => key) as never;
const NextIntlTestProvider =
  NextIntlClientProvider as unknown as React.ComponentType<
    React.PropsWithChildren<{
      locale: "pt-BR";
      messages: AppMessages;
      timeZone: "UTC";
    }>
  >;

function renderWithLocale(messages: AppMessages, element: React.ReactNode) {
  return renderToStaticMarkup(
    React.createElement(
      NextIntlTestProvider,
      {
        locale: "pt-BR",
        messages,
        timeZone: "UTC",
      },
      element,
    ),
  );
}

function createBaseProps(): EditorDiagramInspectorAdapterProps {
  const processRelations = {
    incomingCount: 1,
    outgoingCount: 1,
    mainIncomingCount: 1,
    mainOutgoingCount: 1,
    namedOutgoingCount: 0,
    branchOutgoingCount: 0,
    supportingCount: 0,
    summaryChips: [],
    preview: [],
  };

  return {
    editorT,
    diagramType: "graph",
    inspectorCopy: {
      selectionBadgeLabel: "Item em foco",
      emptyTitle: "Sem selecao",
      emptySummary: "Selecione um item",
      emptyGuidance: "Use o canvas",
      nodeTitleLabel: "Titulo",
      nodeKindLabel: "Tipo",
      nodeDescriptionLabel: "Descricao",
      nodeDescriptionPlaceholder: "Descreva",
      nodeTagsLabel: "Tags",
      nodeTagsPlaceholder: "tag1, tag2",
      nodeTagsHelper: "Separe por virgula",
      nodeContextTitle: "Contexto",
      generalSectionTitle: "Geral",
      detailsSectionTitle: "Detalhes",
      relationsSectionTitle: "Relacoes",
      edgeLabelLabel: "Rotulo",
      edgeGeneralSectionTitle: "Geral",
      edgeKindLabel: "Tipo de relacao",
      edgeSourceLabel: "Origem",
      edgeTargetLabel: "Destino",
      nodeSubtitle: "No",
      edgeSubtitle: "Aresta",
    },
    inspectorMode: "operational",
    inspectorSections: {
      general: true,
      details: true,
      relations: true,
      advanced: false,
    },
    inspectorSelectionBadge: "Item em foco",
    inspectorSelectionState: {
      nodeSelected: true,
      edgeSelected: false,
      badgeLabel: "Item em foco",
    },
    selectedNode: {
      id: "node-a",
      position: { x: 120, y: 64 },
      data: {
        kind: "flow-step",
        label: "Registrar pedido",
        payload: {},
      },
    } as never,
    selectedEdge: null,
    selectedEdgeSourceLabel: null,
    selectedEdgeTargetLabel: null,
    saveStatus: "saved",
    nodeKindOptions: [
      { kind: "flow-step", outOfProfile: false, group: "perfil" },
      { kind: "note", outOfProfile: false, group: "perfil" },
      { kind: "entity", outOfProfile: true, group: "fora-do-perfil" },
    ],
    edgeKindOptions: ["flows-to", "depends-on", "references"],
    nodeInspectorDraft: {
      label: "Registrar pedido",
      kind: "flow-step",
      dataJson: "{}",
    },
    setNodeInspectorDraft: () => undefined,
    edgeInspectorDraft: null,
    setEdgeInspectorDraft: () => undefined,
    operationalNodeDraft: {
      label: "Registrar pedido",
      kind: "flow-step",
      description: "Abertura",
      tagsText: "pedido",
      owner: "",
      area: "",
      channel: "",
      criticality: "",
      sla: "",
      rule: "",
      exception: "",
    },
    setOperationalNodeDraft: () => undefined,
    operationalEdgeDraft: null,
    setOperationalEdgeDraft: () => undefined,
    nodeInspectorDirty: false,
    edgeInspectorDirty: false,
    nodeInspectorErrors: {},
    edgeInspectorErrors: {},
    nodeInspectorMessage: null,
    edgeInspectorMessage: null,
    nodeInspectorHasErrors: false,
    edgeInspectorHasErrors: false,
    graphSelectedNodeSemantic: {
      selectionBadgeLabel: "Nucleo em foco",
      roleBadgeLabel: "Nucleo da rede",
      kindLabel: "Componente",
      kindDescription: "Representa um componente.",
      summary: "Leitura da rede",
      footprintLabel: "Central",
      connectivityLabel: "1 entrada, 1 saida",
    },
    graphSelectedEdgeSemantic: null,
    graphSelectedNodeKindLabel: "Componente",
    graphSelectedNodeKindDescription: "Representa um componente.",
    selectedNodeRelations: {
      incomingCount: 1,
      outgoingCount: 1,
      summaryChips: [],
      preview: [],
    },
    selectedNodeRoleLabel: "Etapa",
    selectedNodeStructureTips: ["Defina entrada e saida."],
    operationalTagPreview: ["pedido"],
    quickAction: {
      id: "graph-add-supporting-service",
      label: "Adicionar componente",
      edgeKind: "depends-on",
      nodeKind: "flow-step",
      insertMode: "graph-neighbor",
    },
    secondarySelectionActions: [],
    processSelectedNodeRelations: processRelations,
    processNodeInspectorModel: resolveProcessNodeInspectorViewModel(
      {
        diagramRole: "flow-step",
        kind: "flow-step",
        label: "Registrar pedido",
        relations: processRelations,
      },
      editorT,
    ),
    processEdgeInspectorModel: resolveProcessEdgeInspectorViewModel(
      {
        kind: "flows-to",
        label: "Fluxo",
        sourceLabel: "Registrar pedido",
        targetLabel: "Validar pedido",
      },
      editorT,
    ),
    selectedErdEntityPayload: null,
    selectedErdRelationPayload: null,
    selectedErdSourceEntityNode: null,
    selectedErdTargetEntityNode: null,
    erdFieldDrafts: {},
    erdMaterializeDependentSide: "target",
    setErdMaterializeDependentSide: () => undefined,
    erdMaterializeExistingFieldId: "__new__",
    setErdMaterializeExistingFieldId: () => undefined,
    erdMaterializeUnique: false,
    setErdMaterializeUnique: () => undefined,
    selectedErdRelationIssues: [],
    erdPolicy: {
      validationLevel: "guided",
      namingStyle: "snake",
      entityCase: "PascalCase",
      requirePrimaryKeyInStrict: true,
      allowConceptualRelations: true,
      preferSurrogateKeyInAssociative: true,
    },
    onToggleInspectorSection: () => undefined,
    onHandleAddContextualNode: () => undefined,
    onOpenRelatedNodeFromRelation: () => undefined,
    onOpenTransitionFromRelation: () => undefined,
    onRemoveRelation: () => undefined,
    onApplyNodeInspector: () => undefined,
    onResetNodeInspector: () => undefined,
    onFormatNodeJson: () => undefined,
    onCopyNodeId: async () => undefined,
    onCopyNodeJson: async () => undefined,
    onApplyEdgeInspector: () => undefined,
    onResetEdgeInspector: () => undefined,
    onFormatEdgeJson: () => undefined,
    onCopyEdgeId: async () => undefined,
    onCopyEdgeJson: async () => undefined,
    onRemoveSelected: () => undefined,
    onUpdateSelectedErdEntityPayload: () => true,
    onAddErdField: () => undefined,
    onUpdateErdFieldDraft: () => undefined,
    onCommitErdFieldDraft: () => undefined,
    onRemoveErdField: () => undefined,
    onToggleErdFieldFlag: () => undefined,
    onMoveErdField: () => undefined,
    onErdFieldShortcut: () => undefined,
    onUpdateSelectedErdRelationPayload: () => true,
    onUpdateSelectedErdRelationName: () => true,
    onApplyErdSuggestedFix: () => undefined,
    onFocusSemanticIssue: () => undefined,
    onSwapSelectedErdRelationDirection: () => undefined,
    onMaterializeSelectedErdRelationAsFk: () => undefined,
    onApplySelectedErdOneToOneUniqueFix: () => undefined,
    onConvertSelectedErdRelationToAssociative: () => undefined,
    onMarkSelectedErdRelationConceptual: () => undefined,
  };
}

describe("editor diagram inspector adapters", () => {
  it("resolves adapters by inspector strategy kind", () => {
    expect(resolveEditorDiagramInspectorAdapter("process")).toBe(FlowInspectorAdapter);
    expect(resolveEditorDiagramInspectorAdapter("graph")).toBe(GraphInspectorAdapter);
    expect(resolveEditorDiagramInspectorAdapter("erd")).toBe(ErdInspectorAdapter);
    expect(resolveEditorDiagramInspectorAdapter("default")).toBe(GraphInspectorAdapter);
  });

  it("renders the graph adapter for an operational node selection", async () => {
    const markup = renderWithLocale(
      await loadMessages("pt-BR"),
      React.createElement(GraphInspectorAdapter, createBaseProps()),
    );

    expect(markup).toContain("graph-inspector-overview");
    expect(markup).toContain("Leitura da rede");
  });

  it("renders the flow adapter for a process node selection", async () => {
    const markup = renderWithLocale(
      await loadMessages("pt-BR"),
      React.createElement(FlowInspectorAdapter, {
        ...createBaseProps(),
        diagramType: "flow",
        graphSelectedNodeSemantic: null,
      }),
    );

    expect(markup).toContain("Registrar pedido");
    expect(markup).toContain("process-inspector-overview");
  });

  it("renders the erd adapter for an entity selection", async () => {
    const markup = renderWithLocale(
      await loadMessages("pt-BR"),
      React.createElement(ErdInspectorAdapter, {
        ...createBaseProps(),
        diagramType: "erd",
        selectedNode: {
          id: "entity-customer",
          position: { x: 120, y: 64 },
          data: {
            kind: "entity",
            label: "Customer",
            payload: {},
          },
        },
        operationalNodeDraft: {
          label: "Customer",
          kind: "entity",
          description: "Clientes",
          tagsText: "core",
          owner: "",
          area: "",
          channel: "",
          criticality: "",
          sla: "",
          rule: "",
          exception: "",
        },
        selectedErdEntityPayload: {
          entityId: "entity-customer",
          fields: [
            {
              id: "customer-id",
              name: "id",
              type: "uuid",
              flags: ["PK", "NOT_NULL"],
            },
          ],
        },
        erdFieldDrafts: {
          "customer-id": {
            name: "id",
            type: "uuid",
          },
        },
      } as unknown as EditorDiagramInspectorAdapterProps),
    );

    expect(markup).toContain("erd-entity-fields-grid");
    expect(markup).toContain("customer-id");
  });
});
