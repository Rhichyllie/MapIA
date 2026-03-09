import { AppError } from "@/src/lib/app-error";
import {
  hasMinimumSemanticOverrideReason,
  runGraphAudit,
  type SemanticEngineOptions,
  type SemanticMode,
} from "@/src/modules/semantics/domain";
import type {
  WorkingSnapshotRecord,
  WorkingSnapshotRepository,
} from "@/src/modules/graph/application";
import type {
  SemanticEventLogRepository,
  SemanticPolicyRecord,
  SemanticPolicyRepository,
} from "@/src/modules/semantics/application";
import type {
  EditorSnapshotVersion,
  EditorSnapshotVersionSummary,
  GraphSnapshotDiff,
} from "@/src/modules/versioning/domain";
import {
  computeGraphSnapshotDiff,
  EditorSnapshotVersionSummarySchema,
} from "@/src/modules/versioning/domain";
import type { SnapshotVersionRepository } from "./ports";
import {
  CreateSnapshotVersionFromWorkingSnapshotInputSchema,
  type CreateSnapshotVersionFromWorkingSnapshotInput,
  DiffWorkingSnapshotAgainstVersionInputSchema,
  type DiffWorkingSnapshotAgainstVersionInput,
  GetSnapshotVersionByIdInputSchema,
  type GetSnapshotVersionByIdInput,
  ListSnapshotVersionsInputSchema,
  type ListSnapshotVersionsInput,
  RestoreWorkingSnapshotFromVersionInputSchema,
  type RestoreWorkingSnapshotFromVersionInput,
} from "./schemas";

type VersioningUseCaseDeps = {
  workingSnapshotRepository: WorkingSnapshotRepository;
  snapshotVersionRepository: SnapshotVersionRepository;
  semanticPolicyRepository?: SemanticPolicyRepository;
  semanticEventLogRepository?: SemanticEventLogRepository;
};

export type RestoreWorkingSnapshotFromVersionResult = {
  message: string;
  restoredFromVersionId: string;
  workingSnapshot: WorkingSnapshotRecord;
};

export type GetSnapshotVersionDiffAgainstWorkingSnapshotResult = {
  version: EditorSnapshotVersionSummary;
  diff: GraphSnapshotDiff;
};

async function loadWorkingSnapshotOrThrow(
  workingSnapshotRepository: WorkingSnapshotRepository,
  projectId: string,
) {
  const workingSnapshot = await workingSnapshotRepository.load(projectId);

  if (!workingSnapshot) {
    throw new AppError(
      "Snapshot de trabalho nao encontrado. Gere o snapshot inicial pelo wizard.",
      {
        code: "WORKING_SNAPSHOT_NOT_FOUND",
        status: 404,
      },
    );
  }

  return workingSnapshot;
}

async function loadSnapshotVersionOrThrow(
  snapshotVersionRepository: SnapshotVersionRepository,
  projectId: string,
  versionId: string,
) {
  const version = await snapshotVersionRepository.getById(projectId, versionId);

  if (!version) {
    throw new AppError("Versao de snapshot nao encontrada.", {
      code: "SNAPSHOT_VERSION_NOT_FOUND",
      status: 404,
    });
  }

  return version;
}

function toSnapshotVersionSummary(
  version: EditorSnapshotVersion,
): EditorSnapshotVersionSummary {
  return EditorSnapshotVersionSummarySchema.parse({
    id: version.id,
    projectId: version.projectId,
    label: version.label,
    origin: version.origin,
    createdAt: version.createdAt,
  });
}

function resolveSemanticMode(mode: "operational" | "technical" | undefined): SemanticMode {
  return mode === "technical" ? "technical" : "operational";
}

function resolvePolicyDiagramType(policy: SemanticPolicyRecord, snapshotDiagramType?: string) {
  if (policy.diagramType && policy.diagramType.trim()) {
    return policy.diagramType;
  }

  if (snapshotDiagramType && snapshotDiagramType.trim()) {
    return snapshotDiagramType;
  }

  return undefined;
}

function buildSemanticEngineOptions(
  policy: SemanticPolicyRecord,
): SemanticEngineOptions {
  return {
    strictEnabled: policy.strictEnabled,
    ...(policy.customRulesJson ? { customRulesJson: policy.customRulesJson } : {}),
  };
}

function canUseTechnicalOverride(input: {
  mode: SemanticMode;
  policy: SemanticPolicyRecord;
  allowSemanticOverride?: boolean;
  overrideReason?: string;
}) {
  if (input.mode !== "technical") {
    return false;
  }

  if (!input.policy.allowTechOverride || !input.allowSemanticOverride) {
    return false;
  }

  if (!input.policy.requireOverrideReason) {
    return true;
  }

  return hasMinimumSemanticOverrideReason(input.overrideReason);
}

