import {
  AssistantDraftSchema,
  normalizeSourceStatusCode,
} from "@/src/modules/creation-assistant/domain";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import { requireAuthenticatedApiRequest } from "@/src/server/app/api-route-guards";
import {
  buildCreationTelemetryContextFromRequest,
  recordCreationApplyAttempted,
  recordCreationApplySucceeded,
  recordCreationSourceStatusChanged,
  runCreationTelemetryFanout,
  scheduleCreationTelemetryOperation,
} from "@/src/server/observability/creation-assistant-transition-telemetry";
import { createServerUseCases } from "@/src/server/app/container";
import { recordServerAuditEvent } from "@/src/server/audit/server-audit";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedApiRequest();
    const body = AssistantDraftSchema.parse(await request.json());
    const requestContext = buildCreationTelemetryContextFromRequest(request);
    scheduleCreationTelemetryOperation(() =>
      recordCreationApplyAttempted({
        ownerIdentity: auth.identity,
        mode: "new",
        createInitialMap: true,
        requestContext,
      }),
    );
    const { creationAssistant } = createServerUseCases();
    const result = await creationAssistant.createProjectWithAssistant.execute({
      actorUserId: auth.userId,
      ownerIdentity: auth.identity,
      draft: body,
    });
    await recordServerAuditEvent({
      projectId: result.projectId,
      entityType: "project",
      entityId: result.projectId,
      action: "created",
      actorUserId: auth.userId,
      actorIdentity: auth.identity,
      payload: {
        route: "POST /api/projects/create-with-assistant",
        appliedVersion: result.appliedVersion,
        sourceStatus: result.appliedSettings.sourceStatus ?? null,
      },
    });
    await runCreationTelemetryFanout([
      () =>
        recordCreationApplySucceeded({
          projectId: result.projectId,
          ownerIdentity: auth.identity,
          createInitialMap: true,
          appliedVersion: result.appliedVersion,
          sourceStatus: result.appliedSettings.sourceStatus,
          requestContext,
        }),
      () =>
        recordCreationSourceStatusChanged({
          projectId: result.projectId,
          ownerIdentity: auth.identity,
          toStatus: result.appliedSettings.sourceStatus,
          startStrategy: result.appliedSettings.startStrategy,
          startSource: result.appliedSettings.startSource,
          phase: "applied",
          requestContext,
        }),
    ]);
    const sourceStatus = normalizeSourceStatusCode(
      result.appliedSettings.sourceStatus,
    );

    return apiSuccessResponse(
      {
        projectId: result.projectId,
        initialSnapshot: result.initialSnapshot,
        redirectUrl: result.redirectUrl,
        sourceStatus: sourceStatus ? { statusCode: sourceStatus } : null,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
