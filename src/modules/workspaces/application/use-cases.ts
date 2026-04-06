import { AppError } from "@/src/lib/app-error";
import { ensureSlug } from "@/src/lib/slug";
import {
  findAppUserById,
  upsertAppUserByEmail,
} from "@/src/server/auth/auth-user-store";
import type {
  Workspace,
  WorkspaceMembership,
  WorkspaceMembershipWithUser,
  WorkspaceRole,
} from "@/src/modules/workspaces/domain";
import { workspaceRoleSatisfies } from "@/src/modules/workspaces/domain";
import {
  type CreateWorkspaceInput,
  CreateWorkspaceInputSchema,
  type GetOrCreatePrimaryWorkspaceForActorInput,
  GetOrCreatePrimaryWorkspaceForActorInputSchema,
  type GetWorkspaceAccessInput,
  GetWorkspaceAccessInputSchema,
  type ListWorkspaceMembershipsInput,
  ListWorkspaceMembershipsInputSchema,
  type ListWorkspacesForActorInput,
  ListWorkspacesForActorInputSchema,
  type RemoveWorkspaceMembershipInput,
  RemoveWorkspaceMembershipInputSchema,
  type UpsertWorkspaceMembershipInput,
  UpsertWorkspaceMembershipInputSchema,
} from "./schemas";
import type { WorkspaceRepository } from "./ports";

type WorkspaceUseCaseDeps = {
  workspaceRepository: WorkspaceRepository;
};

type WorkspaceAccessContext = {
  workspace: Workspace;
  membership: WorkspaceMembership;
};

function buildPrimaryWorkspaceName(actorEmail: string) {
  return `Workspace ${actorEmail}`;
}

function buildPrimaryWorkspaceSlug(actorEmail: string) {
  return `ws-${ensureSlug(actorEmail, "principal")}`.slice(0, 80);
}

async function assertWorkspaceAccess(
  workspaceRepository: WorkspaceRepository,
  input: {
    actorUserId: string;
    workspaceId: string;
    minimumRole: WorkspaceRole;
  },
): Promise<WorkspaceAccessContext> {
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
    throw new AppError("Workspace nao encontrado para o usuario autenticado.", {
      code: "WORKSPACE_NOT_FOUND",
      status: 404,
    });
  }

  if (!workspaceRoleSatisfies(membership.role, input.minimumRole)) {
    throw new AppError("Permissao insuficiente para o workspace.", {
      code: "WORKSPACE_FORBIDDEN",
      status: 403,
      details: {
        requiredRole: input.minimumRole,
        actualRole: membership.role,
      },
    });
  }

  return {
    workspace,
    membership,
  };
}

export class CreateWorkspaceUseCase {
  constructor(private readonly deps: WorkspaceUseCaseDeps) {}

  async execute(input: CreateWorkspaceInput): Promise<Workspace> {
    const parsed = CreateWorkspaceInputSchema.parse(input);
    const requestedSlug = ensureSlug(parsed.slug ?? parsed.name, "workspace");
    const existing =
      await this.deps.workspaceRepository.findBySlug(requestedSlug);

    if (existing) {
      throw new AppError("Ja existe um workspace com este slug.", {
        code: "WORKSPACE_SLUG_CONFLICT",
        status: 409,
      });
    }

    return this.deps.workspaceRepository.create({
      slug: requestedSlug,
      name: parsed.name,
      ownerUserId: parsed.actorUserId,
      legacyOwnerIdentity: parsed.legacyOwnerIdentity,
    });
  }
}

export class ListWorkspacesForActorUseCase {
  constructor(private readonly deps: WorkspaceUseCaseDeps) {}

  async execute(input: ListWorkspacesForActorInput): Promise<Workspace[]> {
    const parsed = ListWorkspacesForActorInputSchema.parse(input);
    return this.deps.workspaceRepository.findByUserId(parsed.actorUserId);
  }
}

export class GetWorkspaceAccessUseCase {
  constructor(private readonly deps: WorkspaceUseCaseDeps) {}

  async execute(input: GetWorkspaceAccessInput) {
    const parsed = GetWorkspaceAccessInputSchema.parse(input);
    return assertWorkspaceAccess(this.deps.workspaceRepository, parsed);
  }
}

