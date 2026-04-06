import { z } from "zod";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import {
  requireAuthenticatedApiRequest,
  requireWorkspaceAccessForApi,
} from "@/src/server/app/api-route-guards";
import { createServerUseCases } from "@/src/server/app/container";
import { recordServerAuditEvent } from "@/src/server/audit/server-audit";

const ParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  memberUserId: z.string().uuid(),
});

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ workspaceId: string; memberUserId: string }> },
) {
  try {
    const auth = await requireAuthenticatedApiRequest();
    const params = ParamsSchema.parse(await context.params);
    const useCases = createServerUseCases();
    const access = await requireWorkspaceAccessForApi({
      route: "DELETE /api/workspaces/[workspaceId]/memberships/[memberUserId]",
      workspaceId: params.workspaceId,
      minimumRole: "owner",
      auth,
      useCases,
    });

    const result = await useCases.workspaces.removeWorkspaceMembership.execute({
      actorUserId: auth.userId,
      workspaceId: params.workspaceId,
      memberUserId: params.memberUserId,
    });

    await recordServerAuditEvent({
      workspaceId: params.workspaceId,
      entityType: "workspace",
      entityId: params.workspaceId,
      action: "updated",
      actorUserId: auth.userId,
      actorIdentity: auth.identity,
      payload: {
        route:
          "DELETE /api/workspaces/[workspaceId]/memberships/[memberUserId]",
        actorRole: access.membership.role,
        changeKind: "revoked",
        selfTarget: result.selfTarget,
        removedUserId: result.removedMembership.userId,
        removedUserEmail: result.removedUser?.email ?? null,
        removedRole: result.removedMembership.role,
      },
    });

    return apiSuccessResponse({
      workspace: result.workspace,
      removedMembership: result.removedMembership,
      removedMember: result.removedUser
        ? {
            id: result.removedUser.id,
            email: result.removedUser.email,
            displayName: result.removedUser.displayName ?? null,
            active: result.removedUser.active,
          }
        : null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
