import type { NodeKind } from "@/src/domain";
import {
  normalizeErdEntityPayload,
  normalizeErdPolicyFromCustomRules,
  normalizeErdRelationPayload,
  type ErdEditorCommand,
  type ErdEntityPayload,
  type ErdField,
  type ErdFieldFlag,
  type ErdPolicyConfig,
  type ErdRelationPayload,
} from "@/src/modules/erd/domain";
import type { DiagramRole } from "@/src/modules/diagrams/domain";
import type { EditorSnapshotVersionDiff, EditorSnapshotVersionSummary, EditorPrismaSchemaImportSummary, SemanticPolicyPayload } from "../editor-query-service";
import { EditorQueryError } from "../editor-query-service";
import { EditorRemoteError } from "../editor-command-service";
import { translateEditor, type EditorTranslationFn } from "../editor-i18n";
import type { RFEdge, RFNode } from "../editor-graph-mappers";
import { formatInspectorJson, type EdgeInspectorDraft, type NodeInspectorDraft } from "../editor-inspector-schemas";
import { createOperationalNodeDraft, normalizeTagsInput, type OperationalNodeDraft } from "../editor-inspector-personas";
import type { SemanticEngineOptions } from "../semantics/semantics";
import {
  DEFAULT_EDITOR_PANEL_STATE,
  DEFAULT_INSPECTOR_SECTION_STATE,
  type EditorPanelState,
  type InspectorSectionState,
  type OperationalEdgeDraft,
  type SemanticIssueLike,
} from "./editor-shell-types";
import { getNodeKindLabel, getNodeKindLabelForDiagram, type ContextualDiagramType } from "../presentation/kinds";

