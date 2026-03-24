import { z } from "zod";
import {
  apiErrorResponse,
  apiSuccessResponse,
  unauthorizedResponse,
} from "@/src/server/app/api-response";
import { createServerUseCases } from "@/src/server/app/container";
import { getApiSessionIdentity } from "@/src/server/auth/api-session";
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
        const auth = await getApiSessionIdentity();

        if (!auth) {
          span.setAttribute("editor.authenticated", false);
          return unauthorizedResponse();
        }

        span.setAttribute("editor.authenticated", true);
        const params = ParamsSchema.parse(await context.params);
        const body = ApplyCommandsRequestSchema.parse(await request.json());
        const { projects, editor } = createServerUseCases();

        span.setAttribute("editor.project_id", params.projectId);
        span.setAttribute("editor.command.batch", !("command" in body));
        span.setAttribute(
          "editor.command.count",
          "command" in body ? 1 : body.commands.length,
        );

        await projects.getOwnedProject.execute({
          ownerIdentity: auth.identity,
          projectId: params.projectId,
        });

        const workingSnapshot =
          "command" in body
            ? await editor.applyCommand.execute({
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
                command: body.command,
              })
            : await editor.applyCommands.execute({
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
