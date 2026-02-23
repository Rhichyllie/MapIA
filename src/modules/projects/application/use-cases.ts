import { AppError } from "@/src/lib/app-error";
import { ensureSlug } from "@/src/lib/slug";
import type { WorkspaceRepository } from "@/src/modules/workspaces/application";
import type { Project } from "@/src/modules/projects/domain";
import {
  type CreateProjectInput,
  CreateProjectInputSchema,
  type GetOwnedProjectInput,
  GetOwnedProjectInputSchema,
  type ListProjectsByWorkspaceInput,
  ListProjectsByWorkspaceInputSchema,
  type UpdateProjectMetadataInput,
  UpdateProjectMetadataInputSchema,
} from "./schemas";
import type { ProjectRepository } from "./ports";

type ProjectsUseCaseDeps = {
  projectRepository: ProjectRepository;
  workspaceRepository: WorkspaceRepository;
};

function normalizeOptionalString(input?: string) {
  const trimmed = input?.trim();
  return trimmed ? trimmed : undefined;
}

async function assertOwnedWorkspace(
  workspaceRepository: WorkspaceRepository,
  workspaceId: string,
  ownerIdentity: string,
) {
  const workspace = await workspaceRepository.findById(workspaceId);

  if (!workspace || workspace.ownerIdentity !== ownerIdentity) {
    throw new AppError("Workspace nao encontrado para o usuario autenticado.", {
      code: "WORKSPACE_NOT_FOUND",
      status: 404,
    });
  }

  return workspace;
}

export class CreateProjectUseCase {
  constructor(private readonly deps: ProjectsUseCaseDeps) {}

  async execute(input: CreateProjectInput): Promise<Project> {
    const parsed = CreateProjectInputSchema.parse(input);
    await assertOwnedWorkspace(
      this.deps.workspaceRepository,
      parsed.workspaceId,
      parsed.ownerIdentity,
    );

    const baseSlug = ensureSlug(parsed.slug || parsed.name, "project");
    let nextSlug = baseSlug;
    let suffix = 2;

    while (
      await this.deps.projectRepository.findByWorkspaceIdAndSlug(
        parsed.workspaceId,
        nextSlug,
      )
    ) {
      nextSlug = `${baseSlug}-${suffix}`.slice(0, 80);
      suffix += 1;
    }

    return this.deps.projectRepository.create({
      workspaceId: parsed.workspaceId,
      slug: nextSlug,
      name: parsed.name.trim(),
      description: normalizeOptionalString(parsed.description),
      template: parsed.template,
    });
  }
}

export class ListProjectsByWorkspaceUseCase {
  constructor(private readonly deps: ProjectsUseCaseDeps) {}

  async execute(input: ListProjectsByWorkspaceInput): Promise<Project[]> {
    const parsed = ListProjectsByWorkspaceInputSchema.parse(input);
    await assertOwnedWorkspace(
      this.deps.workspaceRepository,
      parsed.workspaceId,
      parsed.ownerIdentity,
    );

    return this.deps.projectRepository.listByWorkspaceId(parsed.workspaceId);
  }
}

export class GetOwnedProjectUseCase {
  constructor(private readonly deps: ProjectsUseCaseDeps) {}

  async execute(input: GetOwnedProjectInput): Promise<Project> {
    const parsed = GetOwnedProjectInputSchema.parse(input);
    const project = await this.deps.projectRepository.findById(
      parsed.projectId,
    );

    if (!project) {
      throw new AppError("Projeto nao encontrado.", {
        code: "PROJECT_NOT_FOUND",
        status: 404,
      });
    }

    await assertOwnedWorkspace(
      this.deps.workspaceRepository,
      project.workspaceId,
      parsed.ownerIdentity,
    );

    return project;
  }
}

export class UpdateProjectMetadataUseCase {
  constructor(private readonly deps: ProjectsUseCaseDeps) {}

  async execute(input: UpdateProjectMetadataInput): Promise<Project> {
    const parsed = UpdateProjectMetadataInputSchema.parse(input);

    return this.deps.projectRepository.updateMetadata({
      projectId: parsed.projectId,
      name: normalizeOptionalString(parsed.name),
      description:
        parsed.description === undefined
          ? undefined
          : normalizeOptionalString(parsed.description),
      template: parsed.template,
    });
  }
}
