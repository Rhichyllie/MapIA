import { z } from "zod";
import {
  AssistantDraftSchema,
  normalizeSourceStatusCode,
  redactAssistantDraft,
} from "@/src/modules/creation-assistant/domain";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import { requireAuthenticatedApiRequest } from "@/src/server/app/api-route-guards";
import {
  buildCreationTelemetryContextFromRequest,
  recordCreationDraftSaved,
  recordCreationSourceStatusChanged,
  runCreationTelemetryFanout,
} from "@/src/server/observability/creation-assistant-transition-telemetry";
import { createServerUseCases } from "@/src/server/app/container";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const SaveDraftBodySchema = z.object({
  draft: AssistantDraftSchema,
  expectedVersion: z.number().int().positive().optional(),
  expectedDraftVersion: z.number().int().positive().optional(),
});

function buildSourceStatusMeta(status?: string) {
  const normalized = normalizeSourceStatusCode(status);
  if (!normalized) {
    return null;
  }

  return { statusCode: normalized };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuthenticatedApiRequest();
    const params = ParamsSchema.parse(await context.params);
    const { creationAssistant } = createServerUseCases();
    const draftState = await creationAssistant.getProjectCreationDraft.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
    });

    return apiSuccessResponse({
      draft: draftState
        ? {
            ...draftState,
            draft: redactAssistantDraft(draftState.draft),
          }
        : null,
      draftVersion: draftState?.version ?? null,
      sourceStatus: draftState
        ? buildSourceStatusMeta(draftState.draft.sourceStatus)
        : null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuthenticatedApiRequest();
    const params = ParamsSchema.parse(await context.params);
    const requestContext = buildCreationTelemetryContextFromRequest(request);
    const body = SaveDraftBodySchema.parse(await request.json());
    const { creationAssistant } = createServerUseCases();
    const previousDraftState =
      await creationAssistant.getProjectCreationDraft.execute({
        ownerIdentity: auth.identity,
        projectId: params.projectId,
      });
    const draftState = await creationAssistant.saveProjectCreationDraft.execute(
      {
        ownerIdentity: auth.identity,
        projectId: params.projectId,
        draft: body.draft,
        ...(body.expectedVersion || body.expectedDraftVersion
          ? {
              expectedVersion:
                body.expectedVersion ?? body.expectedDraftVersion,
            }
          : {}),
      },
    );
    await runCreationTelemetryFanout([
      () =>
        recordCreationDraftSaved({
          projectId: params.projectId,
          ownerIdentity: auth.identity,
          route: "PUT /api/projects/:id/creation-draft",
          viaAlias: false,
          draftVersion: draftState.version,
          requestContext,
        }),
      () =>
        recordCreationSourceStatusChanged({
          projectId: params.projectId,
          ownerIdentity: auth.identity,
          fromStatus: previousDraftState?.draft.sourceStatus,
          toStatus: draftState.draft.sourceStatus,
          startStrategy: draftState.draft.startStrategy,
          startSource: draftState.draft.startSource,
          phase: "draft",
          requestContext,
        }),
    ]);

    return apiSuccessResponse({
      draft: {
        ...draftState,
        draft: redactAssistantDraft(draftState.draft),
      },
      newDraftVersion: draftState.version,
      sourceStatus: buildSourceStatusMeta(draftState.draft.sourceStatus),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
