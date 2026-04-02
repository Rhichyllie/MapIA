import { z } from "zod";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import { requireOwnedProjectRouteContext } from "@/src/server/app/api-route-guards";
import { createServerUseCases } from "@/src/server/app/container";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const SemanticAuditRequestSchema = z.object({
  mode: z.enum(["operational", "technical"]).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const useCases = createServerUseCases();
    const { auth, params } = await requireOwnedProjectRouteContext({
      route: "POST /api/projects/[projectId]/semantic/audit",
      params: context.params,
      paramsSchema: ParamsSchema,
      useCases,
    });
    const rawBody = await request.text();
    const body = rawBody
      ? SemanticAuditRequestSchema.parse(JSON.parse(rawBody))
      : { mode: undefined };

    const audit = await useCases.semantics.auditWorkingSnapshot.execute({
      projectId: params.projectId,
      actorIdentity: auth.identity,
      mode: body.mode,
    });

    return apiSuccessResponse({ audit });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
