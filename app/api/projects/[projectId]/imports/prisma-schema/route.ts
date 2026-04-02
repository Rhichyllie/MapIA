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
});

const ImportPrismaSchemaRequestSchema = z.object({
  schema: z.string(),
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
    const body = ImportPrismaSchemaRequestSchema.parse(await request.json());
    const useCases = createServerUseCases();
    const project = await requireOwnedProjectForApi({
      route: "POST /api/projects/[projectId]/imports/prisma-schema",
      projectId: params.projectId,
      ownerIdentity: auth.identity,
      useCases,
    });

    const imported =
      await useCases.importing.importPrismaSchemaToSnapshot.execute({
        projectId: params.projectId,
        schemaText: body.schema,
      });

    const workingSnapshot = await useCases.editor.saveFullSnapshot.execute({
      projectId: params.projectId,
      actorIdentity: auth.identity,
      snapshot: imported.snapshot,
      label: "import-prisma-schema",
      ...(body.expectedRevision !== undefined
        ? { expectedRevision: body.expectedRevision }
        : {}),
      ...(body.semanticMode ? { semanticMode: body.semanticMode } : {}),
      ...(body.allowSemanticOverride !== undefined
        ? { allowSemanticOverride: body.allowSemanticOverride }
        : {}),
      ...(body.overrideReason ? { overrideReason: body.overrideReason } : {}),
    });

    await useCases.repositories.semanticEventLogRepository.append({
      projectId: params.projectId,
      actorIdentity: auth.identity,
      eventType: "import_prisma",
      severity: "info",
      payloadJson: {
        source: "prisma-schema-inline",
        importSummary: imported.summary,
        newRevision: workingSnapshot.revision,
      },
    });
    await recordServerAuditEvent({
      workspaceId: project.workspaceId,
      projectId: params.projectId,
      entityType: "project",
      entityId: params.projectId,
      action: "imported",
      actorIdentity: auth.identity,
      payload: {
        route: "POST /api/projects/[projectId]/imports/prisma-schema",
        source: "prisma-schema-inline",
        importSummary: imported.summary,
        newRevision: workingSnapshot.revision,
      },
    });

    return apiSuccessResponse({
      message:
        "Schema Prisma importado com sucesso para o snapshot de trabalho.",
      importSummary: imported.summary,
      workingSnapshot,
      newRevision: workingSnapshot.revision,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
