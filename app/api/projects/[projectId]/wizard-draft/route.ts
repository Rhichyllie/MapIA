import { z } from "zod";
import {
  apiErrorResponse,
  apiSuccessResponse,
  unauthorizedResponse,
} from "@/src/server/app/api-response";
import { createServerUseCases } from "@/src/server/app/container";
import { getApiSessionIdentity } from "@/src/server/auth/api-session";
import {
  buildAssistantDraftFromLegacyWizard,
  buildLegacyWizardDraftViewModel,
  SaveLegacyWizardDraftInputSchema,
} from "@/src/modules/creation-assistant/application/legacy-wizard-alias";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
});

// Legacy alias kept only to translate deprecated /wizard clients onto the
// canonical Creation Assistant draft model.
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
    const body = SaveLegacyWizardDraftInputSchema.parse(await request.json());
    const { projects, creationAssistant } = createServerUseCases();
    const project = await projects.getOwnedProject.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
    });
    const assistantDraft = buildAssistantDraftFromLegacyWizard({
      project: {
        name: project.name,
        description: project.description,
        template: project.template,
      },
      payload: body.payload,
    });
    await creationAssistant.saveProjectCreationDraft.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
      draft: assistantDraft,
    });

    return apiSuccessResponse({
      draft: buildLegacyWizardDraftViewModel({
        currentStep: body.currentStep,
        payload: body.payload,
        status: body.status,
      }),
      compatibilityAlias: true,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
