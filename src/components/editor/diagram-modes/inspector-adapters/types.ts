import type { EdgeKind } from "@/src/domain";
import type {
  ErdEditorCommand,
  ErdEntityPayload,
  ErdFieldFlag,
  ErdPolicyConfig,
  ErdRelationPayload,
} from "@/src/modules/erd/domain";
import type { EditorAutosaveState } from "../../editor-autosave-state";
import type { InspectorFieldErrors } from "../../editor-inspector-feedback";
import type { EdgeInspectorDraft, NodeInspectorDraft } from "../../editor-inspector-schemas";
import type { EditorTranslationFn } from "../../editor-i18n";
import type { OperationalNodeDraft } from "../../editor-inspector-personas";
import type { RFEdge, RFNode } from "../../editor-graph-mappers";
import type { InspectorMode } from "../../editor-inspector-personas";
import type { InspectorSelectionState } from "../../inspector-selection-state";
import type { ContextualDiagramType } from "../../presentation/kinds";
import type { DiagramScopedNodeKindOption } from "../../presentation/diagram-scoped-options";
import type {
  ProcessEdgeInspectorViewModel,
  ProcessNodeInspectorViewModel,
} from "../../process-inspector/process-inspector-view-model";
import type { ProcessRelationsViewModel } from "../../presentation/process-semantics";
import type { EditorDiagramInspectorCopy, EditorDiagramNodeRelationsView } from "../types";
import type {
  ErdFieldDraftState,
  InspectorSectionState,
  OperationalEdgeDraft,
  SemanticIssueLike,
  SelectionHudQuickAction,
} from "../../shell/editor-shell-types";
import type { Dispatch, SetStateAction, KeyboardEvent as ReactKeyboardEvent } from "react";

export type GraphNodeSemanticViewModel = {
  selectionBadgeLabel: string;
  roleBadgeLabel: string;
  kindLabel: string;
  kindDescription: string;
  summary: string;
  footprintLabel: string;
  connectivityLabel: string;
};

export type GraphEdgeSemanticViewModel = {
  labelOperational: string;
  defaultVerbLabel: string;
  description: string;
};

