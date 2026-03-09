import { z } from "zod";
import { EdgeKindSchema } from "@/src/domain";
import {
  apiErrorResponse,
  apiSuccessResponse,
  unauthorizedResponse,
} from "@/src/server/app/api-response";
import { createServerUseCases } from "@/src/server/app/container";
import { getApiSessionIdentity } from "@/src/server/auth/api-session";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const CreateEdgeRequestSchema = z.object({
  edge: z.object({
    id: z.string().uuid().optional(),
    sourceNodeId: z.string().uuid(),
    targetNodeId: z.string().uuid(),
    kind: EdgeKindSchema,
    label: z.string().trim().max(200).optional(),
    data: z.record(z.string(), z.unknown()).default({}),
  }),
  expectedRevision: z.number().int().nonnegative().optional(),
  semanticMode: z.enum(["operational", "technical"]).optional(),
  allowSemanticOverride: z.boolean().optional(),
  overrideReason: z.string().trim().min(3).max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await getApiSessionIdentity();

    if (!auth) {
      return unauthorizedResponse();
    }

    const params = ParamsSchema.parse(await context.params);
    const body = CreateEdgeRequestSchema.parse(await request.json());
    const { projects, editor } = createServerUseCases();

    await projects.getOwnedProject.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
    });

    const workingSnapshot = await editor.applyCommand.execute({
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
        type: "addEdge",
        edge: {
          id: body.edge.id ?? crypto.randomUUID(),
          sourceNodeId: body.edge.sourceNodeId,
          targetNodeId: body.edge.targetNodeId,
          kind: body.edge.kind,
          label: body.edge.label,
          data: body.edge.data,
        },
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
