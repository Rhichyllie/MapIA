import {
  AssistantDraftSchema,
  getSourceStatusPresentation,
  normalizeSourceStatusCode,
} from "@/src/modules/creation-assistant/domain";
import {
  apiErrorResponse,
  apiSuccessResponse,
  unauthorizedResponse,
} from "@/src/server/app/api-response";
import {
  buildCreationTelemetryContextFromRequest,
  recordCreationApplyAttempted,
  recordCreationApplySucceeded,
  recordCreationSourceStatusChanged,
  runCreationTelemetryFanout,
} from "@/src/server/observability";
import { createServerUseCases } from "@/src/server/app/container";
import { getApiSessionIdentity } from "@/src/server/auth/api-session";

export async function POST(request: Request) {
  try {
    const auth = await getApiSessionIdentity();

    if (!auth) {
      return unauthorizedResponse();
    }

    const body = AssistantDraftSchema.parse(await request.json());
    const requestContext = buildCreationTelemetryContextFromRequest(request);
    await recordCreationApplyAttempted({
      ownerIdentity: auth.identity,
      mode: "new",
      createInitialMap: true,
      requestContext,
    });
    const { creationAssistant } = createServerUseCases();
    const result = await creationAssistant.createProjectWithAssistant.execute({
      ownerIdentity: auth.identity,
      draft: body,
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
        sourceStatus: sourceStatus
          ? getSourceStatusPresentation(sourceStatus)
          : null,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
