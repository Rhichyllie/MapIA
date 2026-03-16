import type { NodeKind } from "@/src/domain";
import type { DiagramType } from "@/src/modules/graph/domain";

type DiagramScopedDiagramType =
  | DiagramType
  | "erd"
  | "sitemap"
  | "graph"
  | "timeline"
  | undefined;
type DiagramScopedInspectorMode = "operational" | "technical";
type DiagramScopedPolicy =
  | {
      customRulesJson?: unknown;
    }
  | null
  | undefined;

export type DiagramScopedNodeKindOption = {
  kind: NodeKind;
  outOfProfile: boolean;
  group: "perfil" | "meta" | "fora-do-perfil";
};

const ALL_NODE_KINDS: NodeKind[] = [
  "workspace",
  "project",
  "entity",
  "page",
  "flow-step",
  "note",
];

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function resolveAllowErdNote(inputPolicy: DiagramScopedPolicy) {
  const customRules = readRecord(inputPolicy?.customRulesJson);
  const erdRules = readRecord(customRules?.erd);

  return erdRules?.allowNoteNodes === true || erdRules?.allowNoteAsComment === true;
}

function resolveProfileKinds(
  diagramType: DiagramScopedDiagramType,
  policy: DiagramScopedPolicy,
): NodeKind[] {
  if (diagramType === "flow") {
    return ["flow-step", "note"];
  }

  if (diagramType === "tree") {
    return ["page", "note"];
  }

  if (diagramType === "sitemap") {
    return ["page", "note"];
  }

  if (diagramType === "mindmap") {
    return ["note"];
  }

  if (diagramType === "erd") {
    return resolveAllowErdNote(policy) ? ["entity", "note"] : ["entity"];
  }

  if (diagramType === "graph") {
    return ["entity", "page", "note"];
  }

  if (diagramType === "timeline") {
    return ["note", "flow-step"];
  }

  return ["page", "flow-step", "entity", "note"];
}

export function getAllowedKindsForDiagram(
  diagramType: DiagramScopedDiagramType,
  inspectorMode: DiagramScopedInspectorMode,
  policy: DiagramScopedPolicy,
): DiagramScopedNodeKindOption[] {
  const profileKinds = resolveProfileKinds(diagramType, policy);

  if (inspectorMode === "operational") {
    return profileKinds.map((kind) => ({
      kind,
      outOfProfile: false,
      group: "perfil",
    }));
  }

  const profileSet = new Set(profileKinds);
  const metaKinds: NodeKind[] = ["workspace", "project"];
  const result: DiagramScopedNodeKindOption[] = [];

  for (const kind of profileKinds) {
    result.push({
      kind,
      outOfProfile: false,
      group: "perfil",
    });
  }

  for (const kind of metaKinds) {
    if (profileSet.has(kind)) {
      continue;
    }

    result.push({
      kind,
      outOfProfile: true,
      group: "meta",
    });
  }

  for (const kind of ALL_NODE_KINDS) {
    if (profileSet.has(kind) || metaKinds.includes(kind)) {
      continue;
    }

    result.push({
      kind,
      outOfProfile: true,
      group: "fora-do-perfil",
    });
  }

  return result;
}
