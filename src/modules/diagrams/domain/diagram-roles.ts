import type { NodeKind } from "@/src/domain";
import type { DiagramType } from "@/src/modules/graph/domain";

export type DiagramRole =
  | "meta-workspace"
  | "meta-project"
  | "tree-root"
  | "tree-node"
  | "flow-start"
  | "flow-step"
  | "flow-note"
  | "flow-end"
  | "flow-decision"
  | "mindmap-root"
  | "mindmap-branch"
  | "mindmap-reference"
  | "erd-entity"
  | "erd-comment";

export type DiagramRoleDiagramType = DiagramType | "erd" | undefined;

type ResolveDiagramRoleInput = {
  diagramType: DiagramRoleDiagramType;
  nodeKind: NodeKind;
  nodePayload: Record<string, unknown>;
  projectTemplate?: string;
  layoutMetadata?: { rootNodeName?: string | null };
  nodeLabel?: string;
};

type MapiaPayload = {
  role?: DiagramRole;
};

function readMapiaPayload(
  payload: Record<string, unknown> | null | undefined,
): MapiaPayload | undefined {
  if (!payload) {
    return undefined;
  }

  const rawMapia = payload.__mapia;
  if (!rawMapia || typeof rawMapia !== "object" || Array.isArray(rawMapia)) {
    return undefined;
  }

  return rawMapia as MapiaPayload;
}

export function readDiagramRoleFromPayload(
  payload: Record<string, unknown> | null | undefined,
): DiagramRole | undefined {
  const role = readMapiaPayload(payload)?.role;

  if (
    role === "meta-workspace" ||
    role === "meta-project" ||
    role === "tree-root" ||
    role === "tree-node" ||
    role === "flow-start" ||
    role === "flow-step" ||
    role === "flow-note" ||
    role === "flow-end" ||
    role === "flow-decision" ||
    role === "mindmap-root" ||
    role === "mindmap-branch" ||
    role === "mindmap-reference" ||
    role === "erd-entity" ||
    role === "erd-comment"
  ) {
    return role;
  }

  return undefined;
}

export function writeDiagramRoleToPayload(
  payload: Record<string, unknown>,
  role: DiagramRole | undefined,
) {
  const nextPayload = { ...payload };
  const currentMapia = readMapiaPayload(payload) ?? {};
  const nextMapia: MapiaPayload = { ...currentMapia };

  if (role) {
    nextMapia.role = role;
  } else {
    delete nextMapia.role;
  }

  if (Object.keys(nextMapia).length === 0) {
    delete nextPayload.__mapia;
  } else {
    nextPayload.__mapia = nextMapia;
  }

  return nextPayload;
}

function matchesRootByName(input: {
  rootNodeName?: string | null;
  nodeLabel?: string;
}) {
  const rootName = input.rootNodeName?.trim().toLowerCase();
  const nodeLabel = input.nodeLabel?.trim().toLowerCase();

  if (!rootName || !nodeLabel) {
    return false;
  }

  return rootName === nodeLabel;
}

export function resolveDiagramRole(input: ResolveDiagramRoleInput): DiagramRole {
  const explicitRole = readDiagramRoleFromPayload(input.nodePayload);

  if (input.nodeKind === "workspace") {
    return "meta-workspace";
  }

  if (input.nodeKind === "project") {
    if (input.diagramType === "tree") {
      return "tree-root";
    }

    if (input.diagramType === "flow") {
      return "flow-start";
    }

    return "meta-project";
  }

  if (input.diagramType === "tree") {
    return "tree-node";
  }

  if (input.diagramType === "flow") {
    if (
      explicitRole === "flow-start" ||
      explicitRole === "flow-end" ||
      explicitRole === "flow-step" ||
      explicitRole === "flow-note" ||
      explicitRole === "flow-decision"
    ) {
      return explicitRole;
    }

    if (input.nodeKind === "note") {
      return "flow-note";
    }

    return "flow-step";
  }

  if (input.diagramType === "mindmap") {
    if (explicitRole === "mindmap-root") {
      return "mindmap-root";
    }

    if (
      matchesRootByName({
        rootNodeName: input.layoutMetadata?.rootNodeName,
        nodeLabel: input.nodeLabel,
      })
    ) {
      return "mindmap-root";
    }

    if (explicitRole === "mindmap-reference") {
      return "mindmap-reference";
    }

    return "mindmap-branch";
  }

  if (input.diagramType === "erd") {
    if (input.nodeKind === "note") {
      return "erd-comment";
    }

    return "erd-entity";
  }

  if (input.nodeKind === "entity") {
    return "erd-entity";
  }

  if (input.nodeKind === "flow-step") {
    return "flow-step";
  }

  if (input.nodeKind === "page") {
    return "tree-node";
  }

  return "mindmap-branch";
}
