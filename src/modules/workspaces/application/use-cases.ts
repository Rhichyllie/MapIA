import { AppError } from "@/src/lib/app-error";
import { ensureSlug } from "@/src/lib/slug";
import type { Workspace } from "@/src/modules/workspaces/domain";
import {
  type CreateWorkspaceInput,
  CreateWorkspaceInputSchema,
  type ListWorkspacesForIdentityInput,
  ListWorkspacesForIdentityInputSchema,
} from "./schemas";
import type { WorkspaceRepository } from "./ports";

type WorkspaceUseCaseDeps = {
  workspaceRepository: WorkspaceRepository;
};

function buildPrimaryWorkspaceName(ownerIdentity: string) {
  return `Workspace ${ownerIdentity}`;
}

function buildPrimaryWorkspaceSlug(ownerIdentity: string) {
  return `ws-${ensureSlug(ownerIdentity, "principal")}`.slice(0, 80);
}

export class CreateWorkspaceUseCase {
  constructor(private readonly deps: WorkspaceUseCaseDeps) {}

  async execute(input: CreateWorkspaceInput): Promise<Workspace> {
    const parsed = CreateWorkspaceInputSchema.parse(input);

    const existing = await this.deps.workspaceRepository.findByOwnerIdentity(
      parsed.ownerIdentity,
    );
    const requestedSlug = ensureSlug(parsed.slug ?? parsed.name, "workspace");

    if (existing.some((workspace) => workspace.slug === requestedSlug)) {
      throw new AppError("Ja existe um workspace com este slug.", {
        code: "WORKSPACE_SLUG_CONFLICT",
        status: 409,
      });
    }

    return this.deps.workspaceRepository.create({
      slug: requestedSlug,
      name: parsed.name,
      ownerIdentity: parsed.ownerIdentity,
    });
  }
}

export class ListWorkspacesForIdentityUseCase {
  constructor(private readonly deps: WorkspaceUseCaseDeps) {}

  async execute(input: ListWorkspacesForIdentityInput): Promise<Workspace[]> {
    const parsed = ListWorkspacesForIdentityInputSchema.parse(input);

    return this.deps.workspaceRepository.findByOwnerIdentity(
      parsed.ownerIdentity,
    );
  }
}

export class GetOrCreatePrimaryWorkspaceForIdentityUseCase {
  constructor(private readonly deps: WorkspaceUseCaseDeps) {}

  async execute(ownerIdentity: string): Promise<Workspace> {
    const parsed = ListWorkspacesForIdentityInputSchema.parse({
      ownerIdentity,
    });
    const workspaces = await this.deps.workspaceRepository.findByOwnerIdentity(
      parsed.ownerIdentity,
    );

    if (workspaces.length > 0) {
      return workspaces[0];
    }

    return this.deps.workspaceRepository.create({
      slug: buildPrimaryWorkspaceSlug(parsed.ownerIdentity),
      name: buildPrimaryWorkspaceName(parsed.ownerIdentity),
      ownerIdentity: parsed.ownerIdentity,
    });
  }
}
