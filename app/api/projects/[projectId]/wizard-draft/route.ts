import { z } from "zod";
import {
  apiErrorResponse,
  apiSuccessResponse,
  unauthorizedResponse,
} from "@/src/server/app/api-response";
import { createServerUseCases } from "@/src/server/app/container";
import { getApiSessionIdentity } from "@/src/server/auth/api-session";
import { SaveWizardDraftInputSchema } from "@/src/modules/wizard/domain";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const SaveWizardDraftRequestSchema = SaveWizardDraftInputSchema.omit({
  projectId: true,
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await getApiSessionIdentity();

    if (!auth) {
      return unauthorizedResponse();
    }

    const params = ParamsSchema.parse(await context.params);
    const body = SaveWizardDraftRequestSchema.parse(await request.json());
    const { projects, wizard } = createServerUseCases();

    await projects.getOwnedProject.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
    });

    const draft = await wizard.saveDraft.execute({
      projectId: params.projectId,
      currentStep: body.currentStep,
      payload: body.payload,
      status: body.status,
    });

    return apiSuccessResponse({ draft });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
