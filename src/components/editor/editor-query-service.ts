import type { GraphSnapshot } from "@/src/domain";
import { getEditorBaseMessage } from "./editor-i18n";

export type EditorApiErrorPayload = {
  error?: string;
  code?: string;
  message?: string;
  details?: string;
  allowedEdgeKinds?: string[];
  recommendedEdgeKind?: string;
  violations?: unknown[];
  repairPlan?: unknown;
  currentRevision?: number;
  expectedRevision?: number;
  overrideAllowed?: boolean;
  requireOverrideReason?: boolean;
};

export class EditorQueryError extends Error {
  readonly status: number;
  readonly code: string;
  readonly payload: EditorApiErrorPayload | null;

  constructor(
    message: string,
    input: {
      status: number;
      code: string;
      payload: EditorApiErrorPayload | null;
    },
  ) {
    super(message);
    this.name = "EditorQueryError";
    this.status = input.status;
    this.code = input.code;
    this.payload = input.payload;
  }
}

export type EditorSnapshotVersionSummary = {
  id: string;
  projectId: string;
  label?: string;
  origin: "manual";
  createdAt: string;
};

export type EditorSnapshotVersionDetail = EditorSnapshotVersionSummary & {
  snapshot: GraphSnapshot;
};

export type EditorSnapshotVersionDiff = {
  hasChanges: boolean;
  nodesAdded: string[];
  nodesRemoved: string[];
  nodesChanged: string[];
  edgesAdded: string[];
  edgesRemoved: string[];
  edgesChanged: string[];
  viewportChanged: boolean;
  summary: {
    added: number;
    removed: number;
    changed: number;
  };
};

export type EditorWorkingSnapshotPayload = {
  id: string;
  projectId: string;
  versionNumber: number;
  revision: number;
  label?: string;
  snapshot: GraphSnapshot;
  createdByIdentity?: string;
  createdAt: string;
};

export type EditorPrismaSchemaImportSummary = {
  modelsCount: number;
  relationsCount: number;
  scalarFieldsCount: number;
};

export type SemanticPolicyPayload = {
  id: string;
  projectId: string;
  diagramType?: string;
  strictEnabled: boolean;
  enforceOnServer: boolean;
  allowTechOverride: boolean;
  requireOverrideReason: boolean;
  customRulesJson?: Record<string, unknown>;
  version: number;
  updatedByIdentity?: string;
  updatedAt: string;
  createdAt: string;
};

export type SemanticAuditPayload = {
  policy: SemanticPolicyPayload;
  issues: Array<{
    id: string;
    code: string;
    severity: "error" | "warning" | "info" | "suggestion";
    message: string;
    explanation?: string;
    details?: string;
    suggestedFixes?: Array<{
      id: string;
      label: string;
      description?: string;
      safety: "safe" | "manual";
      commands: unknown[];
    }>;
    targetType: "graph" | "node" | "edge";
    targetId?: string;
  }>;
  counters: {
    total: number;
    nodes: number;
    edges: number;
    graph: number;
  };
  bySeverity: {
    error: number;
    warning: number;
    info: number;
    suggestion: number;
  };
  snapshotRevision?: number;
};

export type ErdExportPreviewPayload = {
  export: {
    format: "json";
    entities: Array<{
      id: string;
      name: string;
      tableName?: string;
      description?: string;
      fields: Array<{
        id: string;
        name: string;
        type: string;
        flags: string[];
        default?: string;
        description?: string;
        references?: {
          entityId: string;
          fieldId?: string;
          relationEdgeId?: string;
        };
      }>;
    }>;
    relations: Array<{
      id: string;
      sourceEntityId: string;
      targetEntityId: string;
      name?: string;
      description?: string;
      payload: Record<string, unknown>;
    }>;
  };
  diagnostics: SemanticAuditPayload["issues"];
  bySeverity: SemanticAuditPayload["bySeverity"];
  counters: SemanticAuditPayload["counters"];
  revision: number;
  format: "json";
};