async function appendSemanticEvent(
  deps: VersioningUseCaseDeps,
  input: {
    projectId: string;
    actorIdentity?: string;
    eventType: string;
    severity: "error" | "warning" | "info";
    payloadJson: Record<string, unknown>;
  },
) {
  await deps.semanticEventLogRepository?.append({
    projectId: input.projectId,
    actorIdentity: input.actorIdentity,
    eventType: input.eventType,
    severity: input.severity,
    payloadJson: input.payloadJson,
  });
}

async function loadOrCreateSemanticPolicy(
  deps: VersioningUseCaseDeps,
  input: {
    projectId: string;
    actorIdentity?: string;
    snapshotDiagramType?: string;
  },
): Promise<SemanticPolicyRecord> {
  const policyRepository = deps.semanticPolicyRepository;
  if (!policyRepository) {
    const now = new Date();
    return {
      id: `default-policy-${input.projectId}`,
      projectId: input.projectId,
      diagramType: input.snapshotDiagramType,
      strictEnabled: true,
      enforceOnServer: true,
      allowTechOverride: false,
      requireOverrideReason: true,
      version: 1,
      updatedByIdentity: input.actorIdentity,
      updatedAt: now,
      createdAt: now,
    };
  }

  const existing = await policyRepository.loadByProjectId(input.projectId);
  if (existing) {
    return existing;
  }

  return policyRepository.create({
    projectId: input.projectId,
    diagramType: input.snapshotDiagramType,
    strictEnabled: true,
    enforceOnServer: true,
    allowTechOverride: false,
    requireOverrideReason: true,
    updatedByIdentity: input.actorIdentity,
  });
}

export class CreateSnapshotVersionFromWorkingSnapshotUseCase {
  constructor(private readonly deps: VersioningUseCaseDeps) {}

  async execute(
    input: CreateSnapshotVersionFromWorkingSnapshotInput,
  ): Promise<EditorSnapshotVersion> {
    const parsed = CreateSnapshotVersionFromWorkingSnapshotInputSchema.parse(input);
    const workingSnapshot = await loadWorkingSnapshotOrThrow(
      this.deps.workingSnapshotRepository,
      parsed.projectId,
    );

    return this.deps.snapshotVersionRepository.create({
      projectId: parsed.projectId,
      snapshot: workingSnapshot.snapshot,
      label: parsed.label,
      origin: parsed.origin ?? "manual",
    });
  }
}

export class ListSnapshotVersionsUseCase {
  constructor(private readonly deps: VersioningUseCaseDeps) {}

  async execute(
    input: ListSnapshotVersionsInput,
  ): Promise<EditorSnapshotVersionSummary[]> {
    const parsed = ListSnapshotVersionsInputSchema.parse(input);
    return this.deps.snapshotVersionRepository.listByProject(parsed.projectId);
  }
}

export class GetSnapshotVersionByIdUseCase {
  constructor(private readonly deps: VersioningUseCaseDeps) {}

  async execute(input: GetSnapshotVersionByIdInput): Promise<EditorSnapshotVersion> {
    const parsed = GetSnapshotVersionByIdInputSchema.parse(input);
    return loadSnapshotVersionOrThrow(
      this.deps.snapshotVersionRepository,
      parsed.projectId,
      parsed.versionId,
    );
  }
}

export class GetSnapshotVersionDiffAgainstWorkingSnapshotUseCase {
  constructor(private readonly deps: VersioningUseCaseDeps) {}

  async execute(
    input: DiffWorkingSnapshotAgainstVersionInput,
  ): Promise<GetSnapshotVersionDiffAgainstWorkingSnapshotResult> {
    const parsed = DiffWorkingSnapshotAgainstVersionInputSchema.parse(input);
    const [version, workingSnapshot] = await Promise.all([
      loadSnapshotVersionOrThrow(
        this.deps.snapshotVersionRepository,
        parsed.projectId,
        parsed.versionId,
      ),
      loadWorkingSnapshotOrThrow(this.deps.workingSnapshotRepository, parsed.projectId),
    ]);

    return {
      version: toSnapshotVersionSummary(version),
      diff: computeGraphSnapshotDiff({
        baseSnapshot: version.snapshot,
        targetSnapshot: workingSnapshot.snapshot,
      }),
    };
  }
}

export class DiffWorkingSnapshotAgainstVersionUseCase extends GetSnapshotVersionDiffAgainstWorkingSnapshotUseCase {}

