import type { NodeKind } from "@/src/domain";
import { resolveGraphDiagramRole } from "./graph-semantics";
import { resolveFlowDiagramRole } from "./flow-diagram-roles";
import type { DiagramType } from "@/src/modules/graph/domain";

export type DiagramRole =
  | "meta-workspace"
  | "meta-project"
  | "tree-root"
  | "tree-node"
  | "hierarchy-root"
  | "hierarchy-node"
  | "sitemap-home"
  | "sitemap-section"
  | "flow-start"
  | "flow-step"
  | "flow-note"
  | "flow-end"
  | "flow-decision"
  | "mindmap-root"
  | "mindmap-branch"
  | "mindmap-reference"
  | "graph-core"
  | "graph-topic"
  | "graph-supporting"
  | "timeline-milestone"
  | "erd-entity"
  | "erd-comment";

export type DiagramRoleDiagramType =
  | DiagramType
  | "erd"
  | "sitemap"
  | "graph"
  | "timeline"
  | undefined;

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
    role === "hierarchy-root" ||
    role === "hierarchy-node" ||
    role === "sitemap-home" ||
    role === "sitemap-section" ||
    role === "flow-start" ||
    role === "flow-step" ||
    role === "flow-note" ||
    role === "flow-end" ||
    role === "flow-decision" ||
    role === "mindmap-root" ||
    role === "mindmap-branch" ||
    role === "mindmap-reference" ||
    role === "graph-core" ||
    role === "graph-topic" ||
    role === "graph-supporting" ||
    role === "timeline-milestone" ||
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

function normalizedLabel(value: string | undefined) {
  return value?.trim().toLowerCase();
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

    if (input.diagramType === "sitemap") {
      return "sitemap-home";
    }

    if (input.diagramType === "flow") {
      return "flow-start";
    }

    if (input.diagramType === "timeline") {
      return "timeline-milestone";
    }

    return "meta-project";
  }

  if (input.diagramType === "tree") {
    if (explicitRole === "hierarchy-root" || explicitRole === "hierarchy-node") {
      return explicitRole;
    }

    if (explicitRole === "tree-root" || explicitRole === "tree-node") {
      return explicitRole;
    }

    return "tree-node";
  }

  if (input.diagramType === "sitemap") {
    if (explicitRole === "sitemap-home" || explicitRole === "sitemap-section") {
      return explicitRole;
    }

    const nodeLabel = normalizedLabel(input.nodeLabel);
    if (nodeLabel === "home" || nodeLabel === "inicio") {
      return "sitemap-home";
    }

    if (input.nodeKind === "page") {
      return "sitemap-section";
    }

    return "mindmap-reference";
  }

  if (input.diagramType === "flow") {
    if (input.nodeKind === "flow-step" || input.nodeKind === "note") {
      return resolveFlowDiagramRole({
        explicitRole,
        nodeKind: input.nodeKind,
        nodeLabel: input.nodeLabel,
      });
    }

    if (input.nodeKind === "entity") {
      return "erd-entity";
    }

    return "tree-node";
  }

  if (input.diagramType === "mindmap") {
    if (input.nodeKind !== "note") {
      if (input.nodeKind === "flow-step") {
        return "flow-step";
      }

      if (input.nodeKind === "entity") {
        return "erd-entity";
      }

      return "tree-node";
    }

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
    if (input.nodeKind === "entity") {
      return "erd-entity";
    }

    if (input.nodeKind === "note") {
      return "erd-comment";
    }

    if (input.nodeKind === "flow-step") {
      return "flow-step";
    }

    return "tree-node";
  }

  if (input.diagramType === "graph") {
    return resolveGraphDiagramRole({
      diagramRole: explicitRole,
      nodeKind: input.nodeKind,
      nodeLabel: input.nodeLabel,
    });
  }

  if (input.diagramType === "timeline") {
    if (explicitRole === "timeline-milestone") {
      return explicitRole;
    }

    return "timeline-milestone";
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