export type EditorSemanticMode = "operational" | "technical";

export type EditorSemanticOverrideInput = {
  semanticMode?: EditorSemanticMode;
  allowSemanticOverride?: boolean;
  overrideReason?: string;
};

function readApiErrorMessage(
  payload: EditorApiErrorPayload | null | undefined,
  fallback: string,
) {
  return payload?.message ?? fallback;
}

async function parseResponseJson(response: Response) {
  try {
    return (await response.json()) as {
      data?: Record<string, unknown>;
    } & EditorApiErrorPayload;
  } catch {
    return null;
  }
}

function throwQueryError(input: {
  response: Response;
  payload: EditorApiErrorPayload | null;
  fallbackMessage: string;
}): never {
  const code =
    input.payload?.code ??
    input.payload?.error ??
    `HTTP_${input.response.status}`;

  throw new EditorQueryError(
    readApiErrorMessage(input.payload, input.fallbackMessage),
    {
      status: input.response.status,
      code,
      payload: input.payload,
    },
  );
}

function buildRevisionAndSemanticBody(input: {
  expectedRevision?: number;
  semanticMode?: EditorSemanticMode;
  allowSemanticOverride?: boolean;
  overrideReason?: string;
}) {
  return {
    ...(input.expectedRevision !== undefined
      ? { expectedRevision: input.expectedRevision }
      : {}),
    ...(input.semanticMode ? { semanticMode: input.semanticMode } : {}),
    ...(input.allowSemanticOverride !== undefined
      ? { allowSemanticOverride: input.allowSemanticOverride }
      : {}),
    ...(input.overrideReason ? { overrideReason: input.overrideReason } : {}),
  };
}

export async function loadWorkingSnapshotForEditor(projectId: string) {
  const response = await fetch(`/api/projects/${projectId}/editor-snapshot`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const payload = (await parseResponseJson(response)) as {
    data?: {
      workingSnapshot?: EditorWorkingSnapshotPayload | null;
    };
  } & EditorApiErrorPayload;

  if (!response.ok) {
    throwQueryError({
      response,
      payload,
      fallbackMessage: getEditorBaseMessage("shell.errors.loadSnapshot"),
    });
  }

  return payload.data?.workingSnapshot ?? null;
}

export async function saveWorkingSnapshotForEditor(input: {
  projectId: string;
  snapshot: GraphSnapshot;
  label?: string;
  expectedRevision?: number;
  semanticMode?: EditorSemanticMode;
  allowSemanticOverride?: boolean;
  overrideReason?: string;
  signal?: AbortSignal;
}) {
  const response = await fetch(`/api/projects/${input.projectId}/working-snapshot`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: input.label,
      snapshot: input.snapshot,
      ...buildRevisionAndSemanticBody(input),
    }),
    signal: input.signal,
  });

  const payload = (await parseResponseJson(response)) as {
    data?: {
      workingSnapshot?: EditorWorkingSnapshotPayload;
      newRevision?: number;
    };
  } & EditorApiErrorPayload;

  if (!response.ok || !payload.data?.workingSnapshot) {
    throwQueryError({
      response,
      payload,
      fallbackMessage: getEditorBaseMessage("shell.errors.saveSnapshot"),
    });
  }

  return {
    workingSnapshot: payload.data.workingSnapshot,
    newRevision: payload.data.newRevision ?? payload.data.workingSnapshot.revision,
  };
}

