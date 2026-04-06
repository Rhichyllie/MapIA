import { z } from "zod";
import { GraphSnapshotSchema } from "@/src/domain";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import { requireProjectRouteContext } from "@/src/server/app/api-route-guards";
import { createServerUseCases } from "@/src/server/app/container";

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
    const useCases = createServerUseCases();
    const { auth, params } = await requireProjectRouteContext({
      route: "POST /api/projects/[projectId]/semantic/validate",
      params: context.params,
      paramsSchema: ParamsSchema,
      minimumRole: "viewer",
      useCases,
    });
    const body = ValidateSemanticRequestSchema.parse(await request.json());

    const validation = await useCases.semantics.validateDraft.execute({
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
