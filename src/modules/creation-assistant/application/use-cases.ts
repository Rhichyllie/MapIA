import { GraphSnapshotSchema, type GraphSnapshot } from "@/src/domain";
import { AppError } from "@/src/lib/app-error";
import { ensureSlug } from "@/src/lib/slug";
import type { WorkingSnapshotRepository } from "@/src/modules/graph/application";
import {
  applyDiagramLayoutToSnapshot,
  isSupportedDiagramType,
  resolveDiagramLayoutOptions,
} from "@/src/modules/graph/domain";
import { importPrismaSchemaToGraphSnapshot } from "@/src/modules/importing/domain/prisma-schema-importer";
import type { ProjectRepository } from "@/src/modules/projects/application";
import type { ProjectTemplate } from "@/src/modules/projects/domain";
import type { WorkspaceRepository } from "@/src/modules/workspaces/application";
import {
  AssistantCreationSettingsSchema,
  AssistantDraftSchema,
  applyResolvedSourceLifecycleToDraft,
  applyResolvedSourceLifecycleToSettings,
  buildDefaultContextForView,
  buildInitialSeedGraph,
  buildWhatWillBeCreatedSummary,
  normalizeLayoutForView,
  normalizeSourceStatusCode,
  redactAssistantCreationSettings,
  redactAssistantDraft,
  resolveDiagramTypeForInitialView,
  resolveRecommendedLayout,
  validateStrictByRecipe,
  type AssistantCreationSettings,
  type AssistantDraft,
  type InitialView,
  type LayoutChoice,
  type ProjectProfile,
} from "@/src/modules/creation-assistant/domain";
import {
  ApplyAssistantDraftToProjectInputSchema,
  ApplyProjectCreationInputSchema,
  CreateProjectWithAssistantInputSchema,
  GetProjectCreationDraftInputSchema,
  GetProjectCreationSettingsInputSchema,
  SaveProjectCreationDraftInputSchema,
  SaveProjectCreationSettingsInputSchema,
  type ApplyAssistantDraftToProjectInput,
  type ApplyProjectCreationInput,
  type CreateProjectWithAssistantInput,
  type GetProjectCreationDraftInput,
  type GetProjectCreationSettingsInput,
  type SaveProjectCreationDraftInput,
  type SaveProjectCreationSettingsInput,
} from "./schemas";
import type { ProjectCreationStateRepository } from "./ports";

type CreationAssistantUseCaseDeps = {
  workspaceRepository: WorkspaceRepository;
  projectRepository: ProjectRepository;
  workingSnapshotRepository: WorkingSnapshotRepository;
  projectCreationStateRepository: ProjectCreationStateRepository;
};

type ApplyCreationResult = {
  projectId: string;
  redirectUrl: string;
  whatWillBeCreated: string;
  appliedAt?: Date;
  appliedVersion: number;
  appliedSettings: AssistantCreationSettings;
  initialSnapshot?: GraphSnapshot;
};

function normalizeOptionalString(input?: string) {
  const trimmed = input?.trim();
  return trimmed ? trimmed : undefined;
}

function buildPrimaryWorkspaceName(ownerIdentity: string) {
  return `Workspace ${ownerIdentity}`;
}

function buildPrimaryWorkspaceSlug(ownerIdentity: string) {
  return `ws-${ensureSlug(ownerIdentity, "principal")}`.slice(0, 80);
}

function resolveLegacyTemplateFromProfile(
  profile: ProjectProfile,
  initialView: InitialView,
): ProjectTemplate {
  if (initialView === "erd" || profile === "data-model") {
    return "erd";
  }

  if (initialView === "flow" || profile === "process") {
    return "flowchart";
  }

  if (
    initialView === "sitemap" ||
    profile === "information-structure" ||
    profile === "documents-governance"
  ) {
    return "sitemap";
  }

  return "graph";
}

function applyErdRelationalLayout(snapshot: GraphSnapshot): GraphSnapshot {
  const entityNodes = snapshot.nodes
    .filter((node) => node.kind === "entity")
    .sort((a, b) => a.label.localeCompare(b.label));

  if (entityNodes.length === 0) {
    return snapshot;
  }

  const columns = Math.max(2, Math.min(4, Math.ceil(Math.sqrt(entityNodes.length))));
  const grid = new Map<string, { x: number; y: number }>();

  for (let index = 0; index < entityNodes.length; index += 1) {
    const node = entityNodes[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const centeredColumn = column - (columns - 1) / 2;

    grid.set(node.id, {
      x: centeredColumn * 340,
      y: row * 220,
    });
  }

  return {
    ...snapshot,
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      position: grid.get(node.id) ?? node.position,
    })),
  };
}

