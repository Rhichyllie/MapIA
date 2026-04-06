import { z } from "zod";
import { WorkspaceRoleSchema } from "@/src/modules/workspaces/domain";
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
});

const UpsertWorkspaceMembershipBodySchema = z.object({
  memberEmail: z.string().email(),
  role: WorkspaceRoleSchema,
  memberDisplayName: z.string().trim().min(1).max(120).optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const auth = await requireAuthenticatedApiRequest();
    const params = ParamsSchema.parse(await context.params);
    const useCases = createServerUseCases();

    await requireWorkspaceAccessForApi({
      route: "GET /api/workspaces/[workspaceId]/memberships",
      workspaceId: params.workspaceId,
      minimumRole: "admin",
      auth,
      useCases,
    });

    const memberships =
      await useCases.workspaces.listWorkspaceMemberships.execute({
        actorUserId: auth.userId,
        workspaceId: params.workspaceId,
      });

    return apiSuccessResponse({
      memberships,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const auth = await requireAuthenticatedApiRequest();
    const params = ParamsSchema.parse(await context.params);
    const body = UpsertWorkspaceMembershipBodySchema.parse(
      await request.json(),
    );
    const useCases = createServerUseCases();
    const access = await requireWorkspaceAccessForApi({
      route: "PUT /api/workspaces/[workspaceId]/memberships",
      workspaceId: params.workspaceId,
      minimumRole: "owner",
      auth,
      useCases,
    });

    const result = await useCases.workspaces.upsertWorkspaceMembership.execute({
      actorUserId: auth.userId,
      workspaceId: params.workspaceId,
      memberEmail: body.memberEmail,
      role: body.role,
      ...(body.memberDisplayName
        ? { memberDisplayName: body.memberDisplayName }
        : {}),
    });

    await recordServerAuditEvent({
      workspaceId: params.workspaceId,
      entityType: "workspace",
      entityId: params.workspaceId,
      action: "updated",
      actorUserId: auth.userId,
      actorIdentity: auth.identity,
      payload: {
        route: "PUT /api/workspaces/[workspaceId]/memberships",
        actorRole: access.membership.role,
        previousRole: result.previousMembership?.role ?? null,
        changeKind: result.changeKind,
        selfTarget: auth.userId === result.user.id,
        memberUserId: result.user.id,
        memberEmail: result.user.email,
        assignedRole: result.membership.role,
      },
    });

    return apiSuccessResponse({
      workspace: result.workspace,
      membership: result.membership,
      member: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName ?? null,
        active: result.user.active,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
