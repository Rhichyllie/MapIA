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

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
  versionId: z.string().uuid(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; versionId: string }> },
) {
  try {
    const auth = await requireAuthenticatedApiRequest();
    const params = ParamsSchema.parse(await context.params);
    const useCases = createServerUseCases();

    await requireOwnedProjectForApi({
      route: "GET /api/projects/[projectId]/snapshot-versions/[versionId]",
      projectId: params.projectId,
      ownerIdentity: auth.identity,
      useCases,
    });

    const snapshotVersion =
      await useCases.versioning.getSnapshotVersionById.execute({
        projectId: params.projectId,
        versionId: params.versionId,
      });

    return apiSuccessResponse({ snapshotVersion });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
