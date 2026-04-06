import { AppError } from "@/src/lib/app-error";
import { ensureSlug } from "@/src/lib/slug";
import type { WorkspaceRepository } from "@/src/modules/workspaces/application";
import {
  type WorkspaceMembership,
  type WorkspaceRole,
  workspaceRoleSatisfies,
} from "@/src/modules/workspaces/domain";
import type { Project } from "@/src/modules/projects/domain";
import {
  type CreateProjectInput,
  CreateProjectInputSchema,
  type GetProjectAccessInput,
  GetProjectAccessInputSchema,
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

export type ProjectAccessContext = {
  project: Project;
  membership: WorkspaceMembership;
};

function normalizeOptionalString(input?: string) {
  const trimmed = input?.trim();
  return trimmed ? trimmed : undefined;
}

async function assertWorkspaceRole(
  workspaceRepository: WorkspaceRepository,
  input: {
    workspaceId: string;
    actorUserId: string;
    minimumRole: WorkspaceRole;
  },
) {
  const workspace = await workspaceRepository.findById(input.workspaceId);

  if (!workspace) {
    throw new AppError("Workspace nao encontrado.", {
      code: "WORKSPACE_NOT_FOUND",
      status: 404,
    });
  }

  const membership = await workspaceRepository.findMembership(
    input.workspaceId,
    input.actorUserId,
  );

  if (!membership) {
    throw new AppError(
      "Workspace nao encontrado para o usuario autenticado.",
      {
        code: "WORKSPACE_NOT_FOUND",
        status: 404,
      },
    );
  }

  if (!workspaceRoleSatisfies(membership.role, input.minimumRole)) {
    throw new AppError("Permissao insuficiente para este workspace.", {
      code: "WORKSPACE_FORBIDDEN",
      status: 403,
      details: {
        requiredRole: input.minimumRole,
        actualRole: membership.role,
      },
    });
  }

  return membership;
}

export class CreateProjectUseCase {
  constructor(private readonly deps: ProjectsUseCaseDeps) {}

  async execute(input: CreateProjectInput): Promise<Project> {
    const parsed = CreateProjectInputSchema.parse(input);
    await assertWorkspaceRole(this.deps.workspaceRepository, {
      workspaceId: parsed.workspaceId,
      actorUserId: parsed.actorUserId,
      minimumRole: "admin",
    });

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
    await assertWorkspaceRole(this.deps.workspaceRepository, {
      workspaceId: parsed.workspaceId,
      actorUserId: parsed.actorUserId,
      minimumRole: "viewer",
    });

    return this.deps.projectRepository.listByWorkspaceId(parsed.workspaceId);
  }
}

export class GetProjectAccessUseCase {
  constructor(private readonly deps: ProjectsUseCaseDeps) {}

  async execute(input: GetProjectAccessInput): Promise<ProjectAccessContext> {
    const parsed = GetProjectAccessInputSchema.parse(input);
    const project = await this.deps.projectRepository.findById(
      parsed.projectId,
    );

    if (!project) {
      throw new AppError("Projeto nao encontrado.", {
        code: "PROJECT_NOT_FOUND",
        status: 404,
      });
    }

    const membership = await this.deps.workspaceRepository.findMembership(
      project.workspaceId,
      parsed.actorUserId,
    );

    if (!membership) {
      throw new AppError("Projeto nao encontrado para o usuario autenticado.", {
        code: "PROJECT_NOT_FOUND",
        status: 404,
      });
    }

    if (!workspaceRoleSatisfies(membership.role, parsed.minimumRole)) {
      throw new AppError("Permissao insuficiente para este projeto.", {
        code: "PROJECT_FORBIDDEN",
        status: 403,
        details: {
          requiredRole: parsed.minimumRole,
          actualRole: membership.role,
        },
      });
    }

    return {
      project,
      membership,
    };
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
