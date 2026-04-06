import { z } from "zod";
import { isAppError } from "@/src/lib/app-error";
import { AssistantDraftSchema } from "@/src/modules/creation-assistant/domain";
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

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const useCases = createServerUseCases();
    const { auth, params, project, membership } =
      await requireProjectRouteContext({
        route:
          "POST /api/projects/[projectId]/creation-settings/apply-initial-map",
        params: context.params,
        paramsSchema: ParamsSchema,
        minimumRole: "member",
        useCases,
      });
    const requestContext = buildCreationTelemetryContextFromRequest(request);
    const draft = AssistantDraftSchema.parse(await request.json());
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
        createInitialMap: true,
        requestContext,
      }),
    );
    const result = await creationAssistant.applyProjectCreation.execute({
      actorUserId: auth.userId,
      ownerIdentity: auth.identity,
      projectId: params.projectId,
      createInitialMap: true,
      draft,
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
        route:
          "POST /api/projects/[projectId]/creation-settings/apply-initial-map",
        createInitialMap: true,
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
          createInitialMap: true,
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
      initialSnapshot: result.initialSnapshot,
      redirectUrl: result.redirectUrl,
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
