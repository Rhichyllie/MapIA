import { z } from "zod";
import { isAppError } from "@/src/lib/app-error";
import {
  AssistantDraftSchema,
  normalizeSourceStatusCode,
} from "@/src/modules/creation-assistant/domain";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import { requireProjectRouteContext } from "@/src/server/app/api-route-guards";
import {
  buildCreationTelemetryContextFromRequest,
  recordCreationApplyAttempted,
  recordCreationApplyBlockedStrictValidation,
  recordCreationApplySucceeded,
  recordCreationSourceStatusChanged,
  runCreationTelemetryFanout,
  scheduleCreationTelemetryOperation,
} from "@/src/server/observability/creation-assistant-transition-telemetry";
import { createServerUseCases } from "@/src/server/app/container";
import { getApiSessionIdentity } from "@/src/server/auth/api-session";
import { recordServerAuditEvent } from "@/src/server/audit/server-audit";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const ApplyBodySchema = z.object({
  createInitialMap: z.boolean().optional(),
  draft: AssistantDraftSchema.optional(),
});

function buildSourceStatusMeta(status?: string) {
  const normalized = normalizeSourceStatusCode(status);
  if (!normalized) {
    return null;
  }

  return { statusCode: normalized };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const useCases = createServerUseCases();
    const { auth, params, project, membership } =
      await requireProjectRouteContext({
        route: "POST /api/projects/[projectId]/creation-apply",
        params: context.params,
        paramsSchema: ParamsSchema,
        minimumRole: "member",
        useCases,
      });
    const requestContext = buildCreationTelemetryContextFromRequest(request);
    const body = ApplyBodySchema.parse(await request.json().catch(() => ({})));
    const { creationAssistant } = useCases;
    const previousSettings =
      await creationAssistant.getProjectCreationSettings.execute({
        actorUserId: auth.userId,
        ownerIdentity: auth.identity,
        projectId: params.projectId,
      });
    scheduleCreationTelemetryOperation(() =>
      recordCreationApplyAttempted({
        projectId: params.projectId,
        ownerIdentity: auth.identity,
        mode: "existing",
        createInitialMap: body.createInitialMap ?? true,
        requestContext,
      }),
    );
    const result = await creationAssistant.applyProjectCreation.execute({
      actorUserId: auth.userId,
      ownerIdentity: auth.identity,
      projectId: params.projectId,
      createInitialMap: body.createInitialMap ?? true,
      ...(body.draft ? { draft: body.draft } : {}),
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
        route: "POST /api/projects/[projectId]/creation-apply",
        createInitialMap: body.createInitialMap ?? true,
        appliedVersion: result.appliedVersion,
        sourceStatus: result.appliedSettings.sourceStatus ?? null,
        actorRole: membership.role,
      },
    });
    await runCreationTelemetryFanout([
      () =>
        recordCreationApplySucceeded({
          projectId: params.projectId,
          ownerIdentity: auth.identity,
          createInitialMap: body.createInitialMap ?? true,
          appliedVersion: result.appliedVersion,
          sourceStatus: result.appliedSettings.sourceStatus,
          requestContext,
        }),
      () =>
        recordCreationSourceStatusChanged({
          projectId: params.projectId,
          ownerIdentity: auth.identity,
          fromStatus: previousSettings?.sourceStatus,
          toStatus: result.appliedSettings.sourceStatus,
          startStrategy: result.appliedSettings.startStrategy,
          startSource: result.appliedSettings.startSource,
          phase: "applied",
          requestContext,
        }),
    ]);

    return apiSuccessResponse({
      projectId: result.projectId,
      redirectUrl: result.redirectUrl,
      appliedAt: result.appliedAt?.toISOString() ?? null,
      appliedVersion: result.appliedVersion,
      initialSnapshot: result.initialSnapshot ?? null,
      sourceStatus: buildSourceStatusMeta(result.appliedSettings.sourceStatus),
    });
  } catch (error) {
    const auth = await getApiSessionIdentity();
    const params = await context.params.catch(() => ({ projectId: undefined }));
    if (
      auth &&
      params?.projectId &&
      isAppError(error) &&
      error.code === "CREATION_DRAFT_STRICT_VALIDATION_FAILED"
    ) {
      const details = (error.details ?? {}) as {
        blockingIssueCodes?: string[];
        warningCodes?: string[];
        profile?: string;
        initialView?: string;
      };
      const requestContext = buildCreationTelemetryContextFromRequest(request);
      scheduleCreationTelemetryOperation(() =>
        recordCreationApplyBlockedStrictValidation({
          projectId: params.projectId,
          ownerIdentity: auth.identity,
          profile: (details.profile as "blank") ?? "blank",
          initialView: (details.initialView as "free") ?? "free",
          blockingIssueCount: details.blockingIssueCodes?.length ?? 0,
          warningCount: details.warningCodes?.length ?? 0,
          requestContext,
        }),
      );
    }
    return apiErrorResponse(error);
  }
}
