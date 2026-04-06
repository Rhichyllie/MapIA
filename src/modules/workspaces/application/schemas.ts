import { z } from "zod";
import { WorkspaceRoleSchema } from "@/src/modules/workspaces/domain";

export const CreateWorkspaceInputSchema = z.object({
  actorUserId: z.string().uuid(),
  legacyOwnerIdentity: z.string().email(),
  name: z.string().min(1).max(120),
  slug: z.string().min(2).max(80).optional(),
});

export const ListWorkspacesForActorInputSchema = z.object({
  actorUserId: z.string().uuid(),
});

export const GetWorkspaceAccessInputSchema = z.object({
  actorUserId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  minimumRole: WorkspaceRoleSchema.default("viewer"),
});

export const ListWorkspaceMembershipsInputSchema = z.object({
  actorUserId: z.string().uuid(),
  workspaceId: z.string().uuid(),
});

export const UpsertWorkspaceMembershipInputSchema = z.object({
  actorUserId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  memberEmail: z.string().email(),
  role: WorkspaceRoleSchema,
  memberDisplayName: z.string().min(1).max(120).optional(),
});

export const GetOrCreatePrimaryWorkspaceForActorInputSchema = z.object({
  actorUserId: z.string().uuid(),
  legacyOwnerIdentity: z.string().email(),
});

export const RemoveWorkspaceMembershipInputSchema = z.object({
  actorUserId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  memberUserId: z.string().uuid(),
});

export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceInputSchema>;
export type ListWorkspacesForActorInput = z.infer<
  typeof ListWorkspacesForActorInputSchema
>;
export type GetWorkspaceAccessInput = z.infer<
  typeof GetWorkspaceAccessInputSchema
>;
export type ListWorkspaceMembershipsInput = z.infer<
  typeof ListWorkspaceMembershipsInputSchema
>;
export type UpsertWorkspaceMembershipInput = z.infer<
  typeof UpsertWorkspaceMembershipInputSchema
>;
export type GetOrCreatePrimaryWorkspaceForActorInput = z.infer<
  typeof GetOrCreatePrimaryWorkspaceForActorInputSchema
>;
export type RemoveWorkspaceMembershipInput = z.infer<
  typeof RemoveWorkspaceMembershipInputSchema
>;
