import type { EdgeKind } from "@/src/domain";
import type { FlowDiagramRole } from "./flow-diagram-roles";

export type ProcessNodeRole = FlowDiagramRole;

export type ProcessCriticality = "low" | "medium" | "high" | "critical";

export type ProcessOperationalContext = {
  owner?: string;
  area?: string;
  channel?: string;
  criticality?: ProcessCriticality;
  sla?: string;
  rule?: string;
  exception?: string;
};

export type ProcessMainFlowExpectation = {
  minIncoming: number;
  maxIncoming: number | null;
  minOutgoing: number;
  maxOutgoing: number | null;
  expectsNamedOutgoingPaths: boolean;
};

export type ProcessRoleSemantics = {
  role: ProcessNodeRole;
  allowsMainFlow: boolean;
  allowsSupportingReferences: boolean;
  preferredOutgoingEdgeKinds: EdgeKind[];
  mainFlow: ProcessMainFlowExpectation;
  isolatedSeverity: "warning" | "info";
  deadEndSeverity: "error" | "warning" | "info";
};

export type ProcessConnectionRestrictionCode =
  | "roles_missing"
  | "note_to_note"
  | "start_cannot_receive_main"
  | "end_cannot_emit_main"
  | "start_requires_forward_target"
  | "step_requires_forward_target"
  | "decision_requires_forward_target";

export type ProcessConnectionPolicy = {
  sourceRole?: ProcessNodeRole;
  targetRole?: ProcessNodeRole;
  allowedEdgeKinds: EdgeKind[];
  recommendedEdgeKind?: EdgeKind;
  restrictionCode?: ProcessConnectionRestrictionCode;
};

export const PROCESS_CRITICALITY_LEVELS = [
  "low",
  "medium",
  "high",
  "critical",
] as const satisfies readonly ProcessCriticality[];

export const PROCESS_ROLE_SEMANTICS: Record<
  ProcessNodeRole,
  ProcessRoleSemantics
> = {
  "flow-start": {
    role: "flow-start",
    allowsMainFlow: true,
    allowsSupportingReferences: true,
    preferredOutgoingEdgeKinds: ["flows-to"],
    mainFlow: {
      minIncoming: 0,
      maxIncoming: 0,
      minOutgoing: 1,
      maxOutgoing: 1,
      expectsNamedOutgoingPaths: false,
    },
    isolatedSeverity: "warning",
    deadEndSeverity: "error",
  },
  "flow-step": {
    role: "flow-step",
    allowsMainFlow: true,
    allowsSupportingReferences: true,
    preferredOutgoingEdgeKinds: ["flows-to"],
    mainFlow: {
      minIncoming: 1,
      maxIncoming: 1,
      minOutgoing: 1,
      maxOutgoing: 1,
      expectsNamedOutgoingPaths: false,
    },
    isolatedSeverity: "warning",
    deadEndSeverity: "warning",
  },
  "flow-decision": {
    role: "flow-decision",
    allowsMainFlow: true,
    allowsSupportingReferences: true,
    preferredOutgoingEdgeKinds: ["depends-on", "flows-to"],
    mainFlow: {
      minIncoming: 1,
      maxIncoming: 1,
      minOutgoing: 2,
      maxOutgoing: null,
      expectsNamedOutgoingPaths: true,
    },
    isolatedSeverity: "warning",
    deadEndSeverity: "warning",
  },
  "flow-end": {
    role: "flow-end",
    allowsMainFlow: true,
    allowsSupportingReferences: true,
    preferredOutgoingEdgeKinds: [],
    mainFlow: {
      minIncoming: 1,
      maxIncoming: null,
      minOutgoing: 0,
      maxOutgoing: 0,
      expectsNamedOutgoingPaths: false,
    },
    isolatedSeverity: "warning",
    deadEndSeverity: "info",
  },
  "flow-note": {
    role: "flow-note",
    allowsMainFlow: false,
    allowsSupportingReferences: true,
    preferredOutgoingEdgeKinds: ["references"],
    mainFlow: {
      minIncoming: 0,
      maxIncoming: 0,
      minOutgoing: 0,
      maxOutgoing: 0,
      expectsNamedOutgoingPaths: false,
    },
    isolatedSeverity: "info",
    deadEndSeverity: "info",
  },
};

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function trimOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeCriticality(value: unknown): ProcessCriticality | undefined {
  return PROCESS_CRITICALITY_LEVELS.find((level) => level === value);
}

export function isProcessNodeRole(role: string): role is ProcessNodeRole {
  return role in PROCESS_ROLE_SEMANTICS;
}

export function isProcessMainEdgeKind(kind: EdgeKind) {
  return kind === "flows-to" || kind === "depends-on";
}

export function isProcessSupportingEdgeKind(kind: EdgeKind) {
  return kind === "references";
}

export function getProcessRoleSemantics(role: ProcessNodeRole) {
  return PROCESS_ROLE_SEMANTICS[role];
}

