import { z } from "zod";
import { GraphSnapshotSchema } from "@/src/domain";
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

const ValidateSemanticRequestSchema = z.object({
  mode: z.enum(["operational", "technical"]).optional(),
  snapshot: GraphSnapshotSchema,
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
    const body = ValidateSemanticRequestSchema.parse(await request.json());
    const { projects, semantics } = createServerUseCases();

    await projects.getOwnedProject.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
    });

    const validation = await semantics.validateDraft.execute({
      projectId: params.projectId,
      actorIdentity: auth.identity,
      mode: body.mode,
      snapshot: body.snapshot,
    });

    return apiSuccessResponse({ validation });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
