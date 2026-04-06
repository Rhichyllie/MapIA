import { prisma } from "@/src/server/db/client";
import {
  ApplyEditorCommandUseCase,
  ApplyEditorCommandsUseCase,
  GetWorkingSnapshotForEditorUseCase,
  SaveEditorFullSnapshotUseCase,
} from "@/src/modules/editor/application";
import { WorkingSnapshotEditorGateway } from "@/src/modules/editor/infrastructure";
import {
  CreateProjectUseCase,
  GetProjectAccessUseCase,
  ListProjectsByWorkspaceUseCase,
  UpdateProjectMetadataUseCase,
} from "@/src/modules/projects/application";
import { PrismaProjectRepository } from "@/src/modules/projects/infrastructure";
import {
  GetOrCreatePrimaryWorkspaceForActorUseCase,
  GetWorkspaceAccessUseCase,
  ListWorkspaceMembershipsUseCase,
  ListWorkspacesForActorUseCase,
  RemoveWorkspaceMembershipUseCase,
  UpsertWorkspaceMembershipUseCase,
} from "@/src/modules/workspaces/application";
import { PrismaWorkspaceRepository } from "@/src/modules/workspaces/infrastructure";
import {
  LoadWorkingSnapshotUseCase,
  SaveWorkingSnapshotUseCase,
} from "@/src/modules/graph/application";
import { PrismaWorkingSnapshotRepository } from "@/src/modules/graph/infrastructure";
import {
  CreateSnapshotVersionFromWorkingSnapshotUseCase,
  DiffWorkingSnapshotAgainstVersionUseCase,
  GetSnapshotVersionByIdUseCase,
  ListSnapshotVersionsUseCase,
  RestoreWorkingSnapshotFromVersionUseCase,
} from "@/src/modules/versioning/application";
import {
  ImportPostgresToSnapshotUseCase,
  ImportPrismaSchemaFileToSnapshotUseCase,
  ImportPrismaSchemaToSnapshotUseCase,
} from "@/src/modules/importing/application";
import {
  AuditWorkingSnapshotUseCase,
  GetOrCreateSemanticPolicyUseCase,
  UpdateSemanticPolicyUseCase,
  ValidateSemanticDraftUseCase,
} from "@/src/modules/semantics/application";
import {
  ApplyAssistantDraftToProjectUseCase,
  ApplyProjectCreationUseCase,
  CreateProjectWithAssistantUseCase,
  GetProjectCreationDraftUseCase,
  GetProjectCreationSettingsUseCase,
  GetProjectCreationSettingsSummaryUseCase,
  SaveProjectCreationDraftUseCase,
  SaveProjectCreationSettingsUseCase,
} from "@/src/modules/creation-assistant/application";
import { PrismaProjectCreationStateRepository } from "@/src/modules/creation-assistant/infrastructure";
import {
  FileSystemPrismaSchemaFileImportSource,
  InformationSchemaPostgresImportIntrospectionSource,
  PrismaPostgresIntrospectionQueryRunner,
} from "@/src/modules/importing/infrastructure";
import { createImportTelemetryCollectorProvider } from "@/src/modules/importing/infra/observability";
import { PrismaSnapshotVersionRepository } from "@/src/modules/versioning/infrastructure";
import {
  PrismaSemanticEventLogRepository,
  PrismaSemanticPolicyRepository,
} from "@/src/modules/semantics/infrastructure";
import { ensureServerOpenTelemetryRuntimeStarted } from "@/src/server/observability/otel-runtime";

let cachedImportingTelemetryCollectorProvider:
  | ReturnType<typeof createImportTelemetryCollectorProvider>
  | undefined;

function getOrCreateImportingTelemetryCollectorProvider() {
  if (!cachedImportingTelemetryCollectorProvider) {
    const { runtime: otelRuntime } = ensureServerOpenTelemetryRuntimeStarted();
    cachedImportingTelemetryCollectorProvider =
      createImportTelemetryCollectorProvider(otelRuntime, {
        adapterConfig: {
          rootSpanName: "importing.pipeline",
          attributePrefix: "import.",
          recordEventsOnRootOnly: true,
        },
      });
  }

  return cachedImportingTelemetryCollectorProvider;
}