export async function createSnapshotVersionForEditor(input: {
  projectId: string;
  label?: string;
  origin?: "manual";
  signal?: AbortSignal;
}) {
  const response = await fetch(`/api/projects/${input.projectId}/snapshot-versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: input.label,
      origin: input.origin,
    }),
    signal: input.signal,
  });

  const payload = (await parseResponseJson(response)) as {
    data?: {
      message?: string;
      snapshotVersion?: EditorSnapshotVersionDetail;
    };
  } & EditorApiErrorPayload;

  if (!response.ok || !payload.data?.snapshotVersion?.id) {
    throwQueryError({
      response,
      payload,
      fallbackMessage: getEditorBaseMessage("shell.versions.errors.create"),
    });
  }

  return {
    message: payload.data.message ?? getEditorBaseMessage("shell.versions.createSuccess"),
    snapshotVersion: payload.data.snapshotVersion,
  };
}

export async function listSnapshotVersionsForEditor(projectId: string) {
  const response = await fetch(`/api/projects/${projectId}/snapshot-versions`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const payload = (await parseResponseJson(response)) as {
    data?: {
      snapshotVersions?: EditorSnapshotVersionSummary[];
    };
  } & EditorApiErrorPayload;

  if (!response.ok || !Array.isArray(payload.data?.snapshotVersions)) {
    throwQueryError({
      response,
      payload,
      fallbackMessage: getEditorBaseMessage("shell.versions.errors.load"),
    });
  }

  return payload.data.snapshotVersions;
}

export async function loadSnapshotVersionDetailForEditor(
  projectId: string,
  versionId: string,
) {
  const response = await fetch(
    `/api/projects/${projectId}/snapshot-versions/${versionId}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );

  const payload = (await parseResponseJson(response)) as {
    data?: {
      snapshotVersion?: EditorSnapshotVersionDetail;
    };
  } & EditorApiErrorPayload;

  if (!response.ok || !payload.data?.snapshotVersion?.snapshot) {
    throwQueryError({
      response,
      payload,
      fallbackMessage: getEditorBaseMessage("shell.versions.errors.load"),
    });
  }

  return payload.data.snapshotVersion;
}

export async function loadSnapshotVersionDiffForEditor(
  projectId: string,
  versionId: string,
) {
  const response = await fetch(
    `/api/projects/${projectId}/snapshot-versions/${versionId}/diff`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );

  const payload = (await parseResponseJson(response)) as {
    data?: {
      diff?: EditorSnapshotVersionDiff;
    };
  } & EditorApiErrorPayload;

  if (!response.ok || !payload.data?.diff) {
    throwQueryError({
      response,
      payload,
      fallbackMessage: getEditorBaseMessage("shell.versions.errors.compare"),
    });
  }

  return payload.data.diff;
}

export async function restoreSnapshotVersionForEditor(input: {
  projectId: string;
  versionId: string;
  expectedRevision?: number;
  semanticMode?: EditorSemanticMode;
  allowSemanticOverride?: boolean;
  overrideReason?: string;
  signal?: AbortSignal;
}) {
  const response = await fetch(
    `/api/projects/${input.projectId}/snapshot-versions/${input.versionId}/restore`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...buildRevisionAndSemanticBody(input),
      }),
      signal: input.signal,
    },
  );

  const payload = (await parseResponseJson(response)) as {
    data?: {
      message?: string;
      restoredFromVersionId?: string;
      workingSnapshot?: EditorWorkingSnapshotPayload;
      newRevision?: number;
    };
  } & EditorApiErrorPayload;

  if (
    !response.ok ||
    !payload.data?.workingSnapshot?.snapshot ||
    !payload.data.restoredFromVersionId
  ) {
    throwQueryError({
      response,
      payload,
      fallbackMessage: getEditorBaseMessage("shell.versions.errors.restore"),
    });
  }

  return {
    message:
      payload.data.message ?? getEditorBaseMessage("shell.versions.restoreCompleted"),
    restoredFromVersionId: payload.data.restoredFromVersionId,
    workingSnapshot: payload.data.workingSnapshot,
    newRevision: payload.data.newRevision ?? payload.data.workingSnapshot.revision,
  };
}