export class GetOrCreatePrimaryWorkspaceForActorUseCase {
  constructor(private readonly deps: WorkspaceUseCaseDeps) {}

  async execute(input: GetOrCreatePrimaryWorkspaceForActorInput) {
    const parsed = GetOrCreatePrimaryWorkspaceForActorInputSchema.parse(input);
    const workspaces = await this.deps.workspaceRepository.findByUserId(
      parsed.actorUserId,
    );

    if (workspaces.length > 0) {
      return workspaces[0];
    }

    return this.deps.workspaceRepository.create({
      slug: buildPrimaryWorkspaceSlug(parsed.legacyOwnerIdentity),
      name: buildPrimaryWorkspaceName(parsed.legacyOwnerIdentity),
      ownerUserId: parsed.actorUserId,
      legacyOwnerIdentity: parsed.legacyOwnerIdentity,
    });
  }
}

export class ListWorkspaceMembershipsUseCase {
  constructor(private readonly deps: WorkspaceUseCaseDeps) {}

  async execute(
    input: ListWorkspaceMembershipsInput,
  ): Promise<WorkspaceMembershipWithUser[]> {
    const parsed = ListWorkspaceMembershipsInputSchema.parse(input);
    await assertWorkspaceAccess(this.deps.workspaceRepository, {
      actorUserId: parsed.actorUserId,
      workspaceId: parsed.workspaceId,
      minimumRole: "admin",
    });

    return this.deps.workspaceRepository.listMemberships(parsed.workspaceId);
  }
}

export class UpsertWorkspaceMembershipUseCase {
  constructor(private readonly deps: WorkspaceUseCaseDeps) {}

  async execute(input: UpsertWorkspaceMembershipInput) {
    const parsed = UpsertWorkspaceMembershipInputSchema.parse(input);
    const { workspace, membership: actorMembership } =
      await assertWorkspaceAccess(this.deps.workspaceRepository, {
        actorUserId: parsed.actorUserId,
        workspaceId: parsed.workspaceId,
        minimumRole: "owner",
      });
    const memberUser = await upsertAppUserByEmail({
      email: parsed.memberEmail,
      displayName: parsed.memberDisplayName,
    });

    if (!memberUser.active) {
      throw new AppError(
        "Nao e permitido atribuir membership a um usuario desativado.",
        {
          code: "WORKSPACE_MEMBERSHIP_TARGET_INACTIVE",
          status: 409,
          details: {
            workspaceId: workspace.id,
            targetUserId: memberUser.id,
          },
        },
      );
    }

    const { membership, previousMembership } =
      await this.deps.workspaceRepository.upsertMembership({
        workspaceId: workspace.id,
        actorUserId: parsed.actorUserId,
        userId: memberUser.id,
        role: parsed.role,
      });

    return {
      workspace,
      membership,
      user: memberUser,
      previousMembership,
      changeKind:
        previousMembership === null
          ? "created"
          : previousMembership.role === membership.role
            ? "unchanged"
            : "role_changed",
      actorMembership,
    };
  }
}

export class RemoveWorkspaceMembershipUseCase {
  constructor(private readonly deps: WorkspaceUseCaseDeps) {}

  async execute(input: RemoveWorkspaceMembershipInput) {
    const parsed = RemoveWorkspaceMembershipInputSchema.parse(input);
    const { workspace, membership: actorMembership } =
      await assertWorkspaceAccess(this.deps.workspaceRepository, {
        actorUserId: parsed.actorUserId,
        workspaceId: parsed.workspaceId,
        minimumRole: "owner",
      });

    const removedMembership =
      await this.deps.workspaceRepository.removeMembership({
        workspaceId: workspace.id,
        actorUserId: parsed.actorUserId,
        userId: parsed.memberUserId,
      });

    if (!removedMembership) {
      throw new AppError("Membership nao encontrado para este workspace.", {
        code: "WORKSPACE_MEMBERSHIP_NOT_FOUND",
        status: 404,
        details: {
          workspaceId: workspace.id,
          targetUserId: parsed.memberUserId,
        },
      });
    }

    const removedUser = await findAppUserById(removedMembership.userId);

    return {
      workspace,
      removedMembership,
      removedUser,
      actorMembership,
      selfTarget: parsed.actorUserId === removedMembership.userId,
    };
  }
}
