import { z } from "zod";
import {
  apiErrorResponse,
  apiSuccessResponse,
  unauthorizedResponse,
} from "@/src/server/app/api-response";
import { createServerUseCases } from "@/src/server/app/container";
import { getApiSessionIdentity } from "@/src/server/auth/api-session";

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
    const auth = await getApiSessionIdentity();

    if (!auth) {
      return unauthorizedResponse();
    }

    const params = ParamsSchema.parse(await context.params);
    const rawBody = await request.text();
    const body = rawBody
      ? SemanticAuditRequestSchema.parse(JSON.parse(rawBody))
      : { mode: undefined };
    const { projects, semantics } = createServerUseCases();

    await projects.getOwnedProject.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
    });

    const audit = await semantics.auditWorkingSnapshot.execute({
      projectId: params.projectId,
      actorIdentity: auth.identity,
      mode: body.mode,
    });

    return apiSuccessResponse({ audit });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
