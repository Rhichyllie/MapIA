import { z } from "zod";
import {
  AssistantDraftSchema,
  redactAssistantDraft,
} from "@/src/modules/creation-assistant/domain";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import { requireProjectRouteContext } from "@/src/server/app/api-route-guards";
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const useCases = createServerUseCases();
    const { auth, params } = await requireProjectRouteContext({
      route: "GET /api/projects/[projectId]/creation-settings/draft",
      params: context.params,
      paramsSchema: ParamsSchema,
      minimumRole: "viewer",
      useCases,
    });
    const { creationAssistant } = useCases;
    const draft = await creationAssistant.getProjectCreationDraft.execute({
      actorUserId: auth.userId,
      ownerIdentity: auth.identity,
      projectId: params.projectId,
    });

    return apiSuccessResponse({
      draft: draft
        ? {
            ...draft,
            draft: redactAssistantDraft(draft.draft),
          }
        : null,
      compatibilityAlias: true,
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
    const useCases = createServerUseCases();
    const { auth, params } = await requireProjectRouteContext({
      route: "PUT /api/projects/[projectId]/creation-settings/draft",
      params: context.params,
      paramsSchema: ParamsSchema,
      minimumRole: "member",
      useCases,
    });
    const requestContext = buildCreationTelemetryContextFromRequest(request);
    const body = SaveDraftBodySchema.parse(await request.json());
    const { creationAssistant } = useCases;
    const previousDraft =
      await creationAssistant.getProjectCreationDraft.execute({
        actorUserId: auth.userId,
        ownerIdentity: auth.identity,
        projectId: params.projectId,
      });
    const draft = await creationAssistant.saveProjectCreationDraft.execute({
      actorUserId: auth.userId,
      ownerIdentity: auth.identity,
      projectId: params.projectId,
      draft: body.draft,
      ...(body.expectedVersion || body.expectedDraftVersion
        ? { expectedVersion: body.expectedVersion ?? body.expectedDraftVersion }
        : {}),
    });
    await runCreationTelemetryFanout([
      () =>
        recordCreationDraftSaved({
          projectId: params.projectId,
          ownerIdentity: auth.identity,
          route: "PUT /api/projects/:id/creation-settings/draft",
          viaAlias: true,
          draftVersion: draft.version,
          requestContext,
        }),
      () =>
        recordCreationSourceStatusChanged({
          projectId: params.projectId,
          ownerIdentity: auth.identity,
          fromStatus: previousDraft?.draft.sourceStatus,
          toStatus: draft.draft.sourceStatus,
          startStrategy: draft.draft.startStrategy,
          startSource: draft.draft.startSource,
          phase: "draft",
          requestContext,
        }),
    ]);

    return apiSuccessResponse({
      draft: {
        ...draft,
        draft: redactAssistantDraft(draft.draft),
      },
      newDraftVersion: draft.version,
      compatibilityAlias: true,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