function buildLayoutOptions(input: {
  initialView: InitialView;
  layout: LayoutChoice;
  context: AssistantCreationSettings["context"];
}) {
  const diagramType = resolveDiagramTypeForInitialView(input.initialView);

  if (diagramType === "tree" || diagramType === "sitemap") {
    const direction =
      input.layout === "horizontal"
        ? "left-right"
        : input.layout === "vertical"
          ? "top-down"
          : input.context.hierarchy?.direction === "left-right"
            ? "left-right"
            : "top-down";

    return resolveDiagramLayoutOptions("tree", {
      direction,
    });
  }

  if (diagramType === "flow") {
    const direction =
      input.layout === "vertical"
        ? "top-down"
        : input.layout === "horizontal"
          ? "left-right"
          : input.context.flow?.direction ?? "left-right";

    return resolveDiagramLayoutOptions("flow", {
      direction,
    });
  }

  if (diagramType === "mindmap") {
    return resolveDiagramLayoutOptions("mindmap");
  }

  return {
    type: input.layout,
  };
}

function applyPreferredLayout(
  snapshot: GraphSnapshot,
  settings: AssistantCreationSettings,
): GraphSnapshot {
  const diagramType = resolveDiagramTypeForInitialView(settings.initialView);
  const layoutOptions = buildLayoutOptions({
    initialView: settings.initialView,
    layout: settings.layout,
    context: settings.context,
  });

  if (settings.initialView === "sitemap") {
    const laidOut = applyDiagramLayoutToSnapshot(
      {
        ...snapshot,
        diagramType: "tree",
      },
      "tree",
      layoutOptions,
    );

    return {
      ...laidOut,
      diagramType: "sitemap",
      layoutOptions,
    };
  }

  if (isSupportedDiagramType(diagramType)) {
    return applyDiagramLayoutToSnapshot(snapshot, diagramType, layoutOptions);
  }

  if (settings.initialView === "erd" && settings.layout !== "free") {
    return {
      ...applyErdRelationalLayout(snapshot),
      layoutOptions,
    };
  }

  return {
    ...snapshot,
    layoutOptions,
  };
}

function buildInitialMapSnapshot(input: {
  projectId: string;
  draft: AssistantDraft;
  settings: AssistantCreationSettings;
}) {
  const diagramType = resolveDiagramTypeForInitialView(input.settings.initialView);
  const layoutOptions = buildLayoutOptions({
    initialView: input.settings.initialView,
    layout: input.settings.layout,
    context: input.settings.context,
  });

  const prismaImportConfig =
    (input.settings.startStrategy === "import" ||
      input.settings.startStrategy === "hybrid") &&
    input.settings.startSource === "prisma-schema" &&
    input.settings.sourceConfig?.kind === "prisma-schema" &&
    input.settings.sourceConfig.schemaText?.trim()
      ? input.settings.sourceConfig
      : null;

  const prismaSchemaText = prismaImportConfig?.schemaText?.trim();

  if (prismaImportConfig && prismaSchemaText) {
    const imported = importPrismaSchemaToGraphSnapshot({
      projectId: input.projectId,
      schemaText: prismaSchemaText,
    }).snapshot;

    const base = GraphSnapshotSchema.parse({
      ...imported,
      diagramType,
      layoutOptions,
      rootNodeName: undefined,
      allowReapplyLayout: input.settings.automation.autoOrganizeOnCreate,
    });

    return applyPreferredLayout(base, input.settings);
  }

  const seeded = buildInitialSeedGraph({
    projectId: input.projectId,
    draft: input.draft,
    settings: input.settings,
  });

  const baseSnapshot = GraphSnapshotSchema.parse({
    nodes: seeded.nodes,
    edges: seeded.edges,
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    diagramType,
    layoutOptions,
    rootNodeName: seeded.rootNodeName,
    allowReapplyLayout: input.settings.automation.autoOrganizeOnCreate,
  });

  return applyPreferredLayout(baseSnapshot, input.settings);
}

