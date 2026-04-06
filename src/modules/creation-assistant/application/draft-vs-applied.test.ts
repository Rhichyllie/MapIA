import { describe, expect, it } from "vitest";
import { AppError } from "@/src/lib/app-error";
import type { GraphSnapshot } from "@/src/domain";
import type {
  ProjectRepository,
  UpdateProjectRecord,
} from "@/src/modules/projects/application";
import type { Project } from "@/src/modules/projects/domain";
import type { WorkspaceRepository } from "@/src/modules/workspaces/application";
import type {
  Workspace,
  WorkspaceMembership,
  WorkspaceMembershipWithUser,
} from "@/src/modules/workspaces/domain";
import type { WorkingSnapshotRepository } from "@/src/modules/graph/application";
import type {
  ProjectCreationAppliedState,
  ProjectCreationDraftState,
  ProjectCreationSettingsSummary,
  ProjectCreationStateRepository,
} from "./ports";
import {
  ApplyProjectCreationUseCase,
  GetProjectCreationDraftUseCase,
  GetProjectCreationSettingsUseCase,
  SaveProjectCreationDraftUseCase,
} from "./use-cases";

const OWNER = "owner@mapia.local";
const OWNER_USER_ID = "123e4567-e89b-12d3-a456-426614174199";
const WORKSPACE_ID = "123e4567-e89b-12d3-a456-426614174100";
const PROJECT_ID = "123e4567-e89b-12d3-a456-426614174101";
const MEMBERSHIP_ID = "123e4567-e89b-12d3-a456-426614174102";

function buildProject(): Project {
  return {
    id: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    slug: "projeto-teste",
    name: "Projeto Teste",
    description: "Descricao inicial",
    template: "graph",
    createdAt: new Date("2026-03-12T00:00:00.000Z"),
    updatedAt: new Date("2026-03-12T00:00:00.000Z"),
  };
}

function buildWorkspace(): Workspace {
  return {
    id: WORKSPACE_ID,
    slug: "workspace-teste",
    name: "Workspace Teste",
    ownerIdentity: OWNER,
    createdAt: new Date("2026-03-12T00:00:00.000Z"),
    updatedAt: new Date("2026-03-12T00:00:00.000Z"),
  };
}

class InMemoryProjectRepository implements ProjectRepository {
  project = buildProject();

  async create() {
    return this.project;
  }

  async findById(id: string) {
    return id === this.project.id ? this.project : null;
  }

  async findByWorkspaceIdAndSlug() {
    return null;
  }

  async listByWorkspaceId() {
    return [this.project];
  }

  async updateMetadata(input: UpdateProjectRecord) {
    this.project = {
      ...this.project,
      ...(input.name ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.template ? { template: input.template } : {}),
      updatedAt: new Date(),
    };
    return this.project;
  }
}

class InMemoryWorkspaceRepository implements WorkspaceRepository {
  workspace = buildWorkspace();
  membership: WorkspaceMembership = {
    id: MEMBERSHIP_ID,
    workspaceId: WORKSPACE_ID,
    userId: OWNER_USER_ID,
    role: "owner",
    createdAt: new Date("2026-03-12T00:00:00.000Z"),
    updatedAt: new Date("2026-03-12T00:00:00.000Z"),
  };

  async create(input: {
    slug: string;
    name: string;
    ownerUserId: string;
    legacyOwnerIdentity?: string;
  }) {
    this.workspace = {
      id: this.workspace.id,
      slug: input.slug,
      name: input.name,
      ...(input.legacyOwnerIdentity
        ? { ownerIdentity: input.legacyOwnerIdentity }
        : {}),
      createdAt: this.workspace.createdAt,
      updatedAt: new Date(),
    };
    this.membership = {
      ...this.membership,
      workspaceId: this.workspace.id,
      userId: input.ownerUserId,
      role: "owner",
      updatedAt: new Date(),
    };
    return this.workspace;
  }

  async findById(id: string) {
    return id === this.workspace.id ? this.workspace : null;
  }

  async findBySlug(slug: string) {
    return slug === this.workspace.slug ? this.workspace : null;
  }

  async findByUserId(userId: string) {
    return userId === this.membership.userId ? [this.workspace] : [];
  }

  async findMembership(workspaceId: string, userId: string) {
    return workspaceId === this.workspace.id &&
      userId === this.membership.userId
      ? this.membership
      : null;
  }

