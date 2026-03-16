import { Prisma, type PrismaClient } from "@prisma/client";
import { AppError } from "@/src/lib/app-error";
import {
  AssistantCreationSettingsSchema,
  AssistantDraftSchema,
  assertNoSensitiveValues,
  redactAssistantCreationSettings,
  redactAssistantDraft,
  type AssistantCreationSettings,
} from "@/src/modules/creation-assistant/domain";
import type {
  ProjectCreationAppliedState,
  ProjectCreationDraftState,
  ProjectCreationSettingsSummary,
  ProjectCreationStateRepository,
} from "@/src/modules/creation-assistant/application";

type PrismaProjectCreationSettingsDelegate = PrismaClient["projectCreationSettings"];
type PrismaProjectCreationDraftDelegate = PrismaClient["projectCreationDraft"];

type AppliedSettingsRow = {
  profile: string | null;
  startStrategy: string | null;
  startSource: string | null;
  templatePreset: string | null;
  initialView: string | null;
  layout: string | null;
  detailLevel: string | null;
  sourceConfig: unknown;
  automation: unknown;
  context: unknown;
  appliedSettings: unknown;
  appliedVersion: number;
  appliedAt: Date | null;
  appliedByIdentity: string | null;
};

type DraftRow = {
  draftPayloadJson: unknown;
  draftVersion: number;
  updatedAt: Date;
  updatedByIdentity: string | null;
};

function toNullableJsonValue(
  value: unknown,
): Prisma.InputJsonValue | Prisma.JsonNullValueInput {
  if (value === undefined) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}

function toAppliedStateDomain(
  row: AppliedSettingsRow | null,
): ProjectCreationAppliedState | null {
  if (!row) {
    return null;
  }

  const parsedFromAppliedJson = AssistantCreationSettingsSchema.safeParse(
    row.appliedSettings ?? undefined,
  );
  const parsedFromLegacyColumns = AssistantCreationSettingsSchema.safeParse({
    profile: row.profile ?? undefined,
    startStrategy: row.startStrategy ?? undefined,
    startSource: row.startSource ?? undefined,
    templatePreset: row.templatePreset ?? undefined,
    initialView: row.initialView ?? undefined,
    layout: row.layout ?? undefined,
    detailLevel: row.detailLevel ?? undefined,
    sourceConfig: row.sourceConfig ?? undefined,
    automation: row.automation ?? undefined,
    context: row.context ?? undefined,
  });

  const settingsParsed = parsedFromAppliedJson.success
    ? parsedFromAppliedJson.data
    : parsedFromLegacyColumns.success
      ? parsedFromLegacyColumns.data
      : null;

  if (!settingsParsed) {
    return null;
  }

  const settings = redactAssistantCreationSettings(settingsParsed);
  assertNoSensitiveValues({ value: settings, context: "applied-settings-read" });

  return {
    settings,
    version: row.appliedVersion ?? 1,
    ...(row.appliedAt ? { appliedAt: row.appliedAt } : {}),
    ...(row.appliedByIdentity ? { appliedByIdentity: row.appliedByIdentity } : {}),
  };
}

function toDraftStateDomain(row: DraftRow | null): ProjectCreationDraftState | null {
  if (!row) {
    return null;
  }

  const parsed = AssistantDraftSchema.safeParse(row.draftPayloadJson);
  if (!parsed.success) {
    return null;
  }

  const draft = redactAssistantDraft(parsed.data);
  assertNoSensitiveValues({ value: draft, context: "draft-read" });

  return {
    draft,
    version: row.draftVersion,
    updatedAt: row.updatedAt,
    ...(row.updatedByIdentity ? { updatedByIdentity: row.updatedByIdentity } : {}),
  };
}

function toAppliedPersistenceData(settings: AssistantCreationSettings) {
  return {
    profile: settings.profile,
    startStrategy: settings.startStrategy,
    startSource: settings.startSource ?? null,
    templatePreset: settings.templatePreset ?? null,
    initialView: settings.initialView,
    layout: settings.layout,
    detailLevel: settings.detailLevel,
    sourceConfig: toNullableJsonValue(settings.sourceConfig),
    automation: toNullableJsonValue(settings.automation),
    context: toNullableJsonValue(settings.context),
    appliedSettings: toNullableJsonValue(settings),
  };
}