function toSettingsFromDraft(draft: AssistantDraft): AssistantCreationSettings {
  const parsed = AssistantCreationSettingsSchema.parse({
    profile: draft.profile,
    startStrategy: draft.startStrategy,
    ...(draft.startSource ? { startSource: draft.startSource } : {}),
    ...(draft.templatePreset ? { templatePreset: draft.templatePreset } : {}),
    ...(draft.sourceConfig ? { sourceConfig: draft.sourceConfig } : {}),
    ...(draft.sourceStatus ? { sourceStatus: draft.sourceStatus } : {}),
    ...(draft.precheckResult ? { precheckResult: draft.precheckResult } : {}),
    ...(draft.lastError ? { lastError: draft.lastError } : {}),
    ...(draft.lastCheckedAt ? { lastCheckedAt: draft.lastCheckedAt } : {}),
    initialView: draft.initialView,
    layout: draft.layout,
    detailLevel: draft.detailLevel,
    automation: draft.automation,
    context: draft.context,
  });
  return redactAssistantCreationSettings(
    applyResolvedSourceLifecycleToSettings(parsed),
  );
}

function resolveDraftWithDefaults(draft: AssistantDraft): AssistantDraft {
  const baseContext = buildDefaultContextForView(draft.initialView, draft.profile);
  const layoutDecision = normalizeLayoutForView({
    profile: draft.profile,
    initialView: draft.initialView,
    layout: draft.layout ?? resolveRecommendedLayout(draft.initialView, draft.profile),
  });

  return AssistantDraftSchema.parse({
    ...draft,
    layout: layoutDecision.layout,
    context: {
      ...baseContext,
      ...draft.context,
    },
  });
}

function sanitizeDraftForPersistence(draft: AssistantDraft) {
  const draftWithDefaults = resolveDraftWithDefaults(draft);
  const withLifecycle = applyResolvedSourceLifecycleToDraft(draftWithDefaults);
  return redactAssistantDraft(withLifecycle);
}

async function getOrCreatePrimaryWorkspace(
  workspaceRepository: WorkspaceRepository,
  ownerIdentity: string,
) {
  const workspaces = await workspaceRepository.findByOwnerIdentity(ownerIdentity);
  if (workspaces.length > 0) {
    return workspaces[0];
  }

  return workspaceRepository.create({
    slug: buildPrimaryWorkspaceSlug(ownerIdentity),
    name: buildPrimaryWorkspaceName(ownerIdentity),
    ownerIdentity,
  });
}

async function resolveUniqueProjectSlug(input: {
  workspaceId: string;
  projectName: string;
  projectRepository: ProjectRepository;
}) {
  const baseSlug = ensureSlug(input.projectName, "project");
  let nextSlug = baseSlug;
  let suffix = 2;

  while (
    await input.projectRepository.findByWorkspaceIdAndSlug(
      input.workspaceId,
      nextSlug,
    )
  ) {
    nextSlug = `${baseSlug}-${suffix}`.slice(0, 80);
    suffix += 1;
  }

  return nextSlug;
}

async function assertProjectOwnership(
  deps: Pick<
    CreationAssistantUseCaseDeps,
    "projectRepository" | "workspaceRepository"
  >,
  input: { ownerIdentity: string; projectId: string },
) {
  const project = await deps.projectRepository.findById(input.projectId);

  if (!project) {
    throw new AppError("Projeto nao encontrado.", {
      code: "PROJECT_NOT_FOUND",
      status: 404,
    });
  }

  const workspace = await deps.workspaceRepository.findById(project.workspaceId);

  if (!workspace || workspace.ownerIdentity !== input.ownerIdentity) {
    throw new AppError("Projeto nao encontrado para o usuario autenticado.", {
      code: "PROJECT_NOT_FOUND",
      status: 404,
    });
  }

  return project;
}

