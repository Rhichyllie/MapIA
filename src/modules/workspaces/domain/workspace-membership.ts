import { z } from "zod";
import { AppError } from "@/src/lib/app-error";

export const WorkspaceRoleSchema = z.enum([
  "owner",
  "admin",
  "member",
  "viewer",
]);

export const WorkspaceMembershipSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  role: WorkspaceRoleSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const WorkspaceMembershipWithUserSchema =
  WorkspaceMembershipSchema.extend({
    userEmail: z.string().email(),
    userDisplayName: z.string().max(120).nullable(),
    userActive: z.boolean(),
  });

export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;
export type WorkspaceMembership = z.infer<typeof WorkspaceMembershipSchema>;
export type WorkspaceMembershipWithUser = z.infer<
  typeof WorkspaceMembershipWithUserSchema
>;

const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

function throwLastOwnerProtectedError(input: {
  workspaceId: string;
  actorUserId: string;
  targetUserId: string;
  currentRole: WorkspaceRole;
  requestedRole: WorkspaceRole | null;
  ownerCount: number;
  reason:
    | "self_last_owner_downgrade"
    | "last_owner_downgrade"
    | "self_last_owner_removal"
    | "last_owner_removal";
}) {
  throw new AppError(
    input.requestedRole === null
      ? "Nao e permitido remover o ultimo owner do workspace."
      : "Nao e permitido rebaixar o ultimo owner do workspace.",
    {
      code: "WORKSPACE_LAST_OWNER_PROTECTED",
      status: 409,
      details: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        targetUserId: input.targetUserId,
        currentRole: input.currentRole,
        requestedRole: input.requestedRole,
        ownerCount: input.ownerCount,
        reason: input.reason,
      },
    },
  );
}

function assertWorkspaceOwnerMutationAllowed(input: {
  workspaceId: string;
  actorUserId: string;
  targetUserId: string;
  currentRole?: WorkspaceRole | null;
  nextRole: WorkspaceRole | null;
  ownerCount: number;
}) {
  if (input.currentRole !== "owner" || input.nextRole === "owner") {
    return;
  }

  if (input.ownerCount > 1) {
    return;
  }

  if (input.nextRole === null) {
    throwLastOwnerProtectedError({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId,
      currentRole: input.currentRole,
      requestedRole: null,
      ownerCount: input.ownerCount,
      reason:
        input.actorUserId === input.targetUserId
          ? "self_last_owner_removal"
          : "last_owner_removal",
    });
  }

  throwLastOwnerProtectedError({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    currentRole: input.currentRole,
    requestedRole: input.nextRole,
    ownerCount: input.ownerCount,
    reason:
      input.actorUserId === input.targetUserId
        ? "self_last_owner_downgrade"
        : "last_owner_downgrade",
  });
}

export function workspaceRoleSatisfies(
  actual: WorkspaceRole,
  required: WorkspaceRole,
) {
  return WORKSPACE_ROLE_RANK[actual] >= WORKSPACE_ROLE_RANK[required];
}

export function assertWorkspaceMembershipTransitionAllowed(input: {
  workspaceId: string;
  actorUserId: string;
  targetUserId: string;
  currentRole?: WorkspaceRole | null;
  nextRole: WorkspaceRole;
  ownerCount: number;
}) {
  assertWorkspaceOwnerMutationAllowed({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    currentRole: input.currentRole,
    nextRole: input.nextRole,
    ownerCount: input.ownerCount,
  });
}

export function assertWorkspaceMembershipRemovalAllowed(input: {
  workspaceId: string;
  actorUserId: string;
  targetUserId: string;
  currentRole?: WorkspaceRole | null;
  ownerCount: number;
}) {
  assertWorkspaceOwnerMutationAllowed({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    currentRole: input.currentRole,
    nextRole: null,
    ownerCount: input.ownerCount,
  });
}
