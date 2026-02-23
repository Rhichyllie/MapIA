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
    const { wizard } = createServerUseCases();

    const result = await wizard.generateInitialSnapshot.execute({
      projectId: params.projectId,
      actorIdentity: auth.identity,
    });

    return apiSuccessResponse(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