export function formatErrorMessage(error: unknown, fallback: string) {
  if (error instanceof EditorQueryError || error instanceof EditorRemoteError) {
    const payloadMessage = error.payload?.message?.trim();
    return payloadMessage ? payloadMessage : fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function formatVersionCreatedAtLabel(createdAt: string, locale: string) {
  const parsed = new Date(createdAt);

  if (Number.isNaN(parsed.getTime())) {
    return createdAt;
  }

  return parsed.toLocaleString(locale);
}

export function formatVersionOriginLabel(
  origin: EditorSnapshotVersionSummary["origin"],
  t?: EditorTranslationFn,
) {
  if (origin === "manual") {
    return translateEditor(t, "shell.versions.origin.manual");
  }

  return origin;
}

export function buildVersionDiffFeedbackMessage(
  diff: EditorSnapshotVersionDiff,
  t?: EditorTranslationFn,
) {
  if (!diff.hasChanges) {
    return translateEditor(t, "shell.versions.diff.noChanges");
  }

  const parts: string[] = [];

  if (diff.nodesAdded.length > 0) {
    parts.push(translateEditor(t, "shell.versions.diff.nodesAdded", {
      count: diff.nodesAdded.length,
    }));
  }
  if (diff.nodesRemoved.length > 0) {
    parts.push(translateEditor(t, "shell.versions.diff.nodesRemoved", {
      count: diff.nodesRemoved.length,
    }));
  }
  if (diff.nodesChanged.length > 0) {
    parts.push(translateEditor(t, "shell.versions.diff.nodesChanged", {
      count: diff.nodesChanged.length,
    }));
  }
  if (diff.edgesAdded.length > 0) {
    parts.push(translateEditor(t, "shell.versions.diff.edgesAdded", {
      count: diff.edgesAdded.length,
    }));
  }
  if (diff.edgesRemoved.length > 0) {
    parts.push(translateEditor(t, "shell.versions.diff.edgesRemoved", {
      count: diff.edgesRemoved.length,
    }));
  }
  if (diff.edgesChanged.length > 0) {
    parts.push(translateEditor(t, "shell.versions.diff.edgesChanged", {
      count: diff.edgesChanged.length,
    }));
  }
  if (diff.viewportChanged) {
    parts.push(translateEditor(t, "shell.versions.diff.viewportChanged"));
  }

  return translateEditor(t, "shell.versions.diff.summary", {
    parts: parts.join("; "),
  });
}

export function buildPrismaSchemaImportFeedbackMessage(
  summary: EditorPrismaSchemaImportSummary | undefined,
  t?: EditorTranslationFn,
) {
  if (!summary) {
    return translateEditor(t, "shell.prisma.feedbackSuccess");
  }

  return translateEditor(t, "shell.prisma.feedbackSuccessWithCounts", {
    modelsCount: summary.modelsCount,
    relationsCount: summary.relationsCount,
    scalarFieldsCount: summary.scalarFieldsCount,
  });
}

export function toSemanticEngineOptionsFromPolicy(
  policy: SemanticPolicyPayload | null,
): SemanticEngineOptions | undefined {
  if (!policy) {
    return undefined;
  }

  const customRulesJson =
    policy.customRulesJson &&
    typeof policy.customRulesJson === "object" &&
    !Array.isArray(policy.customRulesJson)
      ? policy.customRulesJson
      : undefined;

  return {
    strictEnabled: policy.strictEnabled,
    ...(customRulesJson ? { customRulesJson } : {}),
  };
}

export function buildDefaultNodeTitle(
  kind: NodeKind,
  nextIndex: number,
  diagramType?: ContextualDiagramType,
  t?: EditorTranslationFn,
) {
  const nodeKindLabel = diagramType
    ? getNodeKindLabelForDiagram(diagramType, kind, "operational", t)
    : getNodeKindLabel(kind, "operational", t);
  return `${nodeKindLabel} ${nextIndex}`;
}

export function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

export function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

export function isClipboardPartialEdgePasteEnabled(
  policy: SemanticPolicyPayload | null | undefined,
) {
  const customRules = readRecord(policy?.customRulesJson);
  const clipboardRules = readRecord(customRules?.clipboard);

  return (
    readBoolean(clipboardRules?.allowPasteWithoutInvalidEdges) === true ||
    readBoolean(clipboardRules?.allowPartialEdgePaste) === true
  );
}

export function toErdPolicyConfig(
  policy: SemanticPolicyPayload | null | undefined,
): ErdPolicyConfig {
  return normalizeErdPolicyFromCustomRules(
    readRecord(policy?.customRulesJson),
  );
}

export function normalizeErdEntityPayloadFromNode(node: RFNode): ErdEntityPayload {
  return normalizeErdEntityPayload(readRecord(node.data.payload), {
    entityId: node.id,
    fallbackLabel: node.data.label,
  });
}

export function normalizeErdRelationPayloadFromEdge(edge: RFEdge): ErdRelationPayload {
  return normalizeErdRelationPayload(readRecord(edge.data?.payload), {
    sourceEntityId: edge.source,
    targetEntityId: edge.target,
  });
}

export function createErdField(input: { entityId: string; index: number }): ErdField {
  return {
    id: `${input.entityId}-field-${crypto.randomUUID()}`,
    name: `campo_${input.index}`,
    type: "string",
    flags: ["NULLABLE"],
  };
}

export function toggleErdFieldFlag(input: {
  field: ErdField;
  flag: ErdFieldFlag;
}): ErdField {
  const nextFlags = new Set<ErdFieldFlag>(input.field.flags);
  if (nextFlags.has(input.flag)) {
    nextFlags.delete(input.flag);
  } else {
    nextFlags.add(input.flag);
  }

  if (input.flag === "NOT_NULL" && nextFlags.has("NOT_NULL")) {
    nextFlags.delete("NULLABLE");
  } else if (input.flag === "NOT_NULL" && !nextFlags.has("NOT_NULL")) {
    nextFlags.add("NULLABLE");
  }

  if (input.flag === "NULLABLE" && nextFlags.has("NULLABLE")) {
    nextFlags.delete("NOT_NULL");
  }

  if (input.flag === "PK" && nextFlags.has("PK")) {
    nextFlags.add("NOT_NULL");
    nextFlags.delete("NULLABLE");
  }

  return {
    ...input.field,
    flags: [...nextFlags],
  };
}

export function flipErdRelationPayloadDirection(
  payload: ErdRelationPayload,
): ErdRelationPayload {
  const currentCardinality = payload.cardinality;
  const swappedCardinality = currentCardinality
    ? {
        minSource: currentCardinality.minTarget,
        maxSource: currentCardinality.maxTarget,
        minTarget: currentCardinality.minSource,
        maxTarget: currentCardinality.maxSource,
      }
    : undefined;
  const roles = payload.roles
    ? {
        sourceRole: payload.roles.targetRole,
        targetRole: payload.roles.sourceRole,
      }
    : undefined;
  const materialization =
    payload.materialization?.mode === "fk"
      ? {
          ...payload.materialization,
          dependentSide:
            payload.materialization.dependentSide === "source"
              ? ("target" as const)
              : ("source" as const),
        }
      : payload.materialization;

  return {
    ...payload,
    ...(swappedCardinality ? { cardinality: swappedCardinality } : {}),
    ...(roles ? { roles } : {}),
    ...(materialization ? { materialization } : {}),
  };
}

function readIssueSuggestedFixCommands(value: unknown): ErdEditorCommand[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const commands: ErdEditorCommand[] = [];
  for (const command of value) {
    if (!command || typeof command !== "object" || Array.isArray(command)) {
      continue;
    }

    const parsed = command as ErdEditorCommand;
    if (typeof (parsed as { type?: unknown }).type !== "string") {
      continue;
    }

    commands.push(parsed);
  }

  return commands;
}

export function readIssueSuggestedFixes(issue: SemanticIssueLike) {
  const rawFixes = Array.isArray(issue.suggestedFixes) ? issue.suggestedFixes : [];

  return rawFixes
    .map((fix) => {
      if (!fix || typeof fix !== "object") {
        return null;
      }

      const parsed = fix as {
        id?: unknown;
        label?: unknown;
        description?: unknown;
        safety?: unknown;
        commands?: unknown;
      };
      if (typeof parsed.id !== "string" || typeof parsed.label !== "string") {
        return null;
      }

      const safety = parsed.safety === "manual" ? "manual" : "safe";
      const commands = readIssueSuggestedFixCommands(parsed.commands);
      if (commands.length === 0) {
        return null;
      }

      return {
        id: parsed.id,
        label: parsed.label,
        ...(typeof parsed.description === "string"
          ? { description: parsed.description }
          : {}),
        safety,
        commands,
      };
    })
    .filter(
      (fix): fix is {
        id: string;
        label: string;
        description?: string;
        safety: "safe" | "manual";
        commands: ErdEditorCommand[];
      } => Boolean(fix),
    );
}

export function getSemanticSeverityLabel(
  severity: SemanticIssueLike["severity"],
  t?: EditorTranslationFn,
) {
  if (severity === "error") {
    return translateEditor(t, "shell.semanticSeverity.error");
  }
  if (severity === "warning") {
    return translateEditor(t, "shell.semanticSeverity.warning");
  }
  if (severity === "suggestion") {
    return translateEditor(t, "shell.semanticSeverity.suggestion");
  }

  return translateEditor(t, "shell.semanticSeverity.info");
}

export function createNodeInspectorDraft(node: RFNode): NodeInspectorDraft {
  return {
    label: node.data.label,
    kind: node.data.kind,
    dataJson: formatInspectorJson(node.data.payload),
  };
}

export function createEdgeInspectorDraft(edge: RFEdge): EdgeInspectorDraft {
  return {
    label: edge.label ? String(edge.label) : "",
    kind: edge.data?.kind ?? "flows-to",
    dataJson: formatInspectorJson(edge.data?.payload ?? {}),
  };
}

export function getNodeSelectionSyncKey(node: RFNode | null) {
  if (!node) {
    return null;
  }

  return `${node.id}:${node.data.label}:${node.data.kind}:${JSON.stringify(node.data.payload)}`;
}

export function getEdgeSelectionSyncKey(edge: RFEdge | null) {
  if (!edge) {
    return null;
  }

  return `${edge.id}:${edge.label ? String(edge.label) : ""}:${edge.data?.kind ?? "flows-to"}:${JSON.stringify(edge.data?.payload ?? {})}`;
}

export function areNodeDraftValuesEqual(
  node: RFNode | null,
  draft: NodeInspectorDraft | null,
) {
  if (!node || !draft) {
    return false;
  }

  return (
    node.data.label === draft.label &&
    node.data.kind === draft.kind &&
    formatInspectorJson(node.data.payload) === draft.dataJson
  );
}

export function areEdgeDraftValuesEqual(
  edge: RFEdge | null,
  draft: EdgeInspectorDraft | null,
) {
  if (!edge || !draft) {
    return false;
  }

  return (
    (edge.label ? String(edge.label) : "") === draft.label &&
    (edge.data?.kind ?? "flows-to") === draft.kind &&
    formatInspectorJson(edge.data?.payload ?? {}) === draft.dataJson
  );
}

export function sanitizeVersionNameMap(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, string>;
  }

  return Object.entries(value).reduce<Record<string, string>>((acc, entry) => {
    const [versionId, versionName] = entry;
    if (typeof versionName !== "string") {
      return acc;
    }

    const trimmed = versionName.trim();
    if (!trimmed) {
      return acc;
    }

    acc[versionId] = trimmed.slice(0, 120);
    return acc;
  }, {});
}

export function syncVersionNameDrafts(input: {
  currentDrafts: Record<string, string>;
  localVersionNames: Record<string, string>;
  snapshotVersions: EditorSnapshotVersionSummary[];
}) {
  const next = { ...input.currentDrafts };
  let changed = false;

  for (const version of input.snapshotVersions) {
    const fallbackLabel =
      input.localVersionNames[version.id] ?? version.label?.trim() ?? "";

    if (next[version.id] === undefined) {
      next[version.id] = fallbackLabel;
      changed = true;
    }
  }

  return changed ? next : input.currentDrafts;
}

export function getVersionDisplayName(input: {
  version: EditorSnapshotVersionSummary;
  localVersionNames: Record<string, string>;
  t?: EditorTranslationFn;
}) {
  return (
    input.localVersionNames[input.version.id] ||
    input.version.label?.trim() ||
    translateEditor(input.t, "shell.versions.unnamed")
  );
}

export function sanitizeEditorPanelState(value: unknown): EditorPanelState {
  if (!value || typeof value !== "object") {
    return DEFAULT_EDITOR_PANEL_STATE;
  }

  const candidate = value as Record<string, unknown>;

  return {
    metadata:
      typeof candidate.metadata === "boolean"
        ? candidate.metadata
        : DEFAULT_EDITOR_PANEL_STATE.metadata,
    prismaImport:
      typeof candidate.prismaImport === "boolean"
        ? candidate.prismaImport
        : DEFAULT_EDITOR_PANEL_STATE.prismaImport,
    versions:
      typeof candidate.versions === "boolean"
        ? candidate.versions
        : DEFAULT_EDITOR_PANEL_STATE.versions,
  };
}

export function sanitizeInspectorSectionState(value: unknown): InspectorSectionState {
  if (!value || typeof value !== "object") {
    return DEFAULT_INSPECTOR_SECTION_STATE;
  }

  const candidate = value as Record<string, unknown>;

  return {
    general:
      typeof candidate.general === "boolean"
        ? candidate.general
        : DEFAULT_INSPECTOR_SECTION_STATE.general,
    details:
      typeof candidate.details === "boolean"
        ? candidate.details
        : DEFAULT_INSPECTOR_SECTION_STATE.details,
    relations:
      typeof candidate.relations === "boolean"
        ? candidate.relations
        : DEFAULT_INSPECTOR_SECTION_STATE.relations,
    advanced:
      typeof candidate.advanced === "boolean"
        ? candidate.advanced
        : DEFAULT_INSPECTOR_SECTION_STATE.advanced,
  };
}

export async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

export function areOperationalNodeDraftValuesEqual(
  node: RFNode | null,
  draft: OperationalNodeDraft | null,
) {
  if (!node || !draft) {
    return false;
  }

  const baseline = createOperationalNodeDraft({
    label: node.data.label,
    kind: node.data.kind,
    payload: node.data.payload,
  });

  const baselineTags = normalizeTagsInput(baseline.tagsText).join("|");
  const draftTags = normalizeTagsInput(draft.tagsText).join("|");

  return (
    baseline.label === draft.label &&
    baseline.kind === draft.kind &&
    baseline.diagramRole === draft.diagramRole &&
    baseline.description.trim() === draft.description.trim() &&
    baseline.owner.trim() === draft.owner.trim() &&
    baseline.area.trim() === draft.area.trim() &&
    baseline.channel.trim() === draft.channel.trim() &&
    baseline.criticality === draft.criticality &&
    baseline.sla.trim() === draft.sla.trim() &&
    baseline.rule.trim() === draft.rule.trim() &&
    baseline.exception.trim() === draft.exception.trim() &&
    baselineTags === draftTags
  );
}

export function areOperationalEdgeDraftValuesEqual(
  edge: RFEdge | null,
  draft: OperationalEdgeDraft | null,
) {
  if (!edge || !draft) {
    return false;
  }

  return (
    (edge.label ? String(edge.label) : "") === draft.label &&
    (edge.data?.kind ?? "flows-to") === draft.kind
  );
}

export function hasInspectorDraftPendingChanges(input: {
  inspectorMode: "operational" | "technical";
  selectedNode: RFNode | null;
  selectedEdge: RFEdge | null;
  operationalNodeDraft: OperationalNodeDraft | null;
  operationalEdgeDraft: OperationalEdgeDraft | null;
  nodeInspectorDraft: NodeInspectorDraft | null;
  edgeInspectorDraft: EdgeInspectorDraft | null;
}) {
  const nodeDirty =
    input.inspectorMode === "operational"
      ? input.selectedNode !== null &&
        input.operationalNodeDraft !== null &&
        !areOperationalNodeDraftValuesEqual(input.selectedNode, input.operationalNodeDraft)
      : input.selectedNode !== null &&
        input.nodeInspectorDraft !== null &&
        !areNodeDraftValuesEqual(input.selectedNode, input.nodeInspectorDraft);

  const edgeDirty =
    input.inspectorMode === "operational"
      ? input.selectedEdge !== null &&
        input.operationalEdgeDraft !== null &&
        !areOperationalEdgeDraftValuesEqual(input.selectedEdge, input.operationalEdgeDraft)
      : input.selectedEdge !== null &&
        input.edgeInspectorDraft !== null &&
        !areEdgeDraftValuesEqual(input.selectedEdge, input.edgeInspectorDraft);

  return nodeDirty || edgeDirty;
}

export function clonePayload(payload: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(payload ?? {})) as Record<string, unknown>;
}

export function buildDiagramRolePayload(
  basePayload: Record<string, unknown>,
  diagramRole?: DiagramRole,
) {
  if (!diagramRole) {
    return basePayload;
  }

  return {
    ...basePayload,
    diagramRole,
  };
}
