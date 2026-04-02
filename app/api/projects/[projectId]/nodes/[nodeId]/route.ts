import { z } from "zod";
import { NodeKindSchema } from "@/src/domain";
import { MIN_SEMANTIC_OVERRIDE_REASON_LENGTH } from "@/src/modules/semantics/domain";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import { requireOwnedProjectRouteContext } from "@/src/server/app/api-route-guards";
import { createServerUseCases } from "@/src/server/app/container";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
  nodeId: z.string().uuid(),
});

const UpdateNodeRequestSchema = z.object({
  patch: z
    .object({
      label: z.string().trim().min(1).max(200).optional(),
      kind: NodeKindSchema.optional(),
      data: z.record(z.string(), z.unknown()).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: "Patch de node deve conter ao menos um campo.",
    }),
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

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string; nodeId: string }> },
) {
  try {
    const useCases = createServerUseCases();
    const { auth, params } = await requireOwnedProjectRouteContext({
      route: "PUT /api/projects/[projectId]/nodes/[nodeId]",
      params: context.params,
      paramsSchema: ParamsSchema,
      useCases,
    });
    const body = UpdateNodeRequestSchema.parse(await request.json());

    const workingSnapshot = await useCases.editor.applyCommand.execute({
      projectId: params.projectId,
      actorIdentity: auth.identity,
      ...(body.expectedRevision !== undefined
        ? { expectedRevision: body.expectedRevision }
        : {}),
      ...(body.semanticMode ? { semanticMode: body.semanticMode } : {}),
      ...(body.allowSemanticOverride !== undefined
        ? { allowSemanticOverride: body.allowSemanticOverride }
        : {}),
      ...(body.overrideReason ? { overrideReason: body.overrideReason } : {}),
      command: {
        type: "updateNode",
        nodeId: params.nodeId,
        patch: body.patch,
      },
    });

    return apiSuccessResponse({
      workingSnapshot,
      newRevision: workingSnapshot.revision,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
