import { z } from "zod";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import { requireAuthenticatedApiRequest } from "@/src/server/app/api-route-guards";
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
    const auth = await requireAuthenticatedApiRequest();
    const params = ParamsSchema.parse(await context.params);
    const { creationAssistant } = createServerUseCases();
    const result = await creationAssistant.applyProjectCreation.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
      createInitialMap: true,
    });
    await recordServerAuditEvent({
      projectId: params.projectId,
      entityType: "project",
      entityId: params.projectId,
      action: "updated",
      actorIdentity: auth.identity,
      payload: {
        route: "POST /api/projects/[projectId]/wizard-generate",
        compatibilityAlias: true,
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