async function applyCreationToProject(input: {
  deps: CreationAssistantUseCaseDeps;
  ownerIdentity: string;
  projectId: string;
  createInitialMap: boolean;
  explicitDraft?: AssistantDraft;
}): Promise<ApplyCreationResult> {
  const project = await assertProjectOwnership(input.deps, {
    ownerIdentity: input.ownerIdentity,
    projectId: input.projectId,
  });

  const draftFromState = input.explicitDraft
    ? input.explicitDraft
    : (await input.deps.projectCreationStateRepository.findDraftByProjectId(
        project.id,
      ))?.draft;

  if (!draftFromState) {
    throw new AppError(
      "Nenhum rascunho de criacao encontrado para aplicar neste projeto.",
      {
        code: "CREATION_DRAFT_NOT_FOUND",
        status: 404,
      },
    );
  }

  const draft = sanitizeDraftForPersistence(draftFromState);
  const strictValidation = validateStrictByRecipe(draft);

  if (!strictValidation.ok) {
    throw new AppError(
      "Rascunho nao atende validacao estrita para aplicacao.",
      {
        code: "CREATION_DRAFT_STRICT_VALIDATION_FAILED",
        status: 422,
        details: {
          blockingIssues: strictValidation.blockingIssues,
          warnings: strictValidation.warnings,
          profile: draft.profile,
          initialView: draft.initialView,
        },
      },
    );
  }

  if (input.explicitDraft) {
    await input.deps.projectCreationStateRepository.saveDraftByProjectId({
      projectId: project.id,
      draft,
      updatedByIdentity: input.ownerIdentity,
    });
  }

  const settings = toSettingsFromDraft(draft);
  const settingsForApply =
    input.createInitialMap &&
    settings.startSource === "prisma-schema" &&
    normalizeSourceStatusCode(settings.sourceStatus) === "ready_to_attempt_import"
      ? applyResolvedSourceLifecycleToSettings(settings, {
          markAsImported: true,
        })
      : settings;
  const template = resolveLegacyTemplateFromProfile(
    settingsForApply.profile,
    settingsForApply.initialView,
  );

  await input.deps.projectRepository.updateMetadata({
    projectId: project.id,
    name: draft.projectName.trim(),
    description: normalizeOptionalString(draft.projectObjective),
    template,
  });

  const applied = await input.deps.projectCreationStateRepository.saveAppliedByProjectId({
    projectId: project.id,
    settings: settingsForApply,
    appliedByIdentity: input.ownerIdentity,
  });

  let initialSnapshot: GraphSnapshot | undefined;
  if (input.createInitialMap) {
    initialSnapshot = buildInitialMapSnapshot({
      projectId: project.id,
      draft,
      settings: applied.settings,
    });

    await input.deps.workingSnapshotRepository.save({
      projectId: project.id,
      snapshot: initialSnapshot,
      actorIdentity: input.ownerIdentity,
      label: "mapa-inicial-v1",
    });
  }

  return {
    projectId: project.id,
    redirectUrl: `/editor?projectId=${project.id}`,
    whatWillBeCreated: buildWhatWillBeCreatedSummary({
      profile: applied.settings.profile,
      initialView: applied.settings.initialView,
      layout: applied.settings.layout,
      automation: applied.settings.automation,
      sourceStatus: applied.settings.sourceStatus,
    }),
    appliedAt: applied.appliedAt,
    appliedVersion: applied.version,
    appliedSettings: applied.settings,
    ...(initialSnapshot ? { initialSnapshot } : {}),
  };
}

export class GetProjectCreationSettingsUseCase {
  constructor(private readonly deps: CreationAssistantUseCaseDeps) {}

  async execute(input: GetProjectCreationSettingsInput) {
    const parsed = GetProjectCreationSettingsInputSchema.parse(input);
    await assertProjectOwnership(this.deps, {
      ownerIdentity: parsed.ownerIdentity,
      projectId: parsed.projectId,
    });

    const applied = await this.deps.projectCreationStateRepository.findAppliedByProjectId(
      parsed.projectId,
    );
    return applied?.settings ?? null;
  }
}

export class GetProjectCreationSettingsSummaryUseCase {
  constructor(private readonly deps: CreationAssistantUseCaseDeps) {}

  async execute(input: GetProjectCreationSettingsInput) {
    const parsed = GetProjectCreationSettingsInputSchema.parse(input);
    await assertProjectOwnership(this.deps, {
      ownerIdentity: parsed.ownerIdentity,
      projectId: parsed.projectId,
    });

    return this.deps.projectCreationStateRepository.getSettingsSummaryByProjectId(
      parsed.projectId,
    );
  }
}

export class SaveProjectCreationSettingsUseCase {
  constructor(private readonly deps: CreationAssistantUseCaseDeps) {}

  async execute(input: SaveProjectCreationSettingsInput) {
    const parsed = SaveProjectCreationSettingsInputSchema.parse(input);
    await assertProjectOwnership(this.deps, {
      ownerIdentity: parsed.ownerIdentity,
      projectId: parsed.projectId,
    });

    return this.deps.projectCreationStateRepository.saveAppliedByProjectId({
      projectId: parsed.projectId,
      settings: redactAssistantCreationSettings(parsed.settings),
      appliedByIdentity: parsed.ownerIdentity,
    });
  }
}

export class GetProjectCreationDraftUseCase {
  constructor(private readonly deps: CreationAssistantUseCaseDeps) {}

  async execute(input: GetProjectCreationDraftInput) {
    const parsed = GetProjectCreationDraftInputSchema.parse(input);
    await assertProjectOwnership(this.deps, {
      ownerIdentity: parsed.ownerIdentity,
      projectId: parsed.projectId,
    });

    return this.deps.projectCreationStateRepository.findDraftByProjectId(
      parsed.projectId,
    );
  }
}

