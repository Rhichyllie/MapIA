import { z } from "zod";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import { requireOwnedProjectRouteContext } from "@/src/server/app/api-route-guards";
import { createServerUseCases } from "@/src/server/app/container";
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
    const useCases = createServerUseCases();
    const { auth, params, project } = await requireOwnedProjectRouteContext({
      route: "PUT /api/projects/[projectId]/wizard-draft",
      params: context.params,
      paramsSchema: ParamsSchema,
      useCases,
    });
    const body = SaveLegacyWizardDraftInputSchema.parse(await request.json());
    const assistantDraft = buildAssistantDraftFromLegacyWizard({
      project: {
        name: project.name,
        description: project.description,
        template: project.template,
      },
      payload: body.payload,
    });
    await useCases.creationAssistant.saveProjectCreationDraft.execute({
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
