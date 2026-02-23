import { AppError } from "@/src/lib/app-error";
import { GraphSnapshotSchema, type GraphSnapshot } from "@/src/domain";
import type {
  WorkingSnapshotRepository,
  WorkingSnapshotRecord,
} from "@/src/modules/graph/application";
import type {
  ProjectRepository,
  UpdateProjectRecord,
} from "@/src/modules/projects/application";
import type { WorkspaceRepository } from "@/src/modules/workspaces/application";
import {
  type WizardDraft,
  type WizardDraftPayload,
  type WizardGenerateInput,
  type WizardReadyPayload,
  SaveWizardDraftInputSchema,
  type SaveWizardDraftInput,
  WizardDraftPayloadSchema,
  WizardGenerateInputSchema,
  WizardReadyPayloadSchema,
} from "@/src/modules/wizard/domain";
import type { WizardDraftRepository } from "./ports";

type WizardUseCaseDeps = {
  wizardDraftRepository: WizardDraftRepository;
  projectRepository: ProjectRepository;
  workspaceRepository: WorkspaceRepository;
  workingSnapshotRepository: WorkingSnapshotRepository;
};

function defaultWizardPayload(input?: {
  template?: string;
  name?: string;
  description?: string;
}): WizardDraftPayload {
  return WizardDraftPayloadSchema.parse({
    template: input?.template,
    config: {
      name: input?.name,
      description: input?.description,
      generateRootNode: true,
    },
  });
}

function buildInitialSnapshot(projectId: string, payload: WizardReadyPayload) {
  const rootX = 40;
  const rootY = 80;
  const nodes: GraphSnapshot["nodes"] = [
    {
      id: crypto.randomUUID(),
      projectId,
      kind: "project" as const,
      label: payload.config.name,
      position: { x: rootX, y: rootY },
      data: {
        template: payload.template,
        diagramType: payload.diagramType,
        source: payload.dataSource,
      },
      externalRefs: [],
    },
  ];

  const edges: GraphSnapshot["edges"] = [];

  const rootNodeId = nodes[0].id;

  if (payload.config.generateRootNode !== false) {
    const diagramNodeId = crypto.randomUUID();
    nodes.push({
      id: diagramNodeId,
      projectId,
      kind: "note",
      label: `View: ${payload.diagramType}`,
      position: { x: rootX + 260, y: rootY - 20 },
      data: { role: "diagram-type" },
      externalRefs: [],
    });
    edges.push({
      id: crypto.randomUUID(),
      projectId,
      sourceNodeId: rootNodeId,
      targetNodeId: diagramNodeId,
      kind: "contains",
      label: "view",
      data: {},
      externalRefs: [],
    });
  }

  const sourceNodeId = crypto.randomUUID();
  nodes.push({
    id: sourceNodeId,
    projectId,
    kind: "flow-step",
    label:
      payload.dataSource === "import"
        ? `Import ${payload.importKind ?? "data"}`
        : "Manual source",
    position: { x: rootX + 260, y: rootY + 140 },
    data: {
      sourceMode: payload.dataSource,
      importKind: payload.importKind,
    },
    externalRefs: [],
  });
  edges.push({
    id: crypto.randomUUID(),
    projectId,
    sourceNodeId: rootNodeId,
    targetNodeId: sourceNodeId,
    kind: "flows-to",
    label: "seed",
    data: {},
    externalRefs: [],
  });

  if (payload.config.notes) {
    const noteNodeId = crypto.randomUUID();
    nodes.push({
      id: noteNodeId,
      projectId,
      kind: "note",
      label: "Notas",
      position: { x: rootX + 520, y: rootY + 40 },
      data: { notes: payload.config.notes },
      externalRefs: [],
    });
    edges.push({
      id: crypto.randomUUID(),
      projectId,
      sourceNodeId: rootNodeId,
      targetNodeId: noteNodeId,
      kind: "references",
      label: "notes",
      data: {},
      externalRefs: [],
    });
  }

  return GraphSnapshotSchema.parse({
    nodes,
    edges,
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
  });
}