export async function importPrismaSchemaForEditor(input: {
  projectId: string;
  schema: string;
  expectedRevision?: number;
  semanticMode?: EditorSemanticMode;
  allowSemanticOverride?: boolean;
  overrideReason?: string;
  signal?: AbortSignal;
}) {
  const response = await fetch(
    `/api/projects/${input.projectId}/imports/prisma-schema`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schema: input.schema,
        ...buildRevisionAndSemanticBody(input),
      }),
      signal: input.signal,
    },
  );

  const payload = (await parseResponseJson(response)) as {
    data?: {
      message?: string;
      importSummary?: EditorPrismaSchemaImportSummary;
      workingSnapshot?: EditorWorkingSnapshotPayload;
      newRevision?: number;
    };
  } & EditorApiErrorPayload;

  if (!response.ok || !payload.data?.workingSnapshot?.snapshot) {
    throwQueryError({
      response,
      payload,
      fallbackMessage: getEditorBaseMessage("shell.prisma.errors.import"),
    });
  }

  return {
    message: payload.data.message ?? getEditorBaseMessage("shell.prisma.feedbackSuccess"),
    importSummary: payload.data.importSummary,
    workingSnapshot: payload.data.workingSnapshot,
    newRevision: payload.data.newRevision ?? payload.data.workingSnapshot.revision,
  };
}

export async function loadSemanticPolicyForEditor(projectId: string) {
  const response = await fetch(`/api/projects/${projectId}/semantic/policy`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const payload = (await parseResponseJson(response)) as {
    data?: {
      policy?: SemanticPolicyPayload;
    };
  } & EditorApiErrorPayload;

  if (!response.ok || !payload.data?.policy) {
    throwQueryError({
      response,
      payload,
      fallbackMessage: getEditorBaseMessage("shell.errors.loadSemanticPolicy"),
    });
  }

  return payload.data.policy;
}

export async function updateSemanticPolicyForEditor(input: {
  projectId: string;
  patch: Partial<
    Pick<
      SemanticPolicyPayload,
      | "diagramType"
      | "strictEnabled"
      | "enforceOnServer"
      | "allowTechOverride"
      | "requireOverrideReason"
      | "customRulesJson"
    >
  >;
}) {
  const response = await fetch(`/api/projects/${input.projectId}/semantic/policy`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.patch),
  });

  const payload = (await parseResponseJson(response)) as {
    data?: {
      policy?: SemanticPolicyPayload;
    };
  } & EditorApiErrorPayload;

  if (!response.ok || !payload.data?.policy) {
    throwQueryError({
      response,
      payload,
      fallbackMessage: getEditorBaseMessage("shell.errors.updateSemanticPolicy"),
    });
  }

  return payload.data.policy;
}

export async function validateSemanticDraftForEditor(input: {
  projectId: string;
  snapshot: GraphSnapshot;
  mode?: EditorSemanticMode;
}) {
  const response = await fetch(`/api/projects/${input.projectId}/semantic/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      snapshot: input.snapshot,
      ...(input.mode ? { mode: input.mode } : {}),
    }),
  });

  const payload = (await parseResponseJson(response)) as {
    data?: {
      validation?: SemanticAuditPayload;
    };
  } & EditorApiErrorPayload;

  if (!response.ok || !payload.data?.validation) {
    throwQueryError({
      response,
      payload,
      fallbackMessage: getEditorBaseMessage("shell.errors.validateSemanticDraft"),
    });
  }

  return payload.data.validation;
}

export async function runSemanticAuditForEditor(input: {
  projectId: string;
  mode?: EditorSemanticMode;
}) {
  const response = await fetch(`/api/projects/${input.projectId}/semantic/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(input.mode ? { mode: input.mode } : {}),
    }),
  });

  const payload = (await parseResponseJson(response)) as {
    data?: {
      audit?: SemanticAuditPayload;
    };
  } & EditorApiErrorPayload;

  if (!response.ok || !payload.data?.audit) {
    throwQueryError({
      response,
      payload,
      fallbackMessage: getEditorBaseMessage("shell.errors.serverSemanticAudit"),
    });
  }

  return payload.data.audit;
}

