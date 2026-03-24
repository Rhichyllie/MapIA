import { z } from "zod";
import {
  apiErrorResponse,
  apiSuccessResponse,
  unauthorizedResponse,
} from "@/src/server/app/api-response";
import { createServerUseCases } from "@/src/server/app/container";
import { getApiSessionIdentity } from "@/src/server/auth/api-session";
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
        const auth = await getApiSessionIdentity();

        if (!auth) {
          span.setAttribute("editor.authenticated", false);
          return unauthorizedResponse();
        }

        span.setAttribute("editor.authenticated", true);
        const params = ParamsSchema.parse(await context.params);
        const { projects, editor } = createServerUseCases();

        span.setAttribute("editor.project_id", params.projectId);

        await projects.getOwnedProject.execute({
          ownerIdentity: auth.identity,
          projectId: params.projectId,
        });

        const workingSnapshot = await editor.getWorkingSnapshotForEditor.execute({
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