export function readProcessOperationalContextFromPayload(
  payload: Record<string, unknown> | undefined,
): ProcessOperationalContext {
  const mapia = readRecord(payload?.__mapia);
  const process = readRecord(mapia?.process);

  return {
    owner: trimOptionalString(process?.owner),
    area: trimOptionalString(process?.area),
    channel: trimOptionalString(process?.channel),
    criticality: normalizeCriticality(process?.criticality),
    sla: trimOptionalString(process?.sla),
    rule: trimOptionalString(process?.rule),
    exception: trimOptionalString(process?.exception),
  };
}

export function hasProcessOperationalContext(
  context: ProcessOperationalContext,
) {
  return Boolean(
    context.owner ||
      context.area ||
      context.channel ||
      context.criticality ||
      context.sla ||
      context.rule ||
      context.exception,
  );
}

export function writeProcessOperationalContextToPayload(
  payload: Record<string, unknown>,
  context: ProcessOperationalContext,
) {
  const nextPayload: Record<string, unknown> = {
    ...payload,
  };
  const nextMapia = {
    ...(readRecord(nextPayload.__mapia) ?? {}),
  } as Record<string, unknown>;
  const normalizedContext: ProcessOperationalContext = {
    owner: trimOptionalString(context.owner),
    area: trimOptionalString(context.area),
    channel: trimOptionalString(context.channel),
    criticality: normalizeCriticality(context.criticality),
    sla: trimOptionalString(context.sla),
    rule: trimOptionalString(context.rule),
    exception: trimOptionalString(context.exception),
  };

  if (hasProcessOperationalContext(normalizedContext)) {
    nextMapia.process = {
      ...(normalizedContext.owner ? { owner: normalizedContext.owner } : {}),
      ...(normalizedContext.area ? { area: normalizedContext.area } : {}),
      ...(normalizedContext.channel ? { channel: normalizedContext.channel } : {}),
      ...(normalizedContext.criticality
        ? { criticality: normalizedContext.criticality }
        : {}),
      ...(normalizedContext.sla ? { sla: normalizedContext.sla } : {}),
      ...(normalizedContext.rule ? { rule: normalizedContext.rule } : {}),
      ...(normalizedContext.exception
        ? { exception: normalizedContext.exception }
        : {}),
    };
  } else {
    delete nextMapia.process;
  }

  if (Object.keys(nextMapia).length > 0) {
    nextPayload.__mapia = nextMapia;
  } else {
    delete nextPayload.__mapia;
  }

  return nextPayload;
}

export function resolveProcessConnectionPolicy(input: {
  sourceRole?: ProcessNodeRole;
  targetRole?: ProcessNodeRole;
}): ProcessConnectionPolicy {
  const { sourceRole, targetRole } = input;

  if (!sourceRole || !targetRole) {
    return {
      sourceRole,
      targetRole,
      allowedEdgeKinds: [],
      restrictionCode: "roles_missing",
    };
  }

  if (sourceRole === "flow-note" || targetRole === "flow-note") {
    if (sourceRole === "flow-note" && targetRole === "flow-note") {
      return {
        sourceRole,
        targetRole,
        allowedEdgeKinds: [],
        restrictionCode: "note_to_note",
      };
    }

    return {
      sourceRole,
      targetRole,
      allowedEdgeKinds: ["references"],
      recommendedEdgeKind: "references",
    };
  }

  if (targetRole === "flow-start") {
    return {
      sourceRole,
      targetRole,
      allowedEdgeKinds: [],
      restrictionCode: "start_cannot_receive_main",
    };
  }

  if (sourceRole === "flow-end") {
    return {
      sourceRole,
      targetRole,
      allowedEdgeKinds: [],
      restrictionCode: "end_cannot_emit_main",
    };
  }

  if (sourceRole === "flow-start") {
    if (
      targetRole === "flow-step" ||
      targetRole === "flow-decision" ||
      targetRole === "flow-end"
    ) {
      return {
        sourceRole,
        targetRole,
        allowedEdgeKinds: ["flows-to"],
        recommendedEdgeKind: "flows-to",
      };
    }

    return {
      sourceRole,
      targetRole,
      allowedEdgeKinds: [],
      restrictionCode: "start_requires_forward_target",
    };
  }

  if (sourceRole === "flow-step") {
    if (
      targetRole === "flow-step" ||
      targetRole === "flow-decision" ||
      targetRole === "flow-end"
    ) {
      return {
        sourceRole,
        targetRole,
        allowedEdgeKinds: ["flows-to"],
        recommendedEdgeKind: "flows-to",
      };
    }

    return {
      sourceRole,
      targetRole,
      allowedEdgeKinds: [],
      restrictionCode: "step_requires_forward_target",
    };
  }

  if (sourceRole === "flow-decision") {
    if (
      targetRole === "flow-step" ||
      targetRole === "flow-decision" ||
      targetRole === "flow-end"
    ) {
      return {
        sourceRole,
        targetRole,
        allowedEdgeKinds: ["depends-on", "flows-to"],
        recommendedEdgeKind: "depends-on",
      };
    }

    return {
      sourceRole,
      targetRole,
      allowedEdgeKinds: [],
      restrictionCode: "decision_requires_forward_target",
    };
  }

  return {
    sourceRole,
    targetRole,
    allowedEdgeKinds: ["flows-to"],
    recommendedEdgeKind: "flows-to",
  };
}