export function createServerRepositories() {
  const workspaceRepository = new PrismaWorkspaceRepository(prisma);
  const projectRepository = new PrismaProjectRepository(prisma.project);
  const projectCreationStateRepository =
    new PrismaProjectCreationStateRepository(
      prisma.projectCreationSettings,
      prisma.projectCreationDraft,
    );
  const workingSnapshotRepository = new PrismaWorkingSnapshotRepository(
    prisma.graphVersion,
  );
  const snapshotVersionRepository = new PrismaSnapshotVersionRepository(
    prisma.editorSnapshotVersion,
  );
  const semanticPolicyRepository = new PrismaSemanticPolicyRepository(
    prisma.semanticPolicy,
  );
  const semanticEventLogRepository = new PrismaSemanticEventLogRepository(
    prisma.semanticEventLog,
  );
  const editorSnapshotGateway = new WorkingSnapshotEditorGateway(
    workingSnapshotRepository,
  );
  const prismaSchemaFileImportSource =
    new FileSystemPrismaSchemaFileImportSource();
  const postgresImportIntrospectionPort =
    new InformationSchemaPostgresImportIntrospectionSource(
      new PrismaPostgresIntrospectionQueryRunner(prisma),
    );

  return {
    workspaceRepository,
    projectRepository,
    projectCreationStateRepository,
    workingSnapshotRepository,
    snapshotVersionRepository,
    semanticPolicyRepository,
    semanticEventLogRepository,
    editorSnapshotGateway,
    prismaSchemaFileImportSource,
    postgresImportIntrospectionPort,
  };
}