async function assertProjectOwnership(
  deps: Pick<WizardUseCaseDeps, "projectRepository" | "workspaceRepository">,
  projectId: string,
  ownerIdentity: string,
) {
  const project = await deps.projectRepository.findById(projectId);

  if (!project) {
    throw new AppError("Projeto nao encontrado.", {
      code: "PROJECT_NOT_FOUND",
      status: 404,
    });
  }

  const workspace = await deps.workspaceRepository.findById(
    project.workspaceId,
  );

  if (!workspace || workspace.ownerIdentity !== ownerIdentity) {
    throw new AppError("Projeto nao encontrado para o usuario autenticado.", {
      code: "PROJECT_NOT_FOUND",
      status: 404,
    });
  }

  return project;
}

export class GetOrCreateWizardDraftUseCase {
  constructor(private readonly deps: WizardUseCaseDeps) {}

  async execute(input: {
    projectId: string;
    ownerIdentity: string;
  }): Promise<WizardDraft> {
    const project = await assertProjectOwnership(
      this.deps,
      input.projectId,
      input.ownerIdentity,
    );
    const existing = await this.deps.wizardDraftRepository.getByProjectId(
      project.id,
    );

    if (existing) {
      return existing;
    }

    return this.deps.wizardDraftRepository.save({
      projectId: project.id,
      currentStep: "template",
      status: "draft",
      payload: defaultWizardPayload({
        template: project.template,
        name: project.name,
        description: project.description,
      }),
      lastError: undefined,
    });
  }
}

export class SaveWizardDraftUseCase {
  constructor(private readonly deps: WizardUseCaseDeps) {}

  async execute(input: SaveWizardDraftInput): Promise<WizardDraft> {
    const parsed = SaveWizardDraftInputSchema.parse(input);

    return this.deps.wizardDraftRepository.save({
      projectId: parsed.projectId,
      currentStep: parsed.currentStep,
      status: parsed.status ?? "draft",
      payload: parsed.payload,
      lastError: undefined,
    });
  }
}

export class GenerateInitialSnapshotFromWizardUseCase {
  constructor(private readonly deps: WizardUseCaseDeps) {}

  async execute(input: WizardGenerateInput): Promise<{
    projectId: string;
    workingSnapshot: WorkingSnapshotRecord;
    draft: WizardDraft;
  }> {
    const parsed = WizardGenerateInputSchema.parse(input);
    const project = await assertProjectOwnership(
      this.deps,
      parsed.projectId,
      parsed.actorIdentity,
    );

    const currentDraft = await this.deps.wizardDraftRepository.getByProjectId(
      project.id,
    );

    if (!currentDraft) {
      throw new AppError("Rascunho do wizard nao encontrado.", {
        code: "WIZARD_DRAFT_NOT_FOUND",
        status: 404,
      });
    }

    await this.deps.wizardDraftRepository.save({
      projectId: project.id,
      currentStep: "review",
      status: "validating",
      payload: currentDraft.payload,
      lastError: undefined,
    });

    try {
      const readyPayload = WizardReadyPayloadSchema.parse(currentDraft.payload);

      await this.deps.wizardDraftRepository.save({
        projectId: project.id,
        currentStep: "review",
        status: "generating",
        payload: currentDraft.payload,
        lastError: undefined,
      });

      const updateRecord: UpdateProjectRecord = {
        projectId: project.id,
        name: readyPayload.config.name,
        description: readyPayload.config.description,
        template: readyPayload.template,
      };
      await this.deps.projectRepository.updateMetadata(updateRecord);

      const snapshot = buildInitialSnapshot(project.id, readyPayload);
      const workingSnapshot = await this.deps.workingSnapshotRepository.save({
        projectId: project.id,
        snapshot,
        actorIdentity: parsed.actorIdentity,
        label: "fase1-working-v1",
      });

      const readyDraft = await this.deps.wizardDraftRepository.save({
        projectId: project.id,
        currentStep: "review",
        status: "ready",
        payload: currentDraft.payload,
        lastError: undefined,
      });

      return {
        projectId: project.id,
        workingSnapshot,
        draft: readyDraft,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Erro ao gerar snapshot.";

      await this.deps.wizardDraftRepository.save({
        projectId: project.id,
        currentStep: "review",
        status: "error",
        payload: currentDraft.payload,
        lastError: message,
      });

      throw error;
    }
  }
}
