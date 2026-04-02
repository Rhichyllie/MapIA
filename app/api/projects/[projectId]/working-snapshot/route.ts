import { z } from "zod";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import {
  requireAuthenticatedApiRequest,
  requireOwnedProjectForApi,
} from "@/src/server/app/api-route-guards";
import { createServerUseCases } from "@/src/server/app/container";
import { SaveEditorFullSnapshotInputSchema } from "@/src/modules/editor/application";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const SaveWorkingSnapshotRequestSchema = SaveEditorFullSnapshotInputSchema.omit(
  {
    projectId: true,
    actorIdentity: true,
  },
);

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuthenticatedApiRequest();
    const params = ParamsSchema.parse(await context.params);
    const useCases = createServerUseCases();

    await requireOwnedProjectForApi({
      route: "GET /api/projects/[projectId]/working-snapshot",
      projectId: params.projectId,
      ownerIdentity: auth.identity,
      useCases,
    });

    const workingSnapshot =
      await useCases.editor.getWorkingSnapshotForEditor.execute({
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
    const auth = await requireAuthenticatedApiRequest();
    const params = ParamsSchema.parse(await context.params);
    const body = SaveWorkingSnapshotRequestSchema.parse(await request.json());
    const useCases = createServerUseCases();

    await requireOwnedProjectForApi({
      route: "PUT /api/projects/[projectId]/working-snapshot",
      projectId: params.projectId,
      ownerIdentity: auth.identity,
      useCases,
    });

    const workingSnapshot = await useCases.editor.saveFullSnapshot.execute({
      projectId: params.projectId,
      actorIdentity: auth.identity,
      label: body.label,
      ...(body.expectedRevision !== undefined
        ? { expectedRevision: body.expectedRevision }
        : {}),
      ...(body.semanticMode ? { semanticMode: body.semanticMode } : {}),
      ...(body.allowSemanticOverride !== undefined
        ? { allowSemanticOverride: body.allowSemanticOverride }
        : {}),
      ...(body.overrideReason ? { overrideReason: body.overrideReason } : {}),
      snapshot: body.snapshot,
    });

    return apiSuccessResponse({
      workingSnapshot,
      newRevision: workingSnapshot.revision,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
