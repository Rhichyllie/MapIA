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

const UpdateSemanticPolicyRequestSchema = z.object({
  diagramType: z.string().trim().min(1).max(80).optional(),
  strictEnabled: z.boolean().optional(),
  enforceOnServer: z.boolean().optional(),
  allowTechOverride: z.boolean().optional(),
  requireOverrideReason: z.boolean().optional(),
  customRulesJson: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await getApiSessionIdentity();

    if (!auth) {
      return unauthorizedResponse();
    }

    const params = ParamsSchema.parse(await context.params);
    const { projects, semantics } = createServerUseCases();

    await projects.getOwnedProject.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
    });

    const policy = await semantics.getOrCreatePolicy.execute({
      projectId: params.projectId,
      actorIdentity: auth.identity,
    });

    return apiSuccessResponse({ policy });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

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
    const body = UpdateSemanticPolicyRequestSchema.parse(await request.json());
    const { projects, semantics } = createServerUseCases();

    await projects.getOwnedProject.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
    });

    const policy = await semantics.updatePolicy.execute({
      projectId: params.projectId,
      actorIdentity: auth.identity,
      ...body,
    });

    return apiSuccessResponse({ policy });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
