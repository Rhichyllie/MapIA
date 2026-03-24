import { z } from "zod";
import { AppError } from "@/src/lib/app-error";
import {
  AssistantCreationSettingsSchema,
  AssistantDraftSchema,
  normalizeSourceStatusCode,
  redactAssistantCreationSettings,
  redactAssistantDraft,
} from "@/src/modules/creation-assistant/domain";
import {
  apiErrorResponse,
  apiSuccessResponse,
  unauthorizedResponse,
} from "@/src/server/app/api-response";
import {
  buildCreationTelemetryContextFromRequest,
  recordCreationDraftSaved,
  recordCreationSettingsAliasPut,
  recordCreationSourceStatusChanged,
  runCreationTelemetryFanout,
} from "@/src/server/observability/creation-assistant-transition-telemetry";
import { createServerUseCases } from "@/src/server/app/container";
import { getApiSessionIdentity } from "@/src/server/auth/api-session";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const DraftAliasBodySchema = z.object({
  draft: AssistantDraftSchema.optional(),
  settings: AssistantCreationSettingsSchema.optional(),
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
    const auth = await getApiSessionIdentity();

    if (!auth) {
      return unauthorizedResponse();
    }

    const params = ParamsSchema.parse(await context.params);
    const { creationAssistant } = createServerUseCases();
    const [settings, summary] = await Promise.all([
      creationAssistant.getProjectCreationSettings.execute({
        ownerIdentity: auth.identity,
        projectId: params.projectId,
      }),
      creationAssistant.getProjectCreationSettingsSummary.execute({
        ownerIdentity: auth.identity,
        projectId: params.projectId,
      }),
    ]);

    const safeSettings = settings ? redactAssistantCreationSettings(settings) : null;

    return apiSuccessResponse({
      settings: safeSettings,
      appliedSettings: safeSettings,
      appliedVersion: summary.applied?.version ?? null,
      appliedAt: summary.applied?.appliedAt?.toISOString() ?? null,
      draftExists: summary.draftExists,
      draftVersion: summary.draftVersion ?? null,
      draftUpdatedAt: summary.draftUpdatedAt?.toISOString() ?? null,
      sourceStatus: buildSourceStatusMeta(safeSettings?.sourceStatus),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function toDraftFromSettingsAlias(input: {
  settings: z.infer<typeof AssistantCreationSettingsSchema>;
  projectName: string;
  projectObjective?: string | null;
}) {
  return AssistantDraftSchema.parse({
    projectName: input.projectName,
    ...(input.projectObjective ? { projectObjective: input.projectObjective } : {}),
    profile: input.settings.profile,
    startStrategy: input.settings.startStrategy,
    ...(input.settings.startSource ? { startSource: input.settings.startSource } : {}),
    ...(input.settings.templatePreset
      ? { templatePreset: input.settings.templatePreset }
      : {}),
    ...(input.settings.sourceConfig ? { sourceConfig: input.settings.sourceConfig } : {}),
    ...(input.settings.sourceStatus ? { sourceStatus: input.settings.sourceStatus } : {}),
    ...(input.settings.precheckResult
      ? { precheckResult: input.settings.precheckResult }
      : {}),
    ...(input.settings.lastError ? { lastError: input.settings.lastError } : {}),
    ...(input.settings.lastCheckedAt
      ? { lastCheckedAt: input.settings.lastCheckedAt }
      : {}),
    initialView: input.settings.initialView,
    layout: input.settings.layout,
    detailLevel: input.settings.detailLevel,
    automation: input.settings.automation,
    context: input.settings.context,
  });
}

export async function PUT(
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
    const rawBody = await request.json();
    const parsedAliasBody = DraftAliasBodySchema.safeParse(rawBody);
    const settingsOnly = AssistantCreationSettingsSchema.safeParse(rawBody);
    const draftOnly = AssistantDraftSchema.safeParse(rawBody);

    const body = parsedAliasBody.success
      ? parsedAliasBody.data
      : {
          ...(draftOnly.success ? { draft: draftOnly.data } : {}),
          ...(settingsOnly.success ? { settings: settingsOnly.data } : {}),
        };
    const { creationAssistant, projects } = createServerUseCases();
    const previousDraftState = await creationAssistant.getProjectCreationDraft.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
    });

    const projectForAlias = body.settings
      ? await projects.getOwnedProject.execute({
          ownerIdentity: auth.identity,
          projectId: params.projectId,
        })
      : null;

    const draft =
      body.draft ??
      (body.settings
        ? toDraftFromSettingsAlias({
            settings: body.settings,
            projectName: projectForAlias?.name ?? "Projeto",
            projectObjective: projectForAlias?.description,
          })
        : null);

    if (!draft) {
      throw new AppError("Envie draft ou settings para o alias de rascunho.", {
        code: "CREATION_DRAFT_PAYLOAD_REQUIRED",
        status: 400,
      });
    }

    const draftState = await creationAssistant.saveProjectCreationDraft.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
      draft,
      ...(body.expectedVersion || body.expectedDraftVersion
        ? { expectedVersion: body.expectedVersion ?? body.expectedDraftVersion }
        : {}),
    });
    await runCreationTelemetryFanout([
      () =>
        recordCreationSettingsAliasPut({
          projectId: params.projectId,
          ownerIdentity: auth.identity,
          route: "PUT /api/projects/:id/creation-settings",
          usedSettingsAliasPayload: Boolean(body.settings),
          requestContext,
        }),
      () =>
        recordCreationDraftSaved({
          projectId: params.projectId,
          ownerIdentity: auth.identity,
          route: "PUT /api/projects/:id/creation-settings",
          viaAlias: true,
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
      compatibilityAlias: true,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