export function createServerUseCases() {
  const repositories = createServerRepositories();
  const importingTelemetryCollectorProvider =
    getOrCreateImportingTelemetryCollectorProvider();
  const importPrismaSchemaToSnapshotUseCase =
    new ImportPrismaSchemaToSnapshotUseCase({
      telemetryCollectorFactory: () =>
        importingTelemetryCollectorProvider.getCollector(),
    });

  return {
    repositories,
    workspaces: {
      getOrCreatePrimaryWorkspaceForActor:
        new GetOrCreatePrimaryWorkspaceForActorUseCase({
          workspaceRepository: repositories.workspaceRepository,
        }),
      listWorkspacesForActor: new ListWorkspacesForActorUseCase({
        workspaceRepository: repositories.workspaceRepository,
      }),
      getWorkspaceAccess: new GetWorkspaceAccessUseCase({
        workspaceRepository: repositories.workspaceRepository,
      }),
      listWorkspaceMemberships: new ListWorkspaceMembershipsUseCase({
        workspaceRepository: repositories.workspaceRepository,
      }),
      upsertWorkspaceMembership: new UpsertWorkspaceMembershipUseCase({
        workspaceRepository: repositories.workspaceRepository,
      }),
      removeWorkspaceMembership: new RemoveWorkspaceMembershipUseCase({
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
      getProjectAccess: new GetProjectAccessUseCase({
        projectRepository: repositories.projectRepository,
        workspaceRepository: repositories.workspaceRepository,
      }),
      updateProjectMetadata: new UpdateProjectMetadataUseCase({
        projectRepository: repositories.projectRepository,
        workspaceRepository: repositories.workspaceRepository,
      }),
    },
    creationAssistant: {
      createProjectWithAssistant: new CreateProjectWithAssistantUseCase({
        workspaceRepository: repositories.workspaceRepository,
        projectRepository: repositories.projectRepository,
        workingSnapshotRepository: repositories.workingSnapshotRepository,
        projectCreationStateRepository:
          repositories.projectCreationStateRepository,
      }),
      applyAssistantDraftToProject: new ApplyAssistantDraftToProjectUseCase({
        workspaceRepository: repositories.workspaceRepository,
        projectRepository: repositories.projectRepository,
        workingSnapshotRepository: repositories.workingSnapshotRepository,
        projectCreationStateRepository:
          repositories.projectCreationStateRepository,
      }),
      applyProjectCreation: new ApplyProjectCreationUseCase({
        workspaceRepository: repositories.workspaceRepository,
        projectRepository: repositories.projectRepository,
        workingSnapshotRepository: repositories.workingSnapshotRepository,
        projectCreationStateRepository:
          repositories.projectCreationStateRepository,
      }),
      getProjectCreationSettings: new GetProjectCreationSettingsUseCase({
        workspaceRepository: repositories.workspaceRepository,
        projectRepository: repositories.projectRepository,
        workingSnapshotRepository: repositories.workingSnapshotRepository,
        projectCreationStateRepository:
          repositories.projectCreationStateRepository,
      }),
      getProjectCreationSettingsSummary:
        new GetProjectCreationSettingsSummaryUseCase({
          workspaceRepository: repositories.workspaceRepository,
          projectRepository: repositories.projectRepository,
          workingSnapshotRepository: repositories.workingSnapshotRepository,
          projectCreationStateRepository:
            repositories.projectCreationStateRepository,
        }),
      saveProjectCreationSettings: new SaveProjectCreationSettingsUseCase({
        workspaceRepository: repositories.workspaceRepository,
        projectRepository: repositories.projectRepository,
        workingSnapshotRepository: repositories.workingSnapshotRepository,
        projectCreationStateRepository:
          repositories.projectCreationStateRepository,
      }),
      getProjectCreationDraft: new GetProjectCreationDraftUseCase({
        workspaceRepository: repositories.workspaceRepository,
        projectRepository: repositories.projectRepository,
        workingSnapshotRepository: repositories.workingSnapshotRepository,
        projectCreationStateRepository:
          repositories.projectCreationStateRepository,
      }),
      saveProjectCreationDraft: new SaveProjectCreationDraftUseCase({
        workspaceRepository: repositories.workspaceRepository,
        projectRepository: repositories.projectRepository,
        workingSnapshotRepository: repositories.workingSnapshotRepository,
        projectCreationStateRepository:
          repositories.projectCreationStateRepository,
      }),
    },
    editor: {
      getWorkingSnapshotForEditor: new GetWorkingSnapshotForEditorUseCase({
        editorSnapshotGateway: repositories.editorSnapshotGateway,
      }),
      applyCommand: new ApplyEditorCommandUseCase({
        editorSnapshotGateway: repositories.editorSnapshotGateway,
        semanticPolicyRepository: repositories.semanticPolicyRepository,
        semanticEventLogRepository: repositories.semanticEventLogRepository,
      }),
      applyCommands: new ApplyEditorCommandsUseCase({
        editorSnapshotGateway: repositories.editorSnapshotGateway,
        semanticPolicyRepository: repositories.semanticPolicyRepository,
        semanticEventLogRepository: repositories.semanticEventLogRepository,
      }),
      saveFullSnapshot: new SaveEditorFullSnapshotUseCase({
        editorSnapshotGateway: repositories.editorSnapshotGateway,
        semanticPolicyRepository: repositories.semanticPolicyRepository,
        semanticEventLogRepository: repositories.semanticEventLogRepository,
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
    versioning: {
      createSnapshotVersionFromWorkingSnapshot:
        new CreateSnapshotVersionFromWorkingSnapshotUseCase({
          workingSnapshotRepository: repositories.workingSnapshotRepository,
          snapshotVersionRepository: repositories.snapshotVersionRepository,
        }),
      listSnapshotVersions: new ListSnapshotVersionsUseCase({
        workingSnapshotRepository: repositories.workingSnapshotRepository,
        snapshotVersionRepository: repositories.snapshotVersionRepository,
      }),
      getSnapshotVersionById: new GetSnapshotVersionByIdUseCase({
        workingSnapshotRepository: repositories.workingSnapshotRepository,
        snapshotVersionRepository: repositories.snapshotVersionRepository,
      }),
      diffWorkingSnapshotAgainstVersion:
        new DiffWorkingSnapshotAgainstVersionUseCase({
          workingSnapshotRepository: repositories.workingSnapshotRepository,
          snapshotVersionRepository: repositories.snapshotVersionRepository,
        }),
      restoreWorkingSnapshotFromVersion:
        new RestoreWorkingSnapshotFromVersionUseCase({
          workingSnapshotRepository: repositories.workingSnapshotRepository,
          snapshotVersionRepository: repositories.snapshotVersionRepository,
          semanticPolicyRepository: repositories.semanticPolicyRepository,
          semanticEventLogRepository: repositories.semanticEventLogRepository,
        }),
    },
    importing: {
      importPrismaSchemaToSnapshot: importPrismaSchemaToSnapshotUseCase,
      importPrismaSchemaFileToSnapshot:
        new ImportPrismaSchemaFileToSnapshotUseCase({
          prismaSchemaFileImportSource:
            repositories.prismaSchemaFileImportSource,
          importPrismaSchemaToSnapshot: importPrismaSchemaToSnapshotUseCase,
        }),
      importPostgresToSnapshot: new ImportPostgresToSnapshotUseCase({
        postgresImportIntrospectionPort:
          repositories.postgresImportIntrospectionPort,
        importPrismaSchemaToSnapshot: importPrismaSchemaToSnapshotUseCase,
      }),
    },
    semantics: {
      getOrCreatePolicy: new GetOrCreateSemanticPolicyUseCase({
        semanticPolicyRepository: repositories.semanticPolicyRepository,
        semanticEventLogRepository: repositories.semanticEventLogRepository,
        workingSnapshotRepository: repositories.workingSnapshotRepository,
      }),
      updatePolicy: new UpdateSemanticPolicyUseCase({
        semanticPolicyRepository: repositories.semanticPolicyRepository,
        semanticEventLogRepository: repositories.semanticEventLogRepository,
        workingSnapshotRepository: repositories.workingSnapshotRepository,
      }),
      validateDraft: new ValidateSemanticDraftUseCase({
        semanticPolicyRepository: repositories.semanticPolicyRepository,
        semanticEventLogRepository: repositories.semanticEventLogRepository,
        workingSnapshotRepository: repositories.workingSnapshotRepository,
      }),
      auditWorkingSnapshot: new AuditWorkingSnapshotUseCase({
        semanticPolicyRepository: repositories.semanticPolicyRepository,
        semanticEventLogRepository: repositories.semanticEventLogRepository,
        workingSnapshotRepository: repositories.workingSnapshotRepository,
      }),
    },
  };
}

export type ServerUseCases = ReturnType<typeof createServerUseCases>;
