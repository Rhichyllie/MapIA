import { z } from "zod";
import {
  apiErrorResponse,
  apiSuccessResponse,
  unauthorizedResponse,
} from "@/src/server/app/api-response";
import { createServerUseCases } from "@/src/server/app/container";
import { getApiSessionIdentity } from "@/src/server/auth/api-session";
import { SaveWorkingSnapshotInputSchema } from "@/src/modules/graph/application";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const SaveWorkingSnapshotRequestSchema = SaveWorkingSnapshotInputSchema.omit({
  projectId: true,
  actorIdentity: true,
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
    const { projects, graph } = createServerUseCases();

    await projects.getOwnedProject.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
    });

    const workingSnapshot = await graph.loadWorkingSnapshot.execute({
      projectId: params.projectId,
    });

    return apiSuccessResponse({ workingSnapshot });
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
    const body = SaveWorkingSnapshotRequestSchema.parse(await request.json());
    const { projects, graph } = createServerUseCases();

    await projects.getOwnedProject.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
    });

    const workingSnapshot = await graph.saveWorkingSnapshot.execute({
      projectId: params.projectId,
      actorIdentity: auth.identity,
      label: body.label,
      snapshot: body.snapshot,
    });

    return apiSuccessResponse({ workingSnapshot });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