export async function exportErdPreviewForEditor(input: {
  projectId: string;
  expectedRevision?: number;
  format?: "json";
}) {
  const response = await fetch(
    `/api/projects/${input.projectId}/erd/export-preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: input.format ?? "json",
        ...(input.expectedRevision !== undefined
          ? { expectedRevision: input.expectedRevision }
          : {}),
      }),
    },
  );

  const payload = (await parseResponseJson(response)) as {
    data?: ErdExportPreviewPayload;
  } & EditorApiErrorPayload;

  if (!response.ok || !payload.data?.export) {
    throwQueryError({
      response,
      payload,
      fallbackMessage: getEditorBaseMessage("shell.errors.erdExportPreview"),
    });
  }

  return payload.data;
}

export async function createEdgeForEditor(input: {
  projectId: string;
  edge: {
    id?: string;
    sourceNodeId: string;
    targetNodeId: string;
    kind: string;
    label?: string;
    data?: Record<string, unknown>;
  };
  expectedRevision?: number;
  semanticMode?: EditorSemanticMode;
  allowSemanticOverride?: boolean;
  overrideReason?: string;
}) {
  const response = await fetch(`/api/projects/${input.projectId}/edges`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      edge: {
        ...input.edge,
        data: input.edge.data ?? {},
      },
      ...buildRevisionAndSemanticBody(input),
    }),
  });

  const payload = (await parseResponseJson(response)) as {
    data?: {
      workingSnapshot?: EditorWorkingSnapshotPayload;
      newRevision?: number;
    };
  } & EditorApiErrorPayload;

  if (!response.ok || !payload.data?.workingSnapshot?.snapshot) {
    throwQueryError({
      response,
      payload,
      fallbackMessage: getEditorBaseMessage("shell.errors.createRelationOnServer"),
    });
  }

  return {
    workingSnapshot: payload.data.workingSnapshot,
    newRevision: payload.data.newRevision ?? payload.data.workingSnapshot.revision,
  };
}

export async function updateEdgeForEditor(input: {
  projectId: string;
  edgeId: string;
  patch: {
    label?: string;
    kind?: string;
    data?: Record<string, unknown>;
  };
  expectedRevision?: number;
  semanticMode?: EditorSemanticMode;
  allowSemanticOverride?: boolean;
  overrideReason?: string;
}) {
  const response = await fetch(
    `/api/projects/${input.projectId}/edges/${input.edgeId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patch: input.patch,
        ...buildRevisionAndSemanticBody(input),
      }),
    },
  );

  const payload = (await parseResponseJson(response)) as {
    data?: {
      workingSnapshot?: EditorWorkingSnapshotPayload;
      newRevision?: number;
    };
  } & EditorApiErrorPayload;

  if (!response.ok || !payload.data?.workingSnapshot?.snapshot) {
    throwQueryError({
      response,
      payload,
      fallbackMessage: getEditorBaseMessage("shell.errors.updateRelationOnServer"),
    });
  }

  return {
    workingSnapshot: payload.data.workingSnapshot,
    newRevision: payload.data.newRevision ?? payload.data.workingSnapshot.revision,
  };
}

export async function updateNodeForEditor(input: {
  projectId: string;
  nodeId: string;
  patch: {
    label?: string;
    kind?: string;
    data?: Record<string, unknown>;
  };
  expectedRevision?: number;
  semanticMode?: EditorSemanticMode;
  allowSemanticOverride?: boolean;
  overrideReason?: string;
}) {
  const response = await fetch(
    `/api/projects/${input.projectId}/nodes/${input.nodeId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patch: input.patch,
        ...buildRevisionAndSemanticBody(input),
      }),
    },
  );

  const payload = (await parseResponseJson(response)) as {
    data?: {
      workingSnapshot?: EditorWorkingSnapshotPayload;
      newRevision?: number;
    };
  } & EditorApiErrorPayload;

  if (!response.ok || !payload.data?.workingSnapshot?.snapshot) {
    throwQueryError({
      response,
      payload,
      fallbackMessage: getEditorBaseMessage("shell.errors.updateNodeOnServer"),
    });
  }

  return {
    workingSnapshot: payload.data.workingSnapshot,
    newRevision: payload.data.newRevision ?? payload.data.workingSnapshot.revision,
  };
}
