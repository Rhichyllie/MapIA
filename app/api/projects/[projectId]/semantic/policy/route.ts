import { z } from "zod";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import { requireProjectRouteContext } from "@/src/server/app/api-route-guards";
import { createServerUseCases } from "@/src/server/app/container";
import { recordServerAuditEvent } from "@/src/server/audit/server-audit";
import { withServerTelemetrySpan } from "@/src/server/observability/server-telemetry";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const UpdateSemanticPolicyRequestSchema = z.object({
  diagramType: z.string().trim().min(1).max(80).optional(),
  strictEnabled: z.boolean().optional(),
  enforceOnServer: z.boolean().optional(),
  allowTechOverride: z.boolean().optional(),
  requireOverrideReason: z.boolean().optional(),
  customRulesJson: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    return await withServerTelemetrySpan(
      "semantic.policy.route.read",
      {
        attributes: {
          "semantic.route": "GET /api/projects/[projectId]/semantic/policy",
        },
      },
      async (span) => {
        const useCases = createServerUseCases();
        const { auth, params } = await requireProjectRouteContext({
          route: "GET /api/projects/[projectId]/semantic/policy",
          params: context.params,
          paramsSchema: ParamsSchema,
          minimumRole: "viewer",
          useCases,
        });

        span.setAttribute("semantic.authenticated", true);
        span.setAttribute("semantic.project_id", params.projectId);

        const policy = await useCases.semantics.getOrCreatePolicy.execute({
          projectId: params.projectId,
          actorIdentity: auth.identity,
        });

        span.setAttribute(
          "semantic.policy.strict_enabled",
          policy.strictEnabled,
        );
        return apiSuccessResponse({ policy });
      },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const useCases = createServerUseCases();
    const { auth, params, project, membership } =
      await requireProjectRouteContext({
        route: "PUT /api/projects/[projectId]/semantic/policy",
        params: context.params,
        paramsSchema: ParamsSchema,
        minimumRole: "admin",
        useCases,
      });
    const body = UpdateSemanticPolicyRequestSchema.parse(await request.json());

    const policy = await useCases.semantics.updatePolicy.execute({
      projectId: params.projectId,
      actorIdentity: auth.identity,
      ...body,
    });
    await recordServerAuditEvent({
      workspaceId: project.workspaceId,
      projectId: params.projectId,
      entityType: "project",
      entityId: params.projectId,
      action: "updated",
      actorUserId: auth.userId,
      actorIdentity: auth.identity,
      payload: {
        route: "PUT /api/projects/[projectId]/semantic/policy",
        diagramType: policy.diagramType ?? null,
        strictEnabled: policy.strictEnabled,
        enforceOnServer: policy.enforceOnServer,
        allowTechOverride: policy.allowTechOverride,
        requireOverrideReason: policy.requireOverrideReason,
        actorRole: membership.role,
      },
    });

    return apiSuccessResponse({ policy });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
