import { AppError } from "@/src/lib/app-error";
import type { GraphSnapshot } from "@/src/domain";
import {
  runGraphAudit,
  type SemanticEngineOptions,
  type SemanticGraph,
  type SemanticMode,
} from "@/src/modules/semantics/domain";
import type {
  AuditWorkingSnapshotResult,
  SemanticPolicyRecord,
  SemanticUseCaseDeps,
  ValidateSemanticDraftResult,
} from "./ports";
import {
  AuditWorkingSnapshotInputSchema,
  ResolveSemanticPolicyInputSchema,
  UpdateSemanticPolicyInputSchema,
  ValidateSemanticDraftInputSchema,
  type AuditWorkingSnapshotInput,
  type ResolveSemanticPolicyInput,
  type UpdateSemanticPolicyInput,
  type ValidateSemanticDraftInput,
} from "./schemas";

function toSemanticGraph(snapshot: GraphSnapshot): SemanticGraph {
  return {
    nodes: snapshot.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      label: node.label,
      payload: node.data,
    })),
    edges: snapshot.edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      kind: edge.kind,
      label: edge.label,
      payload: edge.data,
    })),
  };
}

function resolveSemanticMode(mode: "operational" | "technical" | undefined): SemanticMode {
  return mode === "technical" ? "technical" : "operational";
}

