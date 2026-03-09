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
  versionId: z.string().uuid(),
});

const RestoreSnapshotRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative().optional(),
  semanticMode: z.enum(["operational", "technical"]).optional(),
  allowSemanticOverride: z.boolean().optional(),
  overrideReason: z.string().trim().min(3).max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; versionId: string }> },
) {
  try {
    const auth = await getApiSessionIdentity();

    if (!auth) {
      return unauthorizedResponse();
    }

    const params = ParamsSchema.parse(await context.params);
    let body: z.infer<typeof RestoreSnapshotRequestSchema> = {};
    try {
      const rawBody = await request.json();
      body = RestoreSnapshotRequestSchema.parse(rawBody);
    } catch {
      body = {};
    }
    const { projects, versioning } = createServerUseCases();

    await projects.getOwnedProject.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
    });

    const result = await versioning.restoreWorkingSnapshotFromVersion.execute({
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
