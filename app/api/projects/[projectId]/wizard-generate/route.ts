import { z } from "zod";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import { requireProjectRouteContext } from "@/src/server/app/api-route-guards";
import { createServerUseCases } from "@/src/server/app/container";
import { recordServerAuditEvent } from "@/src/server/audit/server-audit";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
});

// Legacy alias kept only to translate deprecated /wizard clients onto the
// canonical Creation Assistant apply flow.
export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const useCases = createServerUseCases();
    const { auth, params, project, membership } =
      await requireProjectRouteContext({
        route: "POST /api/projects/[projectId]/wizard-generate",
        params: context.params,
        paramsSchema: ParamsSchema,
        minimumRole: "member",
        useCases,
      });
    const { creationAssistant } = useCases;
    const result = await creationAssistant.applyProjectCreation.execute({
      actorUserId: auth.userId,
      ownerIdentity: auth.identity,
      projectId: params.projectId,
      createInitialMap: true,
    });
    await recordServerAuditEvent({
      workspaceId: project.workspaceId,
      projectId: params.projectId,
      entityType: "project",
      entityId: params.projectId,
      action: "updated",
      actorUserId: auth.userId,
      actorIdentity: auth.identity,
      payload: {
        route: "POST /api/projects/[projectId]/wizard-generate",
        compatibilityAlias: true,
        actorRole: membership.role,
      },
    });

    return apiSuccessResponse({
      projectId: result.projectId,
      redirectUrl: result.redirectUrl,
      initialSnapshot: result.initialSnapshot ?? null,
      compatibilityAlias: true,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
