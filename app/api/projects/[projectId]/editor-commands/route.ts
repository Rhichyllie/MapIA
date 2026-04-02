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
import {
  ApplyEditorCommandsInputSchema,
  ApplyEditorCommandInputSchema,
} from "@/src/modules/editor/application";
import { withServerTelemetrySpan } from "@/src/server/observability/server-telemetry";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const ApplyLegacyCommandsRequestSchema = ApplyEditorCommandsInputSchema.omit({
  projectId: true,
  actorIdentity: true,
});
const ApplySingleCommandRequestSchema = ApplyEditorCommandInputSchema.omit({
  projectId: true,
  actorIdentity: true,
});
const ApplyCommandsRequestSchema = z.union([
  ApplySingleCommandRequestSchema,
  ApplyLegacyCommandsRequestSchema,
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    return await withServerTelemetrySpan(
      "editor.commands.execute",
      {
        attributes: {
          "editor.route": "POST /api/projects/[projectId]/editor-commands",
        },
      },
      async (span) => {
        const auth = await requireAuthenticatedApiRequest();
        const params = ParamsSchema.parse(await context.params);
        const body = ApplyCommandsRequestSchema.parse(await request.json());
        const useCases = createServerUseCases();

        await requireOwnedProjectForApi({
          route: "POST /api/projects/[projectId]/editor-commands",
          projectId: params.projectId,
          ownerIdentity: auth.identity,
          useCases,
        });

        span.setAttribute("editor.authenticated", true);
        span.setAttribute("editor.project_id", params.projectId);
        span.setAttribute("editor.command.batch", !("command" in body));
        span.setAttribute(
          "editor.command.count",
          "command" in body ? 1 : body.commands.length,
        );

        const workingSnapshot =
          "command" in body
            ? await useCases.editor.applyCommand.execute({
                projectId: params.projectId,
                actorIdentity: auth.identity,
                label: body.label,
                ...(body.expectedRevision !== undefined
                  ? { expectedRevision: body.expectedRevision }
                  : {}),
                ...(body.semanticMode
                  ? { semanticMode: body.semanticMode }
                  : {}),
                ...(body.allowSemanticOverride !== undefined
                  ? { allowSemanticOverride: body.allowSemanticOverride }
                  : {}),
                ...(body.overrideReason
                  ? { overrideReason: body.overrideReason }
                  : {}),
                command: body.command,
              })
            : await useCases.editor.applyCommands.execute({
                projectId: params.projectId,
                actorIdentity: auth.identity,
                label: body.label,
                ...(body.expectedRevision !== undefined
                  ? { expectedRevision: body.expectedRevision }
                  : {}),
                ...(body.semanticMode
                  ? { semanticMode: body.semanticMode }
                  : {}),
                ...(body.allowSemanticOverride !== undefined
                  ? { allowSemanticOverride: body.allowSemanticOverride }
                  : {}),
                ...(body.overrideReason
                  ? { overrideReason: body.overrideReason }
                  : {}),
                commands: body.commands,
              });

        span.setAttribute("editor.new_revision", workingSnapshot.revision);

        return apiSuccessResponse({
          workingSnapshot,
          newRevision: workingSnapshot.revision,
        });
      },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
