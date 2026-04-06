import { prisma } from "@/src/server/db/client";

type ServerAuditEntityType =
  | "workspace"
  | "project"
  | "graph_version"
  | "node"
  | "edge";
type ServerAuditAction =
  | "created"
  | "updated"
  | "deleted"
  | "restored"
  | "imported"
  | "exported"
  | "denied";

type RecordServerAuditEventInput = {
  workspaceId?: string;
  projectId?: string;
  entityType: ServerAuditEntityType;
  entityId: string;
  action: ServerAuditAction;
  actorUserId?: string;
  actorIdentity?: string;
  payload?: Record<string, unknown>;
};

function shouldSkipAuditPersistence() {
  return process.env.NODE_ENV === "test";
}

function buildAuditFailureMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function recordServerAuditEvent(
  input: RecordServerAuditEventInput,
) {
  if (shouldSkipAuditPersistence()) {
    return;
  }

  try {
    await prisma.$executeRaw`
      INSERT INTO "audit_events" (
        "workspaceId",
        "projectId",
        "entityType",
        "entityId",
        "action",
        "actorUserId",
        "actorIdentity",
        "payload"
      ) VALUES (
        CAST(${input.workspaceId ?? null} AS uuid),
        CAST(${input.projectId ?? null} AS uuid),
        CAST(${input.entityType} AS "AuditEntityType"),
        ${input.entityId},
        CAST(${input.action} AS "AuditAction"),
        CAST(${input.actorUserId ?? null} AS uuid),
        ${input.actorIdentity ?? null},
        CAST(${JSON.stringify(input.payload ?? {})} AS jsonb)
      )
    `;
  } catch (error) {
    console.error(
      "[audit]",
      JSON.stringify({
        event: "audit_persist_failed",
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        error: buildAuditFailureMessage(error),
      }),
    );
  }
}
