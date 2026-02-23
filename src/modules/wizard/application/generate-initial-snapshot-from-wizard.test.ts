import { describe, expect, it, vi } from "vitest";
import type { WorkingSnapshotRepository } from "@/src/modules/graph/application";
import type { ProjectRepository } from "@/src/modules/projects/application";
import type { WorkspaceRepository } from "@/src/modules/workspaces/application";
import type { WizardDraft } from "@/src/modules/wizard/domain";
import type { WizardDraftRepository } from "./ports";
import { GenerateInitialSnapshotFromWizardUseCase } from "./use-cases";

function createDeps() {
  const project = {
    id: "58f3ca26-085e-4237-80d9-adcc42f7142b",
    workspaceId: "8f0f4805-5f98-471c-a074-67c196419b15",
    slug: "mapa-onboarding",
    name: "Mapa Onboarding",
    description: "Projeto teste",
    template: "graph" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const workspaceRepository: WorkspaceRepository = {
    create: vi.fn(),
    findById: vi.fn(async () => ({
      id: project.workspaceId,
      slug: "ws-admin",
      name: "WS Admin",
      ownerIdentity: "admin@mapia.local",
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    findByOwnerIdentity: vi.fn(async () => []),
  };

  const projectRepository: ProjectRepository = {
    create: vi.fn(),
    findById: vi.fn(async () => project),
    findByWorkspaceIdAndSlug: vi.fn(async () => null),
    listByWorkspaceId: vi.fn(async () => [project]),
    updateMetadata: vi.fn(async (input) => ({
      ...project,
      name: input.name ?? project.name,
      description: input.description,
      template: input.template ?? project.template,
      updatedAt: new Date(),
    })),
  };

  let savedDraft: WizardDraft = {
    id: crypto.randomUUID(),
    projectId: project.id,
    status: "draft" as const,
    currentStep: "review" as const,
    payload: {
      template: "graph" as const,
      diagramType: "graph" as const,
      dataSource: "manual" as const,
      config: {
        name: "Mapa Onboarding",
        description: "Gerado via wizard",
        generateRootNode: true,
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const wizardDraftRepository: WizardDraftRepository = {
    getByProjectId: vi.fn(async () => savedDraft),
    save: vi.fn(async (input) => {
      savedDraft = {
        ...savedDraft,
        projectId: input.projectId,
        status: input.status,
        currentStep: input.currentStep,
        payload: input.payload,
        lastError: input.lastError,
        updatedAt: new Date(),
      };
      return savedDraft;
    }),
  };

  const workingSnapshotRepository: WorkingSnapshotRepository = {
    load: vi.fn(async () => null),
    save: vi.fn(async (input) => ({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      versionNumber: 1,
      label: input.label,
      snapshot: input.snapshot,
      createdByIdentity: input.actorIdentity,
      createdAt: new Date(),
    })),
  };

  return {
    project,
    projectRepository,
    workspaceRepository,
    wizardDraftRepository,
    workingSnapshotRepository,
  };
}

describe("GenerateInitialSnapshotFromWizardUseCase", () => {
  it("generates and persists a valid initial working snapshot", async () => {
    const deps = createDeps();
    const useCase = new GenerateInitialSnapshotFromWizardUseCase({
      wizardDraftRepository: deps.wizardDraftRepository,
      projectRepository: deps.projectRepository,
      workspaceRepository: deps.workspaceRepository,
      workingSnapshotRepository: deps.workingSnapshotRepository,
    });

    const result = await useCase.execute({
      projectId: deps.project.id,
      actorIdentity: "admin@mapia.local",
    });

    expect(result.workingSnapshot.versionNumber).toBe(1);
    expect(result.workingSnapshot.snapshot.nodes.length).toBeGreaterThan(0);
    expect(result.draft.status).toBe("ready");
    expect(deps.projectRepository.updateMetadata).toHaveBeenCalled();
    expect(deps.workingSnapshotRepository.save).toHaveBeenCalled();
  });
});
