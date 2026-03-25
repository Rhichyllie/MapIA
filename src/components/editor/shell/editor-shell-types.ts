import type { EdgeKind, NodeKind } from "@/src/domain";
import type { DiagramRole } from "@/src/modules/diagrams/domain";
import type { EditorCommand } from "@/src/modules/editor/application";
import type { RepairPlan, SemanticViolation } from "../semantics/semantics";
import type { EdgeInspectorDraft } from "../editor-inspector-schemas";
import type { EditorDiagramContextualInsertMode, EditorDiagramNodeRelationsView, EditorDiagramSelectionQuickAction } from "../diagram-modes";
import type { ErdField, ErdFieldFlag } from "@/src/modules/erd/domain";

export type PendingEditorCommand = {
  localVersion: number;
  command: EditorCommand;
};

export type VersionCreateFeedback =
  | { kind: "success" | "error"; message: string }
  | null;

export type VersionActionFeedback =
  | { kind: "success" | "error"; message: string }
  | null;

export type VersionDiffFeedback =
  | { kind: "info" | "error"; message: string }
  | null;

export type PrismaSchemaImportFeedback =
  | { kind: "success" | "error"; message: string }
  | null;

export type ErdExportFeedback =
  | { kind: "success" | "error" | "info"; message: string }
  | null;

export type OperationalEdgeDraft = {
  label: string;
  kind: EdgeInspectorDraft["kind"];
};

export type AddNodeDraft = {
  kind: NodeKind;
  diagramRole?: DiagramRole;
  title: string;
  description: string;
  tagsText: string;
};

export type SelectionHudQuickAction = EditorDiagramSelectionQuickAction;

export type InspectorNodeRelationsView = EditorDiagramNodeRelationsView;

export type ContextualInsertMode = EditorDiagramContextualInsertMode;

export type ClipboardAddNodeCommand = Extract<EditorCommand, { type: "addNode" }>;

export type ClipboardAddEdgeCommand = Extract<EditorCommand, { type: "addEdge" }>;

export type ClipboardCommandsDraft = {
  nodeCommands: ClipboardAddNodeCommand[];
  edgeCommands: ClipboardAddEdgeCommand[];
  skippedEdges: number;
  firstInsertedNodeId?: string;
};

export type PendingConnectionAssistantState = {
  sourceNodeId: string;
  targetNodeId: string;
  sourceLabel: string;
  targetLabel: string;
  attemptedEdgeKind: EdgeKind;
  allowedEdgeKinds: EdgeKind[];
  recommendedEdgeKind?: EdgeKind;
  message: string;
  details?: string;
};

export type PendingErdQuickRelateState = {
  sourceNodeId: string;
  targetNodeId: string;
  sourceLabel: string;
  targetLabel: string;
  style: {
    left: string;
    top: string;
  };
};

export type PendingNodeRepairState = {
  command: Extract<EditorCommand, { type: "updateNode" }>;
  repairPlan: RepairPlan;
  violations: SemanticViolation[];
};

export type PendingSemanticOverrideState = {
  title: string;
  message: string;
  requireReason: boolean;
  onConfirm: (reason: string) => Promise<void>;
};

export type SemanticIssueLike = {
  id: string;
  code: string;
  severity: "error" | "warning" | "info" | "suggestion";
  message: string;
  explanation?: string;
  details?: string;
  suggestedFixes?: unknown;
  targetType: "graph" | "node" | "edge";
  targetId?: string;
};

export type MapiaClipboardFragment = {
  version: 1;
  sourceProjectId: string;
  nodes: Array<{
    id: string;
    kind: NodeKind;
    label: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    kind: EdgeKind;
    label?: string;
    data: Record<string, unknown>;
  }>;
};

export type ErdFieldDraftState = {
  name: string;
  type: string;
};

export type EditorPanelState = {
  metadata: boolean;
  prismaImport: boolean;
  versions: boolean;
};

export type InspectorSectionState = {
  general: boolean;
  details: boolean;
  relations: boolean;
  advanced: boolean;
};

export const DEFAULT_EDITOR_PANEL_STATE: EditorPanelState = {
  metadata: true,
  prismaImport: true,
  versions: true,
};

export const DEFAULT_INSPECTOR_SECTION_STATE: InspectorSectionState = {
  general: true,
  details: true,
  relations: true,
  advanced: false,
};

export const DEFAULT_ADD_NODE_OFFSET = {
  x: 220,
  y: 64,
};

export const ERD_FIELD_FLAGS = ["PK", "FK", "UQ", "NOT_NULL"] as const satisfies readonly ErdFieldFlag[];

export const ERD_LOGICAL_TYPES = [
  "string",
  "text",
  "integer",
  "uuid",
  "datetime",
  "boolean",
  "json",
  "decimal",
] as const;

export const ERD_CARDINALITY_PRESETS = ["1:1", "1:N", "N:1", "N:N"] as const;

export type ErdCardinalityPresetOption = (typeof ERD_CARDINALITY_PRESETS)[number];

export type ErdFieldFlagOption = (typeof ERD_FIELD_FLAGS)[number];

export type ErdLogicalTypeOption = (typeof ERD_LOGICAL_TYPES)[number];

export type ErdFieldViewModel = {
  field: ErdField;
  draft: {
    name: string;
    type: string;
  };
  index: number;
  isFirst: boolean;
  isLast: boolean;
  nextFieldId?: string;
};
