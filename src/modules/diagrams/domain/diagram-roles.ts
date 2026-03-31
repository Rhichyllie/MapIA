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

const DIAGRAM_ROLES = [
  "meta-workspace",
  "meta-project",
  "tree-root",
  "tree-node",
  "hierarchy-root",
  "hierarchy-node",
  "sitemap-home",
  "sitemap-section",
  "flow-start",
  "flow-step",
  "flow-note",
  "flow-end",
  "flow-decision",
  "mindmap-root",
  "mindmap-branch",
  "mindmap-reference",
  "graph-core",
  "graph-topic",
  "graph-supporting",
  "timeline-milestone",
  "erd-entity",
  "erd-comment",
] as const satisfies readonly DiagramRole[];

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

function normalizeDiagramRole(value: unknown): DiagramRole | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return (DIAGRAM_ROLES as readonly string[]).includes(value)
    ? (value as DiagramRole)
    : undefined;
}

function readLegacyDiagramRoleFromPayload(
  payload: Record<string, unknown> | null | undefined,
) {
  return normalizeDiagramRole(payload?.role);
}

export function readDiagramRoleFromPayload(
  payload: Record<string, unknown> | null | undefined,
): DiagramRole | undefined {
  return (
    normalizeDiagramRole(readMapiaPayload(payload)?.role) ??
    readLegacyDiagramRoleFromPayload(payload)
  );
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
    nextPayload.role = role;
  } else {
    delete nextMapia.role;
    delete nextPayload.role;
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
