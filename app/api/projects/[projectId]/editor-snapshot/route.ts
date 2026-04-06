import { z } from "zod";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import {
  requireAuthenticatedApiRequest,
  requireProjectAccessForApi,
} from "@/src/server/app/api-route-guards";
import { createServerUseCases } from "@/src/server/app/container";
import { withServerTelemetrySpan } from "@/src/server/observability/server-telemetry";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    return await withServerTelemetrySpan(
      "editor.snapshot.route.read",
      {
        attributes: {
          "editor.route": "GET /api/projects/[projectId]/editor-snapshot",
        },
      },
      async (span) => {
        const auth = await requireAuthenticatedApiRequest();
        const params = ParamsSchema.parse(await context.params);
        const useCases = createServerUseCases();

        await requireProjectAccessForApi({
          route: "GET /api/projects/[projectId]/editor-snapshot",
          projectId: params.projectId,
          minimumRole: "viewer",
          auth,
          useCases,
        });

        span.setAttribute("editor.authenticated", true);
        span.setAttribute("editor.project_id", params.projectId);

        const workingSnapshot =
          await useCases.editor.getWorkingSnapshotForEditor.execute({
            projectId: params.projectId,
          });

        span.setAttribute("editor.snapshot.present", Boolean(workingSnapshot));
        return apiSuccessResponse({ workingSnapshot });
      },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