export type EditorDiagramInspectorAdapterProps = {
  editorT: EditorTranslationFn;
  diagramType: ContextualDiagramType;
  inspectorCopy: EditorDiagramInspectorCopy;
  inspectorMode: InspectorMode;
  inspectorSections: InspectorSectionState;
  inspectorSelectionBadge: string;
  inspectorSelectionState: InspectorSelectionState;
  selectedNode: RFNode | null;
  selectedEdge: RFEdge | null;
  selectedEdgeSourceLabel: string | null;
  selectedEdgeTargetLabel: string | null;
  saveStatus: EditorAutosaveState["status"];
  nodeKindOptions: DiagramScopedNodeKindOption[];
  edgeKindOptions: EdgeKind[];
  nodeInspectorDraft: NodeInspectorDraft | null;
  setNodeInspectorDraft: Dispatch<SetStateAction<NodeInspectorDraft | null>>;
  edgeInspectorDraft: EdgeInspectorDraft | null;
  setEdgeInspectorDraft: Dispatch<SetStateAction<EdgeInspectorDraft | null>>;
  operationalNodeDraft: OperationalNodeDraft | null;
  setOperationalNodeDraft: Dispatch<SetStateAction<OperationalNodeDraft | null>>;
  operationalEdgeDraft: OperationalEdgeDraft | null;
  setOperationalEdgeDraft: Dispatch<SetStateAction<OperationalEdgeDraft | null>>;
  nodeInspectorDirty: boolean;
  edgeInspectorDirty: boolean;
  nodeInspectorErrors: InspectorFieldErrors;
  edgeInspectorErrors: InspectorFieldErrors;
  nodeInspectorMessage: string | null;
  edgeInspectorMessage: string | null;
  nodeInspectorHasErrors: boolean;
  edgeInspectorHasErrors: boolean;
  graphSelectedNodeSemantic: GraphNodeSemanticViewModel | null | undefined;
  graphSelectedEdgeSemantic: GraphEdgeSemanticViewModel | null | undefined;
  graphSelectedNodeKindLabel: string | null;
  graphSelectedNodeKindDescription: string | null;
  selectedNodeRelations: EditorDiagramNodeRelationsView;
  selectedNodeRoleLabel: string | null;
  selectedNodeStructureTips: string[];
  operationalTagPreview: string[];
  quickAction: SelectionHudQuickAction;
  secondarySelectionActions: SelectionHudQuickAction[];
  processSelectedNodeRelations: ProcessRelationsViewModel | null;
  processNodeInspectorModel: ProcessNodeInspectorViewModel | null;
  processEdgeInspectorModel: ProcessEdgeInspectorViewModel | null;
  selectedErdEntityPayload: ErdEntityPayload | null;
  selectedErdRelationPayload: ErdRelationPayload | null;
  selectedErdSourceEntityNode: RFNode | null;
  selectedErdTargetEntityNode: RFNode | null;
  erdFieldDrafts: Record<string, ErdFieldDraftState>;
  erdMaterializeDependentSide: "source" | "target";
  setErdMaterializeDependentSide: (value: SetStateAction<"source" | "target">) => void;
  erdMaterializeExistingFieldId: string;
  setErdMaterializeExistingFieldId: (value: SetStateAction<string>) => void;
  erdMaterializeUnique: boolean;
  setErdMaterializeUnique: (value: SetStateAction<boolean>) => void;
  selectedErdRelationIssues: SemanticIssueLike[];
  erdPolicy: ErdPolicyConfig;
  onToggleInspectorSection: (sectionKey: keyof InspectorSectionState) => void;
  onHandleAddContextualNode: (action: SelectionHudQuickAction) => void;
  onOpenRelatedNodeFromRelation: (relationId: string, nodeId: string) => void;
  onOpenTransitionFromRelation: (relationId: string) => void;
  onRemoveRelation: (relationId: string) => void;
  onApplyNodeInspector: () => void;
  onResetNodeInspector: () => void;
  onFormatNodeJson: () => void;
  onCopyNodeId: () => Promise<void>;
  onCopyNodeJson: () => Promise<void>;
  onApplyEdgeInspector: () => void;
  onResetEdgeInspector: () => void;
  onFormatEdgeJson: () => void;
  onCopyEdgeId: () => Promise<void>;
  onCopyEdgeJson: () => Promise<void>;
  onRemoveSelected: () => void;
  onUpdateSelectedErdEntityPayload: (
    updater: (payload: ErdEntityPayload) => ErdEntityPayload,
    successMessage?: string,
  ) => boolean;
  onAddErdField: () => void;
  onUpdateErdFieldDraft: (fieldId: string, patch: Partial<ErdFieldDraftState>) => void;
  onCommitErdFieldDraft: (fieldId: string) => void;
  onRemoveErdField: (fieldId: string) => void;
  onToggleErdFieldFlag: (fieldId: string, flag: ErdFieldFlag) => void;
  onMoveErdField: (fieldId: string, direction: "up" | "down") => void;
  onErdFieldShortcut: (
    event: ReactKeyboardEvent<HTMLInputElement>,
    fieldId: string,
  ) => void;
  onUpdateSelectedErdRelationPayload: (
    updater: (payload: ErdRelationPayload) => ErdRelationPayload,
    options?: { successMessage?: string },
  ) => boolean;
  onUpdateSelectedErdRelationName: (name: string) => boolean;
  onApplyErdSuggestedFix: (commands: ErdEditorCommand[]) => void;
  onFocusSemanticIssue: (issue: SemanticIssueLike) => void;
  onSwapSelectedErdRelationDirection: () => void;
  onMaterializeSelectedErdRelationAsFk: () => void;
  onApplySelectedErdOneToOneUniqueFix: () => void;
  onConvertSelectedErdRelationToAssociative: () => void;
  onMarkSelectedErdRelationConceptual: () => void;
};