  async listMemberships() {
    return [
      {
        ...this.membership,
        userEmail: OWNER,
        userDisplayName: "Owner",
        userActive: true,
      } satisfies WorkspaceMembershipWithUser,
    ];
  }

  async upsertMembership(input: {
    workspaceId: string;
    actorUserId: string;
    userId: string;
    role: WorkspaceMembership["role"];
  }) {
    const previousMembership = this.membership;
    this.membership = {
      ...this.membership,
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role,
      updatedAt: new Date(),
    };
    return {
      membership: this.membership,
      previousMembership,
    };
  }

  async removeMembership() {
    return this.membership;
  }
}

class InMemoryWorkingSnapshotRepository implements WorkingSnapshotRepository {
  savedSnapshots: GraphSnapshot[] = [];

  async load() {
    return null;
  }

  async save(input: {
    projectId: string;
    snapshot: GraphSnapshot;
    actorIdentity?: string;
    label?: string;
  }) {
    this.savedSnapshots.push(input.snapshot);
    return {
      id: crypto.randomUUID(),
      projectId: input.projectId,
      versionNumber: 1,
      revision: 1,
      label: input.label,
      snapshot: input.snapshot,
      createdByIdentity: input.actorIdentity,
      createdAt: new Date(),
    };
  }
}

class InMemoryCreationStateRepository implements ProjectCreationStateRepository {
  private draftByProjectId = new Map<string, ProjectCreationDraftState>();
  private appliedByProjectId = new Map<string, ProjectCreationAppliedState>();

  async findAppliedByProjectId(projectId: string) {
    return this.appliedByProjectId.get(projectId) ?? null;
  }

  async getSettingsSummaryByProjectId(
    projectId: string,
  ): Promise<ProjectCreationSettingsSummary> {
    const applied = this.appliedByProjectId.get(projectId) ?? null;
    const draft = this.draftByProjectId.get(projectId);
    return {
      applied,
      draftExists: Boolean(draft),
      ...(draft
        ? { draftVersion: draft.version, draftUpdatedAt: draft.updatedAt }
        : {}),
    };
  }

  async findDraftByProjectId(projectId: string) {
    return this.draftByProjectId.get(projectId) ?? null;
  }

  async saveAppliedByProjectId(input: {
    projectId: string;
    settings: import("@/src/modules/creation-assistant/domain").AssistantCreationSettings;
    appliedByIdentity?: string;
  }) {
    const current = this.appliedByProjectId.get(input.projectId);
    const next: ProjectCreationAppliedState = {
      settings: input.settings,
      version: (current?.version ?? 0) + 1,
      appliedAt: new Date(),
      appliedByIdentity: input.appliedByIdentity,
    };
    this.appliedByProjectId.set(input.projectId, next);
    return next;
  }

  async saveDraftByProjectId(input: {
    projectId: string;
    draft: import("@/src/modules/creation-assistant/domain").AssistantDraft;
    expectedVersion?: number;
    updatedByIdentity?: string;
  }) {
    const current = this.draftByProjectId.get(input.projectId);
    if (
      current &&
      input.expectedVersion &&
      current.version !== input.expectedVersion
    ) {
      throw new AppError("Conflict", {
        code: "CREATION_DRAFT_VERSION_CONFLICT",
        status: 409,
        details: {
          expectedVersion: input.expectedVersion,
          actualVersion: current.version,
          latestDraft: current.draft,
        },
      });
    }
    const next: ProjectCreationDraftState = {
      draft: input.draft,
      version: (current?.version ?? 0) + 1,
      updatedAt: new Date(),
      updatedByIdentity: input.updatedByIdentity,
    };
    this.draftByProjectId.set(input.projectId, next);
    return next;
  }
}

function buildDeps() {
  const projectRepository = new InMemoryProjectRepository();
  const workspaceRepository = new InMemoryWorkspaceRepository();
  const workingSnapshotRepository = new InMemoryWorkingSnapshotRepository();
  const projectCreationStateRepository = new InMemoryCreationStateRepository();

  return {
    projectRepository,
    workspaceRepository,
    workingSnapshotRepository,
    projectCreationStateRepository,
  };
}

