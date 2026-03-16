import { z } from "zod";
import { isAppError } from "@/src/lib/app-error";
import { AssistantDraftSchema } from "@/src/modules/creation-assistant/domain";
import {
  apiErrorResponse,
  apiSuccessResponse,
  unauthorizedResponse,
} from "@/src/server/app/api-response";
import {
  buildCreationTelemetryContextFromRequest,
  recordCreationApplyAttempted,
  recordCreationApplyBlockedStrictValidation,
  recordCreationApplySucceeded,
  recordCreationSourceStatusChanged,
  runCreationTelemetryFanout,
} from "@/src/server/observability";
import { createServerUseCases } from "@/src/server/app/container";
import { getApiSessionIdentity } from "@/src/server/auth/api-session";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
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
    const requestContext = buildCreationTelemetryContextFromRequest(request);
    const draft = AssistantDraftSchema.parse(await request.json());
    const { creationAssistant } = createServerUseCases();
    const previousSettings = await creationAssistant.getProjectCreationSettings.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
    });
    await recordCreationApplyAttempted({
      projectId: params.projectId,
      ownerIdentity: auth.identity,
      mode: "existing",
      createInitialMap: true,
      requestContext,
    });
    const result = await creationAssistant.applyProjectCreation.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
      createInitialMap: true,
      draft,
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
        blockingIssues?: string[];
        warnings?: string[];
        profile?: string;
        initialView?: string;
      };
      const requestContext = buildCreationTelemetryContextFromRequest(request);
      await recordCreationApplyBlockedStrictValidation({
        projectId: params.projectId,
        ownerIdentity: auth.identity,
        profile: (details.profile as "blank") ?? "blank",
        initialView: (details.initialView as "free") ?? "free",
        blockingIssueCount: details.blockingIssues?.length ?? 0,
        warningCount: details.warnings?.length ?? 0,
        requestContext,
      });
    }
    return apiErrorResponse(error);
  }
}
