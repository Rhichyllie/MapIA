import { prisma } from "@/src/server/db/client";
import {
  CreateProjectUseCase,
  GetOwnedProjectUseCase,
  ListProjectsByWorkspaceUseCase,
  UpdateProjectMetadataUseCase,
} from "@/src/modules/projects/application";
import { PrismaProjectRepository } from "@/src/modules/projects/infrastructure";
import {
  GetOrCreatePrimaryWorkspaceForIdentityUseCase,
  ListWorkspacesForIdentityUseCase,
} from "@/src/modules/workspaces/application";
import { PrismaWorkspaceRepository } from "@/src/modules/workspaces/infrastructure";
import {
  GenerateInitialSnapshotFromWizardUseCase,
  GetOrCreateWizardDraftUseCase,
  SaveWizardDraftUseCase,
} from "@/src/modules/wizard/application";
import { PrismaWizardDraftRepository } from "@/src/modules/wizard/infrastructure";
import {
  LoadWorkingSnapshotUseCase,
  SaveWorkingSnapshotUseCase,
} from "@/src/modules/graph/application";
import { PrismaWorkingSnapshotRepository } from "@/src/modules/graph/infrastructure";

export function createServerRepositories() {
  const workspaceRepository = new PrismaWorkspaceRepository(prisma.workspace);
  const projectRepository = new PrismaProjectRepository(prisma.project);
  const wizardDraftRepository = new PrismaWizardDraftRepository(
    prisma.wizardDraft,
  );
  const workingSnapshotRepository = new PrismaWorkingSnapshotRepository(
    prisma.graphVersion,
  );

  return {
    workspaceRepository,
    projectRepository,
    wizardDraftRepository,
    workingSnapshotRepository,
  };
}

export function createServerUseCases() {
  const repositories = createServerRepositories();

  return {
    repositories,
    workspaces: {
      getOrCreatePrimaryWorkspaceForIdentity:
        new GetOrCreatePrimaryWorkspaceForIdentityUseCase({
          workspaceRepository: repositories.workspaceRepository,
        }),
      listWorkspacesForIdentity: new ListWorkspacesForIdentityUseCase({
        workspaceRepository: repositories.workspaceRepository,
      }),
    },
    projects: {
      createProject: new CreateProjectUseCase({
        projectRepository: repositories.projectRepository,
        workspaceRepository: repositories.workspaceRepository,
      }),
      listProjectsByWorkspace: new ListProjectsByWorkspaceUseCase({
        projectRepository: repositories.projectRepository,
        workspaceRepository: repositories.workspaceRepository,
      }),
      getOwnedProject: new GetOwnedProjectUseCase({
        projectRepository: repositories.projectRepository,
        workspaceRepository: repositories.workspaceRepository,
      }),
      updateProjectMetadata: new UpdateProjectMetadataUseCase({
        projectRepository: repositories.projectRepository,
        workspaceRepository: repositories.workspaceRepository,
      }),
    },
    wizard: {
      getOrCreateDraft: new GetOrCreateWizardDraftUseCase({
        wizardDraftRepository: repositories.wizardDraftRepository,
        projectRepository: repositories.projectRepository,
        workspaceRepository: repositories.workspaceRepository,
        workingSnapshotRepository: repositories.workingSnapshotRepository,
      }),
      saveDraft: new SaveWizardDraftUseCase({
        wizardDraftRepository: repositories.wizardDraftRepository,
        projectRepository: repositories.projectRepository,
        workspaceRepository: repositories.workspaceRepository,
        workingSnapshotRepository: repositories.workingSnapshotRepository,
      }),
      generateInitialSnapshot: new GenerateInitialSnapshotFromWizardUseCase({
        wizardDraftRepository: repositories.wizardDraftRepository,
        projectRepository: repositories.projectRepository,
        workspaceRepository: repositories.workspaceRepository,
        workingSnapshotRepository: repositories.workingSnapshotRepository,
      }),
    },
    graph: {
      loadWorkingSnapshot: new LoadWorkingSnapshotUseCase({
        workingSnapshotRepository: repositories.workingSnapshotRepository,
      }),
      saveWorkingSnapshot: new SaveWorkingSnapshotUseCase({
        workingSnapshotRepository: repositories.workingSnapshotRepository,
      }),
    },
  };
}
