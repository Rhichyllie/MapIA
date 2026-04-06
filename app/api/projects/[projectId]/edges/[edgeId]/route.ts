import { z } from "zod";
import { EdgeKindSchema } from "@/src/domain";
import { MIN_SEMANTIC_OVERRIDE_REASON_LENGTH } from "@/src/modules/semantics/domain";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import { requireProjectRouteContext } from "@/src/server/app/api-route-guards";
import { createServerUseCases } from "@/src/server/app/container";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
  edgeId: z.string().uuid(),
});

const UpdateEdgeRequestSchema = z.object({
  patch: z
    .object({
      label: z.string().trim().max(200).optional(),
      kind: EdgeKindSchema.optional(),
      data: z.record(z.string(), z.unknown()).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: "Patch de edge deve conter ao menos um campo.",
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
  context: { params: Promise<{ projectId: string; edgeId: string }> },
) {
  try {
    const useCases = createServerUseCases();
    const { auth, params } = await requireProjectRouteContext({
      route: "PUT /api/projects/[projectId]/edges/[edgeId]",
      params: context.params,
      paramsSchema: ParamsSchema,
      minimumRole: "member",
      useCases,
    });
    const body = UpdateEdgeRequestSchema.parse(await request.json());

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
        type: "updateEdge",
        edgeId: params.edgeId,
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
