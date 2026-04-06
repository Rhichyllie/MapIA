import { z } from "zod";

export const AuditEntitySchema = z.enum([
  "workspace",
  "project",
  "graph-version",
  "node",
  "edge",
]);

export const AuditActionSchema = z.enum([
  "created",
  "updated",
  "deleted",
  "restored",
  "imported",
  "exported",
  "denied",
]);

export const AuditEventSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  entityType: AuditEntitySchema,
  entityId: z.string().min(1).max(255),
  action: AuditActionSchema,
  actorUserId: z.string().uuid().optional(),
  actorIdentity: z.string().min(1).max(255).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.date(),
});

export type AuditEntity = z.infer<typeof AuditEntitySchema>;
export type AuditAction = z.infer<typeof AuditActionSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
