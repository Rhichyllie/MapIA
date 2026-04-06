import { z } from "zod";
import { MIN_SEMANTIC_OVERRIDE_REASON_LENGTH } from "@/src/modules/semantics/domain";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import {
  requireAuthenticatedApiRequest,
  requireProjectAccessForApi,
} from "@/src/server/app/api-route-guards";
import { createServerUseCases } from "@/src/server/app/container";
import { recordServerAuditEvent } from "@/src/server/audit/server-audit";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const ImportPostgresRequestSchema = z.object({
  schema: z.string().trim().min(1).optional(),
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
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuthenticatedApiRequest();
    const params = ParamsSchema.parse(await context.params);
    const body = ImportPostgresRequestSchema.parse(await request.json());
    const useCases = createServerUseCases();
    const access = await requireProjectAccessForApi({
      route: "POST /api/projects/[projectId]/imports/postgres",
      projectId: params.projectId,
      minimumRole: "member",
      auth,
      useCases,
    });
    const { project, membership } = access;

    const imported = await useCases.importing.importPostgresToSnapshot.execute({
      projectId: params.projectId,
      schema: body.schema ?? "public",
    });

    const workingSnapshot = await useCases.editor.saveFullSnapshot.execute({
      projectId: params.projectId,
      actorIdentity: auth.identity,
      snapshot: imported.snapshot,
      label: "import-postgres",
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
      entityType: "project",
      entityId: params.projectId,
      action: "imported",
      actorUserId: auth.userId,
      actorIdentity: auth.identity,
      payload: {
        route: "POST /api/projects/[projectId]/imports/postgres",
        source: imported.source,
        importSummary: imported.summary,
        newRevision: workingSnapshot.revision,
        actorRole: membership.role,
      },
    });

    return apiSuccessResponse({
      message: "Postgres importado com sucesso para o snapshot de trabalho.",
      importSource: imported.source,
      importSummary: imported.summary,
      workingSnapshot,
      newRevision: workingSnapshot.revision,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