export class RestoreWorkingSnapshotFromVersionUseCase {
  constructor(private readonly deps: VersioningUseCaseDeps) {}

  async execute(
    input: RestoreWorkingSnapshotFromVersionInput,
  ): Promise<RestoreWorkingSnapshotFromVersionResult> {
    const parsed = RestoreWorkingSnapshotFromVersionInputSchema.parse(input);
    const mode = resolveSemanticMode(parsed.semanticMode);
    const version = await loadSnapshotVersionOrThrow(
      this.deps.snapshotVersionRepository,
      parsed.projectId,
      parsed.versionId,
    );
    const currentWorkingSnapshot = await loadWorkingSnapshotOrThrow(
      this.deps.workingSnapshotRepository,
      parsed.projectId,
    );
    const snapshotToRestore = structuredClone(version.snapshot);
    const policy = await loadOrCreateSemanticPolicy(this.deps, {
      projectId: parsed.projectId,
      actorIdentity: parsed.actorIdentity,
      snapshotDiagramType: snapshotToRestore.diagramType,
    });

    if (policy.enforceOnServer) {
      const engineOptions = buildSemanticEngineOptions(policy);
      const audit = runGraphAudit(
        {
          nodes: snapshotToRestore.nodes.map((node) => ({
            id: node.id,
            kind: node.kind,
            label: node.label,
            payload: node.data,
          })),
          edges: snapshotToRestore.edges.map((edge) => ({
            id: edge.id,
            sourceNodeId: edge.sourceNodeId,
            targetNodeId: edge.targetNodeId,
            kind: edge.kind,
            label: edge.label,
            payload: edge.data,
          })),
        },
        resolvePolicyDiagramType(policy, snapshotToRestore.diagramType),
        "operational",
        engineOptions,
      );

      if (policy.strictEnabled && audit.bySeverity.error > 0) {
        const canOverride = canUseTechnicalOverride({
          mode,
          policy,
          allowSemanticOverride: parsed.allowSemanticOverride,
          overrideReason: parsed.overrideReason,
        });

        if (!canOverride) {
          await appendSemanticEvent(this.deps, {
            projectId: parsed.projectId,
            actorIdentity: parsed.actorIdentity,
            eventType: "semantic_violation_blocked",
            severity: "error",
            payloadJson: {
              mode,
              source: "restore_snapshot_version",
              violations: audit.issues.slice(0, 50),
              bySeverity: audit.bySeverity,
            },
          });

          throw new AppError(
            "Snapshot restaurado viola regras semanticas da politica atual.",
            {
              code: "SEMANTIC_VIOLATION",
              status: 422,
              details: {
                violations: audit.issues,
                bySeverity: audit.bySeverity,
                counters: audit.counters,
                overrideAllowed: policy.allowTechOverride,
                requireOverrideReason: policy.requireOverrideReason,
              },
            },
          );
        }

        await appendSemanticEvent(this.deps, {
          projectId: parsed.projectId,
          actorIdentity: parsed.actorIdentity,
          eventType: "semantic_override_applied",
          severity: "warning",
          payloadJson: {
            mode,
            source: "restore_snapshot_version",
            reason: parsed.overrideReason,
            bySeverity: audit.bySeverity,
            issuesCount: audit.counters.total,
          },
        });
      }

      if (
        audit.counters.total > 0 &&
        !(policy.strictEnabled && audit.bySeverity.error > 0)
      ) {
        await appendSemanticEvent(this.deps, {
          projectId: parsed.projectId,
          actorIdentity: parsed.actorIdentity,
          eventType: "restore_semantic_issues_marked",
          severity: audit.bySeverity.error > 0 ? "error" : "warning",
          payloadJson: {
            mode,
            source: "restore_snapshot_version",
            bySeverity: audit.bySeverity,
            issuesCount: audit.counters.total,
            issuesPreview: audit.issues.slice(0, 50),
          },
        });
      }
    }

    const workingSnapshot = await this.deps.workingSnapshotRepository.save({
      projectId: parsed.projectId,
      snapshot: snapshotToRestore,
      actorIdentity: parsed.actorIdentity,
      label: currentWorkingSnapshot.label ?? "fase1-working-v1",
      expectedRevision: parsed.expectedRevision,
    });

    await appendSemanticEvent(this.deps, {
      projectId: parsed.projectId,
      actorIdentity: parsed.actorIdentity,
      eventType: "restore_applied",
      severity: "info",
      payloadJson: {
        restoredFromVersionId: version.id,
        newRevision: workingSnapshot.revision,
      },
    });

    return {
      message: "Snapshot de trabalho restaurado com sucesso.",
      restoredFromVersionId: version.id,
      workingSnapshot,
    };
  }
}