function resolvePolicyDiagramType(input: {
  policyDiagramType?: string;
  snapshotDiagramType?: string;
}) {
  if (input.policyDiagramType && input.policyDiagramType.trim()) {
    return input.policyDiagramType;
  }

  if (input.snapshotDiagramType && input.snapshotDiagramType.trim()) {
    return input.snapshotDiagramType;
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

async function appendAuditEventLog(deps: SemanticUseCaseDeps, input: {
  projectId: string;
  actorIdentity?: string;
  mode: SemanticMode;
  source: "draft_validate" | "working_snapshot_audit";
  issuesCount: number;
  bySeverity: { error: number; warning: number };
}) {
  await deps.semanticEventLogRepository.append({
    projectId: input.projectId,
    actorIdentity: input.actorIdentity,
    eventType: input.source === "draft_validate" ? "semantic_validate" : "audit_run",
    severity:
      input.bySeverity.error > 0
        ? "error"
        : input.bySeverity.warning > 0
          ? "warning"
          : "info",
    payloadJson: {
      mode: input.mode,
      source: input.source,
      issuesCount: input.issuesCount,
      bySeverity: input.bySeverity,
    },
  });
}

async function loadOrCreatePolicy(
  deps: SemanticUseCaseDeps,
  input: ResolveSemanticPolicyInput,
): Promise<SemanticPolicyRecord> {
  const parsed = ResolveSemanticPolicyInputSchema.parse(input);
  const currentPolicy = await deps.semanticPolicyRepository.loadByProjectId(
    parsed.projectId,
  );

  if (currentPolicy) {
    return currentPolicy;
  }

  const workingSnapshot = await deps.workingSnapshotRepository.load(parsed.projectId);

  return deps.semanticPolicyRepository.create({
    projectId: parsed.projectId,
    diagramType: workingSnapshot?.snapshot.diagramType,
    strictEnabled: true,
    enforceOnServer: true,
    allowTechOverride: false,
    requireOverrideReason: true,
    updatedByIdentity: parsed.actorIdentity,
  });
}

function buildSemanticAuditResult(input: {
  policy: SemanticPolicyRecord;
  snapshot: GraphSnapshot;
  mode: SemanticMode;
}): ValidateSemanticDraftResult {
  const engineOptions = buildSemanticEngineOptions(input.policy);
  const audit = runGraphAudit(
    toSemanticGraph(input.snapshot),
    resolvePolicyDiagramType({
      policyDiagramType: input.policy.diagramType,
      snapshotDiagramType: input.snapshot.diagramType,
    }),
    input.mode,
    engineOptions,
  );

  return {
    policy: input.policy,
    issues: audit.issues,
    counters: audit.counters,
    bySeverity: audit.bySeverity,
  };
}

export class GetOrCreateSemanticPolicyUseCase {
  constructor(private readonly deps: SemanticUseCaseDeps) {}

  async execute(input: ResolveSemanticPolicyInput): Promise<SemanticPolicyRecord> {
    return loadOrCreatePolicy(this.deps, input);
  }
}

export class UpdateSemanticPolicyUseCase {
  constructor(private readonly deps: SemanticUseCaseDeps) {}

  async execute(input: UpdateSemanticPolicyInput): Promise<SemanticPolicyRecord> {
    const parsed = UpdateSemanticPolicyInputSchema.parse(input);
    const currentPolicy = await loadOrCreatePolicy(this.deps, {
      projectId: parsed.projectId,
      actorIdentity: parsed.actorIdentity,
    });

    const hasPatch =
      parsed.diagramType !== undefined ||
      parsed.strictEnabled !== undefined ||
      parsed.enforceOnServer !== undefined ||
      parsed.allowTechOverride !== undefined ||
      parsed.requireOverrideReason !== undefined ||
      parsed.customRulesJson !== undefined;

    if (!hasPatch) {
      return currentPolicy;
    }

    return this.deps.semanticPolicyRepository.update({
      projectId: parsed.projectId,
      diagramType: parsed.diagramType ?? currentPolicy.diagramType,
      strictEnabled: parsed.strictEnabled ?? currentPolicy.strictEnabled,
      enforceOnServer: parsed.enforceOnServer ?? currentPolicy.enforceOnServer,
      allowTechOverride:
        parsed.allowTechOverride ?? currentPolicy.allowTechOverride,
      requireOverrideReason:
        parsed.requireOverrideReason ?? currentPolicy.requireOverrideReason,
      customRulesJson: parsed.customRulesJson ?? currentPolicy.customRulesJson,
      updatedByIdentity: parsed.actorIdentity,
    });
  }
}

export class ValidateSemanticDraftUseCase {
  constructor(private readonly deps: SemanticUseCaseDeps) {}

  async execute(input: ValidateSemanticDraftInput): Promise<ValidateSemanticDraftResult> {
    const parsed = ValidateSemanticDraftInputSchema.parse(input);
    const policy = await loadOrCreatePolicy(this.deps, {
      projectId: parsed.projectId,
      actorIdentity: parsed.actorIdentity,
    });
    const mode = resolveSemanticMode(parsed.mode);

    const result = buildSemanticAuditResult({
      policy,
      snapshot: parsed.snapshot,
      mode,
    });

    await appendAuditEventLog(this.deps, {
      projectId: parsed.projectId,
      actorIdentity: parsed.actorIdentity,
      mode,
      source: "draft_validate",
      issuesCount: result.counters.total,
      bySeverity: result.bySeverity,
    });

    return result;
  }
}

export class AuditWorkingSnapshotUseCase {
  constructor(private readonly deps: SemanticUseCaseDeps) {}

  async execute(input: AuditWorkingSnapshotInput): Promise<AuditWorkingSnapshotResult> {
    const parsed = AuditWorkingSnapshotInputSchema.parse(input);
    const workingSnapshot = await this.deps.workingSnapshotRepository.load(
      parsed.projectId,
    );

    if (!workingSnapshot) {
      throw new AppError(
        "Snapshot de trabalho nao encontrado. Gere o snapshot inicial pelo wizard.",
        {
          code: "WORKING_SNAPSHOT_NOT_FOUND",
          status: 404,
        },
      );
    }

    const policy = await loadOrCreatePolicy(this.deps, {
      projectId: parsed.projectId,
      actorIdentity: parsed.actorIdentity,
    });
    const mode = resolveSemanticMode(parsed.mode);
    const result = buildSemanticAuditResult({
      policy,
      snapshot: workingSnapshot.snapshot,
      mode,
    });

    await appendAuditEventLog(this.deps, {
      projectId: parsed.projectId,
      actorIdentity: parsed.actorIdentity,
      mode,
      source: "working_snapshot_audit",
      issuesCount: result.counters.total,
      bySeverity: result.bySeverity,
    });

    return {
      ...result,
      snapshotRevision: workingSnapshot.revision,
    };
  }
}