function buildDraftWithSecret() {
  return {
    projectName: "Projeto Seguro",
    projectObjective: "Teste",
    profile: "data-model",
    startStrategy: "import",
    startSource: "postgres",
    sourceConfig: {
      kind: "postgres",
      connectionMode: "fields",
      host: "db.internal",
      port: 5432,
      database: "mapia",
      authMode: "userpass",
      sslMode: "require",
      username: "readonly",
      password: "secret-password",
      connectionString:
        "postgresql://readonly:secret-password@db.internal:5432/mapia",
    },
    initialView: "erd",
    layout: "relational",
    detailLevel: "intermediate",
    automation: {
      inferRelations: true,
      createLinkFields: true,
      applySuggestedNames: true,
      autoOrganizeOnCreate: true,
      detectInconsistenciesEarly: true,
    },
    context: {},
  } as const;
}

describe("creation-assistant draft vs applied", () => {
  it("saving draft does not alter applied settings", async () => {
    const deps = buildDeps();
    const saveDraft = new SaveProjectCreationDraftUseCase(deps);
    const getApplied = new GetProjectCreationSettingsUseCase(deps);
    const getDraft = new GetProjectCreationDraftUseCase(deps);

    const draftState = await saveDraft.execute({
      actorUserId: OWNER_USER_ID,
      ownerIdentity: OWNER,
      projectId: PROJECT_ID,
      draft: buildDraftWithSecret(),
    });

    const applied = await getApplied.execute({
      actorUserId: OWNER_USER_ID,
      ownerIdentity: OWNER,
      projectId: PROJECT_ID,
    });
    const draft = await getDraft.execute({
      actorUserId: OWNER_USER_ID,
      ownerIdentity: OWNER,
      projectId: PROJECT_ID,
    });

    expect(applied).toBeNull();
    expect(draftState.version).toBe(1);
    expect(draft?.version).toBe(1);
    expect(JSON.stringify(draft?.draft ?? {})).not.toContain("secret-password");
    expect(JSON.stringify(draft?.draft ?? {})).not.toContain("password");
  });

  it("apply creation updates applied settings explicitly and keeps secrets redacted", async () => {
    const deps = buildDeps();
    const saveDraft = new SaveProjectCreationDraftUseCase(deps);
    const apply = new ApplyProjectCreationUseCase(deps);
    const getApplied = new GetProjectCreationSettingsUseCase(deps);

    await saveDraft.execute({
      actorUserId: OWNER_USER_ID,
      ownerIdentity: OWNER,
      projectId: PROJECT_ID,
      draft: buildDraftWithSecret(),
    });

    const result = await apply.execute({
      actorUserId: OWNER_USER_ID,
      ownerIdentity: OWNER,
      projectId: PROJECT_ID,
      createInitialMap: false,
    });

    const applied = await getApplied.execute({
      actorUserId: OWNER_USER_ID,
      ownerIdentity: OWNER,
      projectId: PROJECT_ID,
    });

    expect(result.appliedVersion).toBe(1);
    expect(applied).not.toBeNull();
    expect(JSON.stringify(applied ?? {})).not.toContain("secret-password");
    expect(deps.workingSnapshotRepository.savedSnapshots).toHaveLength(0);
  });

  it("returns conflict with latest draft redacted", async () => {
    const deps = buildDeps();
    const saveDraft = new SaveProjectCreationDraftUseCase(deps);

    await saveDraft.execute({
      actorUserId: OWNER_USER_ID,
      ownerIdentity: OWNER,
      projectId: PROJECT_ID,
      draft: buildDraftWithSecret(),
    });

    await expect(
      saveDraft.execute({
        actorUserId: OWNER_USER_ID,
        ownerIdentity: OWNER,
        projectId: PROJECT_ID,
        draft: buildDraftWithSecret(),
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({
      code: "CREATION_DRAFT_VERSION_CONFLICT",
      status: 409,
    });

    try {
      await saveDraft.execute({
        actorUserId: OWNER_USER_ID,
        ownerIdentity: OWNER,
        projectId: PROJECT_ID,
        draft: buildDraftWithSecret(),
        expectedVersion: 2,
      });
    } catch (error) {
      const appError = error as AppError;
      const latestDraft = appError.details?.latestDraft;
      expect(JSON.stringify(latestDraft ?? {})).not.toContain(
        "secret-password",
      );
      expect(JSON.stringify(latestDraft ?? {})).not.toContain("password");
    }
  });
});