export class SaveProjectCreationDraftUseCase {
  constructor(private readonly deps: CreationAssistantUseCaseDeps) {}

  async execute(input: SaveProjectCreationDraftInput) {
    const parsed = SaveProjectCreationDraftInputSchema.parse(input);
    await assertProjectOwnership(this.deps, {
      ownerIdentity: parsed.ownerIdentity,
      projectId: parsed.projectId,
    });

    return this.deps.projectCreationStateRepository.saveDraftByProjectId({
      projectId: parsed.projectId,
      draft: sanitizeDraftForPersistence(parsed.draft),
      ...(parsed.expectedVersion
        ? { expectedVersion: parsed.expectedVersion }
        : {}),
      updatedByIdentity: parsed.ownerIdentity,
    });
  }
}

export class CreateProjectWithAssistantUseCase {
  constructor(private readonly deps: CreationAssistantUseCaseDeps) {}

  async execute(input: CreateProjectWithAssistantInput) {
    const parsed = CreateProjectWithAssistantInputSchema.parse(input);
    const draft = sanitizeDraftForPersistence(parsed.draft);
    const workspace = await getOrCreatePrimaryWorkspace(
      this.deps.workspaceRepository,
      parsed.ownerIdentity,
    );
    const slug = await resolveUniqueProjectSlug({
      workspaceId: workspace.id,
      projectName: draft.projectName,
      projectRepository: this.deps.projectRepository,
    });
    const template = resolveLegacyTemplateFromProfile(
      draft.profile,
      draft.initialView,
    );

    const project = await this.deps.projectRepository.create({
      workspaceId: workspace.id,
      slug,
      name: draft.projectName.trim(),
      description: normalizeOptionalString(draft.projectObjective),
      template,
    });

    await this.deps.projectCreationStateRepository.saveDraftByProjectId({
      projectId: project.id,
      draft,
      updatedByIdentity: parsed.ownerIdentity,
    });

    const settings = toSettingsFromDraft(draft);
    const settingsForApply =
      settings.startSource === "prisma-schema" &&
      normalizeSourceStatusCode(settings.sourceStatus) === "ready_to_attempt_import"
        ? applyResolvedSourceLifecycleToSettings(settings, {
            markAsImported: true,
          })
        : settings;
    const applied = await this.deps.projectCreationStateRepository.saveAppliedByProjectId(
      {
        projectId: project.id,
        settings: settingsForApply,
        appliedByIdentity: parsed.ownerIdentity,
      },
    );

    const initialSnapshot = buildInitialMapSnapshot({
      projectId: project.id,
      draft,
      settings: applied.settings,
    });

    await this.deps.workingSnapshotRepository.save({
      projectId: project.id,
      snapshot: initialSnapshot,
      actorIdentity: parsed.ownerIdentity,
      label: "mapa-inicial-v1",
    });

    return {
      projectId: project.id,
      initialSnapshot,
      redirectUrl: `/editor?projectId=${project.id}`,
      whatWillBeCreated: buildWhatWillBeCreatedSummary({
        profile: applied.settings.profile,
        initialView: applied.settings.initialView,
        layout: applied.settings.layout,
        automation: applied.settings.automation,
        sourceStatus: applied.settings.sourceStatus,
      }),
      appliedAt: applied.appliedAt,
      appliedVersion: applied.version,
      appliedSettings: applied.settings,
    };
  }
}

export class ApplyProjectCreationUseCase {
  constructor(private readonly deps: CreationAssistantUseCaseDeps) {}

  async execute(input: ApplyProjectCreationInput) {
    const parsed = ApplyProjectCreationInputSchema.parse(input);
    return applyCreationToProject({
      deps: this.deps,
      ownerIdentity: parsed.ownerIdentity,
      projectId: parsed.projectId,
      createInitialMap: parsed.createInitialMap,
      ...(parsed.draft ? { explicitDraft: parsed.draft } : {}),
    });
  }
}

export class ApplyAssistantDraftToProjectUseCase {
  constructor(private readonly deps: CreationAssistantUseCaseDeps) {}

  async execute(input: ApplyAssistantDraftToProjectInput) {
    const parsed = ApplyAssistantDraftToProjectInputSchema.parse(input);
    return applyCreationToProject({
      deps: this.deps,
      ownerIdentity: parsed.ownerIdentity,
      projectId: parsed.projectId,
      createInitialMap: true,
      explicitDraft: parsed.draft,
    });
  }
}
