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

// Legacy alias kept only to translate deprecated /wizard clients onto the
// canonical Creation Assistant apply flow.
export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await getApiSessionIdentity();

    if (!auth) {
      return unauthorizedResponse();
    }

    const params = ParamsSchema.parse(await context.params);
    const { creationAssistant } = createServerUseCases();
    const result = await creationAssistant.applyProjectCreation.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
      createInitialMap: true,
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
