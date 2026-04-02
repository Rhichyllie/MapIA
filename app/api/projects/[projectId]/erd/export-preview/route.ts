import { z } from "zod";
import { AppError } from "@/src/lib/app-error";
import {
  buildErdExportPreview,
  buildErdRepairPlanFromDiagnostics,
  normalizeErdGraphFromSemantic,
  normalizeErdPolicyFromCustomRules,
  validateErdGraphFull,
} from "@/src/modules/erd/domain";
import { runGraphAudit } from "@/src/modules/semantics/domain";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import { requireOwnedProjectRouteContext } from "@/src/server/app/api-route-guards";
import { createServerUseCases } from "@/src/server/app/container";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const ExportPreviewRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative().optional(),
  format: z.literal("json"),
});

function toSemanticGraph(snapshot: {
  nodes: Array<{
    id: string;
    kind: string;
    label?: string;
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    kind: string;
    label?: string;
    data: Record<string, unknown>;
  }>;
}) {
  return {
    nodes: snapshot.nodes.map((node) => ({
      id: node.id,
      kind: node.kind as
        | "workspace"
        | "project"
        | "entity"
        | "page"
        | "flow-step"
        | "note",
      label: node.label,
      payload: node.data,
    })),
    edges: snapshot.edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      kind: edge.kind as
        | "contains"
        | "references"
        | "depends-on"
        | "flows-to"
        | "relates-to",
      label: edge.label,
      payload: edge.data,
    })),
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const useCases = createServerUseCases();
    const { auth, params } = await requireOwnedProjectRouteContext({
      route: "POST /api/projects/[projectId]/erd/export-preview",
      params: context.params,
      paramsSchema: ParamsSchema,
      useCases,
    });
    const body = ExportPreviewRequestSchema.parse(await request.json());

    const workingSnapshot = await useCases.graph.loadWorkingSnapshot.execute({
      projectId: params.projectId,
    });
    if (!workingSnapshot) {
      throw new AppError(
        "Snapshot de trabalho nao encontrado. Gere o snapshot inicial antes do preview.",
        {
          code: "WORKING_SNAPSHOT_NOT_FOUND",
          status: 404,
        },
      );
    }

    if (
      body.expectedRevision !== undefined &&
      body.expectedRevision !== workingSnapshot.revision
    ) {
      throw new AppError("Conflito de revisao para export-preview.", {
        code: "CONFLICT",
        status: 409,
        details: {
          currentRevision: workingSnapshot.revision,
          expectedRevision: body.expectedRevision,
        },
      });
    }

    const policy = await useCases.semantics.getOrCreatePolicy.execute({
      projectId: params.projectId,
      actorIdentity: auth.identity,
    });
    const semanticGraph = toSemanticGraph(workingSnapshot.snapshot);
    const erdGraph = normalizeErdGraphFromSemantic({
      nodes: semanticGraph.nodes,
      edges: semanticGraph.edges,
    });
    const erdPolicy = normalizeErdPolicyFromCustomRules(policy.customRulesJson);
    const erdDiagnostics = validateErdGraphFull({
      graph: erdGraph,
      policy: erdPolicy,
    });
    const audit = runGraphAudit(semanticGraph, "erd", "operational", {
      strictEnabled: policy.strictEnabled,
      ...(policy.customRulesJson
        ? { customRulesJson: policy.customRulesJson }
        : {}),
    });

    if (erdPolicy.validationLevel === "strict" && audit.bySeverity.error > 0) {
      const repairPlan = buildErdRepairPlanFromDiagnostics(
        erdDiagnostics.diagnostics,
      );

      throw new AppError(
        "Export preview requer reparo semantico no nivel strict.",
        {
          code: "REPAIR_REQUIRED",
          status: 409,
          details: {
            diagnostics: audit.issues,
            bySeverity: audit.bySeverity,
            counters: audit.counters,
            repairPlan,
            suggestedFixes: repairPlan.safeFixes,
          },
        },
      );
    }

    return apiSuccessResponse({
      export: buildErdExportPreview(erdGraph),
      diagnostics: audit.issues,
      bySeverity: audit.bySeverity,
      counters: audit.counters,
      revision: workingSnapshot.revision,
      format: body.format,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
