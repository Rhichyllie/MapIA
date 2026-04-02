import { z } from "zod";
import { MIN_SEMANTIC_OVERRIDE_REASON_LENGTH } from "@/src/modules/semantics/domain";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import {
  requireAuthenticatedApiRequest,
  requireOwnedProjectForApi,
} from "@/src/server/app/api-route-guards";
import { createServerUseCases } from "@/src/server/app/container";
import { recordServerAuditEvent } from "@/src/server/audit/server-audit";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
  versionId: z.string().uuid(),
});

const RestoreSnapshotRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative().optional(),
  semanticMode: z.enum(["operational", "technical"]).optional(),
  allowSemanticOverride: z.boolean().optional(),
  overrideReason: z
    .string()
    .trim()
    .min(MIN_SEMANTIC_OVERRIDE_REASON_LENGTH)
    .max(500)
    .optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; versionId: string }> },
) {
  try {
    const auth = await requireAuthenticatedApiRequest();
    const params = ParamsSchema.parse(await context.params);
    let body: z.infer<typeof RestoreSnapshotRequestSchema> = {};
    try {
      const rawBody = await request.json();
      body = RestoreSnapshotRequestSchema.parse(rawBody);
    } catch {
      body = {};
    }
    const useCases = createServerUseCases();
    const project = await requireOwnedProjectForApi({
      route:
        "POST /api/projects/[projectId]/snapshot-versions/[versionId]/restore",
      projectId: params.projectId,
      ownerIdentity: auth.identity,
      useCases,
    });

    const result =
      await useCases.versioning.restoreWorkingSnapshotFromVersion.execute({
        projectId: params.projectId,
        versionId: params.versionId,
        actorIdentity: auth.identity,
        ...(body.expectedRevision !== undefined
          ? { expectedRevision: body.expectedRevision }
          : {}),
        ...(body.semanticMode ? { semanticMode: body.semanticMode } : {}),
        ...(body.allowSemanticOverride !== undefined
          ? { allowSemanticOverride: body.allowSemanticOverride }
          : {}),
        ...(body.overrideReason ? { overrideReason: body.overrideReason } : {}),
      });
    await recordServerAuditEvent({
      workspaceId: project.workspaceId,
      projectId: params.projectId,
      entityType: "graph_version",
      entityId: params.versionId,
      action: "restored",
      actorIdentity: auth.identity,
      payload: {
        route:
          "POST /api/projects/[projectId]/snapshot-versions/[versionId]/restore",
        restoredFromVersionId: result.restoredFromVersionId,
        newRevision: result.workingSnapshot.revision,
      },
    });

    return apiSuccessResponse({
      message: result.message,
      restoredFromVersionId: result.restoredFromVersionId,
      workingSnapshot: result.workingSnapshot,
      newRevision: result.workingSnapshot.revision,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