export class PrismaProjectCreationStateRepository
  implements ProjectCreationStateRepository
{
  constructor(
    private readonly settingsDelegate: PrismaProjectCreationSettingsDelegate,
    private readonly draftDelegate: PrismaProjectCreationDraftDelegate,
  ) {}

  async findAppliedByProjectId(
    projectId: string,
  ): Promise<ProjectCreationAppliedState | null> {
    const row = await this.settingsDelegate.findUnique({
      where: { projectId },
      select: {
        profile: true,
        startStrategy: true,
        startSource: true,
        templatePreset: true,
        initialView: true,
        layout: true,
        detailLevel: true,
        sourceConfig: true,
        automation: true,
        context: true,
        appliedSettings: true,
        appliedVersion: true,
        appliedAt: true,
        appliedByIdentity: true,
      },
    });

    return toAppliedStateDomain(row);
  }

  async getSettingsSummaryByProjectId(
    projectId: string,
  ): Promise<ProjectCreationSettingsSummary> {
    const [appliedRow, draftRow] = await Promise.all([
      this.settingsDelegate.findUnique({
        where: { projectId },
        select: {
          profile: true,
          startStrategy: true,
          startSource: true,
          templatePreset: true,
          initialView: true,
          layout: true,
          detailLevel: true,
          sourceConfig: true,
          automation: true,
          context: true,
          appliedSettings: true,
          appliedVersion: true,
          appliedAt: true,
          appliedByIdentity: true,
        },
      }),
      this.draftDelegate.findUnique({
        where: { projectId },
        select: {
          draftVersion: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      applied: toAppliedStateDomain(appliedRow),
      draftExists: Boolean(draftRow),
      ...(draftRow ? { draftVersion: draftRow.draftVersion } : {}),
      ...(draftRow ? { draftUpdatedAt: draftRow.updatedAt } : {}),
    };
  }

  async findDraftByProjectId(
    projectId: string,
  ): Promise<ProjectCreationDraftState | null> {
    const row = await this.draftDelegate.findUnique({
      where: { projectId },
      select: {
        draftPayloadJson: true,
        draftVersion: true,
        updatedAt: true,
        updatedByIdentity: true,
      },
    });

    return toDraftStateDomain(row);
  }

  async saveAppliedByProjectId(input: {
    projectId: string;
    settings: AssistantCreationSettings;
    appliedByIdentity?: string;
  }): Promise<ProjectCreationAppliedState> {
    const parsed = AssistantCreationSettingsSchema.parse(input.settings);
    const redacted = redactAssistantCreationSettings(parsed);
    assertNoSensitiveValues({ value: redacted, context: "applied-settings-save" });

    const persistenceData = toAppliedPersistenceData(redacted);
    const existing = await this.settingsDelegate.findUnique({
      where: { projectId: input.projectId },
      select: {
        appliedVersion: true,
      },
    });

    const row = existing
      ? await this.settingsDelegate.update({
          where: { projectId: input.projectId },
          data: {
            ...persistenceData,
            appliedVersion: { increment: 1 },
            appliedAt: new Date(),
            appliedByIdentity: input.appliedByIdentity ?? null,
          },
          select: {
            profile: true,
            startStrategy: true,
            startSource: true,
            templatePreset: true,
            initialView: true,
            layout: true,
            detailLevel: true,
            sourceConfig: true,
            automation: true,
            context: true,
            appliedSettings: true,
            appliedVersion: true,
            appliedAt: true,
            appliedByIdentity: true,
          },
        })
      : await this.settingsDelegate.create({
          data: {
            projectId: input.projectId,
            ...persistenceData,
            appliedVersion: 1,
            appliedAt: new Date(),
            appliedByIdentity: input.appliedByIdentity ?? null,
          },
          select: {
            profile: true,
            startStrategy: true,
            startSource: true,
            templatePreset: true,
            initialView: true,
            layout: true,
            detailLevel: true,
            sourceConfig: true,
            automation: true,
            context: true,
            appliedSettings: true,
            appliedVersion: true,
            appliedAt: true,
            appliedByIdentity: true,
          },
        });

    const state = toAppliedStateDomain(row);
    if (!state) {
      throw new Error("Falha ao normalizar configuracoes aplicadas.");
    }

    return state;
  }

  async saveDraftByProjectId(input: {
    projectId: string;
    draft: import("@/src/modules/creation-assistant/domain").AssistantDraft;
    expectedVersion?: number;
    updatedByIdentity?: string;
  }): Promise<ProjectCreationDraftState> {
    const parsedDraft = AssistantDraftSchema.parse(input.draft);
    const redacted = redactAssistantDraft(parsedDraft);
    assertNoSensitiveValues({ value: redacted, context: "draft-save" });

    const existing = await this.draftDelegate.findUnique({
      where: { projectId: input.projectId },
      select: {
        draftPayloadJson: true,
        draftVersion: true,
        updatedAt: true,
        updatedByIdentity: true,
      },
    });

    if (
      existing &&
      input.expectedVersion &&
      existing.draftVersion !== input.expectedVersion
    ) {
      const latestDraft = toDraftStateDomain(existing);
      throw new AppError("Rascunho desatualizado. Atualize antes de salvar.", {
        code: "CREATION_DRAFT_VERSION_CONFLICT",
        status: 409,
        details: {
          expectedVersion: input.expectedVersion,
          actualVersion: existing.draftVersion,
          latestDraft: latestDraft?.draft ?? null,
          latestUpdatedAt: existing.updatedAt.toISOString(),
        },
      });
    }

    const row = existing
      ? await this.draftDelegate.update({
          where: { projectId: input.projectId },
          data: {
            draftPayloadJson: toNullableJsonValue(redacted),
            draftVersion: { increment: 1 },
            updatedByIdentity: input.updatedByIdentity ?? null,
          },
          select: {
            draftPayloadJson: true,
            draftVersion: true,
            updatedAt: true,
            updatedByIdentity: true,
          },
        })
      : await this.draftDelegate.create({
          data: {
            projectId: input.projectId,
            draftPayloadJson: toNullableJsonValue(redacted),
            draftVersion: 1,
            updatedByIdentity: input.updatedByIdentity ?? null,
          },
          select: {
            draftPayloadJson: true,
            draftVersion: true,
            updatedAt: true,
            updatedByIdentity: true,
          },
        });

    const state = toDraftStateDomain(row);
    if (!state) {
      throw new Error("Falha ao normalizar rascunho salvo.");
    }

    return state;
  }
}
