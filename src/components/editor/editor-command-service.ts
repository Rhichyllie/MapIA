import { z } from "zod";
import type { GraphSnapshot } from "@/src/domain";
import {
  applyEditorCommandToSnapshot,
  applyEditorCommandsToSnapshot,
  EditorCommandSchema,
  type EditorCommand,
} from "@/src/modules/editor/application";

export type EditorSemanticMode = "operational" | "technical";

export type EditorRemoteCommandOptions = {
  expectedRevision?: number;
  semanticMode?: EditorSemanticMode;
  allowSemanticOverride?: boolean;
  overrideReason?: string;
};

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

export class EditorRemoteError extends Error {
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
    this.name = "EditorRemoteError";
    this.status = input.status;
    this.code = input.code;
    this.payload = input.payload;
  }
}

export type EditorRemoteCommandResult = {
  snapshot: GraphSnapshot;
  newRevision: number;
};

function readApiErrorMessage(
  payload: EditorApiErrorPayload | null | undefined,
  fallback: string,
) {
  return payload?.message ?? fallback;
}

function buildRequestBody(input: {
  command?: EditorCommand;
  commands?: EditorCommand[];
  options?: EditorRemoteCommandOptions;
}) {
  return {
    ...(input.command ? { command: EditorCommandSchema.parse(input.command) } : {}),
    ...(input.commands
      ? { commands: z.array(EditorCommandSchema).parse(input.commands) }
      : {}),
    ...(input.options?.expectedRevision !== undefined
      ? { expectedRevision: input.options.expectedRevision }
      : {}),
    ...(input.options?.semanticMode
      ? { semanticMode: input.options.semanticMode }
      : {}),
    ...(input.options?.allowSemanticOverride !== undefined
      ? { allowSemanticOverride: input.options.allowSemanticOverride }
      : {}),
    ...(input.options?.overrideReason
      ? { overrideReason: input.options.overrideReason }
      : {}),
  };
}

function buildRemoteError(input: {
  response: Response;
  payload: EditorApiErrorPayload | null;
  fallbackMessage: string;
}) {
  const code =
    input.payload?.code ??
    input.payload?.error ??
    `HTTP_${input.response.status}`;

  return new EditorRemoteError(
    readApiErrorMessage(input.payload, input.fallbackMessage),
    {
      status: input.response.status,
      code,
      payload: input.payload,
    },
  );
}

export function applyEditorCommandLocally(
  snapshot: GraphSnapshot,
  projectId: string,
  command: EditorCommand,
): GraphSnapshot {
  const parsedCommand = EditorCommandSchema.parse(command);
  return applyEditorCommandToSnapshot(snapshot, projectId, parsedCommand);
}

export function applyEditorCommandsLocally(
  snapshot: GraphSnapshot,
  projectId: string,
  commands: EditorCommand[],
): GraphSnapshot {
  const parsedCommands = z.array(EditorCommandSchema).parse(commands);
  return applyEditorCommandsToSnapshot(snapshot, projectId, parsedCommands);
}

export async function applyEditorCommandRemotely(
  projectId: string,
  command: EditorCommand,
  options?: EditorRemoteCommandOptions,
): Promise<EditorRemoteCommandResult> {
  const response = await fetch(`/api/projects/${projectId}/editor-commands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      buildRequestBody({
        command,
        options,
      }),
    ),
  });

  const payload = (await response.json()) as {
    data?: {
      workingSnapshot?: {
        snapshot?: GraphSnapshot;
        revision?: number;
      };
      newRevision?: number;
    };
  } & EditorApiErrorPayload;

  const snapshot = payload.data?.workingSnapshot?.snapshot;
  const newRevision =
    payload.data?.newRevision ?? payload.data?.workingSnapshot?.revision;

  if (!response.ok || !snapshot || typeof newRevision !== "number") {
    throw buildRemoteError({
      response,
      payload,
      fallbackMessage: "Falha ao aplicar comando no backend.",
    });
  }

  return {
    snapshot,
    newRevision,
  };
}

export async function applyEditorCommandsRemotely(
  projectId: string,
  commands: EditorCommand[],
  options?: EditorRemoteCommandOptions,
): Promise<EditorRemoteCommandResult> {
  const response = await fetch(`/api/projects/${projectId}/editor-commands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      buildRequestBody({
        commands,
        options,
      }),
    ),
  });

  const payload = (await response.json()) as {
    data?: {
      workingSnapshot?: {
        snapshot?: GraphSnapshot;
        revision?: number;
      };
      newRevision?: number;
    };
  } & EditorApiErrorPayload;

  const snapshot = payload.data?.workingSnapshot?.snapshot;
  const newRevision =
    payload.data?.newRevision ?? payload.data?.workingSnapshot?.revision;

  if (!response.ok || !snapshot || typeof newRevision !== "number") {
    throw buildRemoteError({
      response,
      payload,
      fallbackMessage: "Falha ao aplicar comandos no backend.",
    });
  }

  return {
    snapshot,
    newRevision,
  };
}
