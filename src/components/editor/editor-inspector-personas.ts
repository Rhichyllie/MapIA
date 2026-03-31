import type { EdgeKind, NodeKind } from "@/src/domain";
import {
  readDiagramRoleFromPayload,
  readProcessOperationalContextFromPayload,
  writeProcessOperationalContextToPayload,
  type DiagramRole,
  type ProcessCriticality,
} from "@/src/modules/diagrams/domain";
import type { EditorTranslationFn } from "./editor-i18n";
import {
  getEdgeKindDescription,
  getEdgeKindLabel,
  getNodeKindDescription,
  getNodeKindLabel,
  getOperationalDisplayLabel,
} from "./presentation/kinds";

export type InspectorMode = "operational" | "technical";

type NodeInspectorSource = {
  label: string;
  kind: NodeKind;
  payload: Record<string, unknown>;
};

export type OperationalNodeDraft = {
  label: string;
  kind: NodeKind;
  diagramRole?: DiagramRole;
  description: string;
  tagsText: string;
  owner: string;
  area: string;
  channel: string;
  criticality: ProcessCriticality | "";
  sla: string;
  rule: string;
  exception: string;
};

export function getFriendlyNodeKindLabel(kind: NodeKind, t?: EditorTranslationFn) {
  return getNodeKindLabel(kind, "operational", t);
}

export function getFriendlyNodeKindDescription(kind: NodeKind, t?: EditorTranslationFn) {
  return getNodeKindDescription(kind, t);
}

export function getFriendlyEdgeKindLabel(kind: EdgeKind, t?: EditorTranslationFn) {
  return getEdgeKindLabel(kind, "operational", t);
}

export function getFriendlyEdgeKindDescription(kind: EdgeKind, t?: EditorTranslationFn) {
  return getEdgeKindDescription(kind, t);
}

export function createOperationalNodeDraft(
  source: NodeInspectorSource,
  t?: EditorTranslationFn,
): OperationalNodeDraft {
  const rawDescription = source.payload.description;
  const rawTags = source.payload.tags;
  const description =
    typeof rawDescription === "string" ? rawDescription : "";
  const tagsArray = Array.isArray(rawTags)
    ? rawTags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const processContext = readProcessOperationalContextFromPayload(source.payload);

  return {
    label: getOperationalDisplayLabel({
      label: source.label,
      payload: source.payload,
    }, t),
    kind: source.kind,
    diagramRole: readDiagramRoleFromPayload(source.payload),
    description,
    tagsText: tagsArray.join(", "),
    owner: processContext.owner ?? "",
    area: processContext.area ?? "",
    channel: processContext.channel ?? "",
    criticality: processContext.criticality ?? "",
    sla: processContext.sla ?? "",
    rule: processContext.rule ?? "",
    exception: processContext.exception ?? "",
  };
}

export function normalizeTagsInput(tagsText: string) {
  const normalized = tagsText
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return [...new Set(normalized)];
}

export function mergeOperationalNodePayload(
  currentPayload: Record<string, unknown>,
  draft: Pick<
    OperationalNodeDraft,
    | "description"
    | "tagsText"
    | "owner"
    | "area"
    | "channel"
    | "criticality"
    | "sla"
    | "rule"
    | "exception"
  >,
) {
  const nextPayload: Record<string, unknown> = {
    ...currentPayload,
  };
  const description = draft.description.trim();
  const tags = normalizeTagsInput(draft.tagsText);

  if (description) {
    nextPayload.description = description;
  } else {
    delete nextPayload.description;
  }

  if (tags.length > 0) {
    nextPayload.tags = tags;
  } else {
    delete nextPayload.tags;
  }

  return writeProcessOperationalContextToPayload(nextPayload, {
    owner: draft.owner,
    area: draft.area,
    channel: draft.channel,
    criticality: draft.criticality || undefined,
    sla: draft.sla,
    rule: draft.rule,
    exception: draft.exception,
  });
}
