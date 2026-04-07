import { AppError } from "@/src/lib/app-error";
import { withTelemetrySpan } from "@/src/lib/telemetry-span";
import { validateGraphSnapshotInvariants } from "@/src/modules/graph/domain";
import {
  normalizeErdPolicyFromCustomRules,
  normalizeErdRelationPayload,
} from "@/src/modules/erd/domain";
import {
  hasMinimumSemanticOverrideReason,
  runGraphAudit,
  validateEdgeCreation,
  validateEdgeKindChange,
  validateNodeKindChange,
  type SemanticEngineOptions,
  type SemanticMode,
  type SemanticViolation,
} from "@/src/modules/semantics/domain";
import type {
  SemanticEventLogRepository,
  SemanticPolicyRecord,
  SemanticPolicyRepository,
} from "@/src/modules/semantics/application";
import type { WorkingSnapshotRecord } from "@/src/modules/graph/application";
import type { EditorSnapshotGateway } from "./ports";
import {
  type ApplyEditorCommandInput,
  ApplyEditorCommandInputSchema,
  type ApplyEditorCommandsInput,
  ApplyEditorCommandsInputSchema,
  type EditorCommand,
  type GetWorkingSnapshotForEditorInput,
  GetWorkingSnapshotForEditorInputSchema,
  type SaveEditorFullSnapshotInput,
  SaveEditorFullSnapshotInputSchema,
} from "./schemas";
import { applyEditorCommandToSnapshot } from "./command-processor";

type EditorUseCaseDeps = {
  editorSnapshotGateway: EditorSnapshotGateway;
  semanticPolicyRepository?: SemanticPolicyRepository;
  semanticEventLogRepository?: SemanticEventLogRepository;
};

function resolveSemanticMode(mode: "operational" | "technical" | undefined): SemanticMode {
  return mode === "technical" ? "technical" : "operational";
}

function buildDefaultSemanticPolicy(projectId: string): SemanticPolicyRecord {
  const now = new Date();
  return {
    id: `default-policy-${projectId}`,
    projectId,
    strictEnabled: true,
    enforceOnServer: true,
    allowTechOverride: false,
    requireOverrideReason: true,
    version: 1,
    updatedAt: now,
    createdAt: now,
  };
}

function resolvePolicyDiagramType(policy: SemanticPolicyRecord, snapshotDiagramType?: string) {
  if (policy.diagramType && policy.diagramType.trim()) {
    return policy.diagramType;
  }

  if (snapshotDiagramType && snapshotDiagramType.trim() === "erd") {
    return "erd";
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

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function isErdDiagramType(diagramType: string | undefined) {
  return diagramType === "erd";
}

function resolveSnapshotSemanticDiagramType(snapshot: {
  diagramType?: string;
  diagramView?: string;
}) {
  if (snapshot.diagramView === "erd") {
    return "erd";
  }

  return snapshot.diagramType;
}

function enrichCommandForSemanticPolicy(input: {
  command: EditorCommand;
  snapshot: WorkingSnapshotRecord["snapshot"];
  policy: SemanticPolicyRecord;
}): EditorCommand {
  const command = input.command;
  const diagramType = resolvePolicyDiagramType(
    input.policy,
    resolveSnapshotSemanticDiagramType(input.snapshot),
  );

  if (diagramType !== "erd") {
    return command;
  }

  if (command.type === "addEdge") {
    if (command.edge.kind !== "references") {
      return command;
    }

    return {
      ...command,
      edge: {
        ...command.edge,
        data: normalizeErdRelationPayload(readRecord(command.edge.data), {
          sourceEntityId: command.edge.sourceNodeId,
          targetEntityId: command.edge.targetNodeId,
        }) as unknown as Record<string, unknown>,
      },
    };
  }

  if (command.type === "updateEdge") {
    const currentEdge = input.snapshot.edges.find(
      (edge) => edge.id === command.edgeId,
    );

    if (!currentEdge) {
      return command;
    }

    const nextKind = command.patch.kind ?? currentEdge.kind;
    if (nextKind !== "references") {
      return command;
    }

    return {
      ...command,
      patch: {
        ...command.patch,
        data: normalizeErdRelationPayload(
          readRecord(command.patch.data ?? currentEdge.data),
          {
            sourceEntityId: currentEdge.sourceNodeId,
            targetEntityId: currentEdge.targetNodeId,
          },
        ) as unknown as Record<string, unknown>,
      },
    };
  }

  return command;
}

function commandHasRepairAppliedFlag(command: EditorCommand) {
  return command.meta?.repairApplied === true;
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
  deps: EditorUseCaseDeps,
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

async function loadOrCreateSemanticPolicy(input: {
  deps: EditorUseCaseDeps;
  projectId: string;
  actorIdentity?: string;
  snapshotDiagramType?: string;
}): Promise<SemanticPolicyRecord> {
  const repository = input.deps.semanticPolicyRepository;

  if (!repository) {
    return {
      ...buildDefaultSemanticPolicy(input.projectId),
      diagramType: input.snapshotDiagramType,
      updatedByIdentity: input.actorIdentity,
    };
  }

  const existing = await repository.loadByProjectId(input.projectId);
  if (existing) {
    return existing;
  }

  return repository.create({
    projectId: input.projectId,
    diagramType: input.snapshotDiagramType,
    strictEnabled: true,
    enforceOnServer: true,
    allowTechOverride: false,
    requireOverrideReason: true,
    ...(input.snapshotDiagramType === "erd"
      ? {
          customRulesJson: {
            erd: normalizeErdPolicyFromCustomRules(undefined),
          },
        }
      : {}),
    updatedByIdentity: input.actorIdentity,
  });
}

async function loadValidatedWorkingSnapshotOrThrow(
  editorSnapshotGateway: EditorSnapshotGateway,
  projectId: string,
): Promise<WorkingSnapshotRecord> {
  const current = await editorSnapshotGateway.loadWorkingSnapshot(projectId);

  if (!current) {
    throw new AppError(
      "Mapa inicial nao encontrado. Gere pelo Assistente de criacao.",
      {
        code: "WORKING_SNAPSHOT_NOT_FOUND",
        status: 404,
      },
    );
  }

  return {
    ...current,
    snapshot: validateGraphSnapshotInvariants(current.snapshot),
  };
}

async function enforceCommandSemantics(input: {
  deps: EditorUseCaseDeps;
  projectId: string;
  actorIdentity?: string;
  mode: SemanticMode;
  policy: SemanticPolicyRecord;
  snapshot: WorkingSnapshotRecord["snapshot"];
  command: EditorCommand;
  allowSemanticOverride?: boolean;
  overrideReason?: string;
}) {
  const { policy } = input;
  if (!policy.enforceOnServer) {
    return;
  }

  const diagramType = resolvePolicyDiagramType(policy, input.snapshot.diagramType);
  if (isErdDiagramType(diagramType)) {
    return;
  }

  if (!policy.strictEnabled) {
    return;
  }

  const engineOptions = buildSemanticEngineOptions(policy);
  const canOverride = canUseTechnicalOverride({
    mode: input.mode,
    policy,
    allowSemanticOverride: input.allowSemanticOverride,
    overrideReason: input.overrideReason,
  });
  const overrideReason = input.overrideReason?.trim();
  const command = input.command;

  switch (command.type) {
    case "addEdge": {
      const sourceNode = input.snapshot.nodes.find(
        (node) => node.id === command.edge.sourceNodeId,
      );
      const targetNode = input.snapshot.nodes.find(
        (node) => node.id === command.edge.targetNodeId,
      );

      const validation = validateEdgeCreation({
        diagramType,
        mode: input.mode,
        sourceNode: sourceNode
          ? {
              id: sourceNode.id,
              kind: sourceNode.kind,
              label: sourceNode.label,
              payload: sourceNode.data,
            }
          : undefined,
        targetNode: targetNode
          ? {
              id: targetNode.id,
              kind: targetNode.kind,
              label: targetNode.label,
              payload: targetNode.data,
            }
          : undefined,
        edgeKind: command.edge.kind,
      }, engineOptions);

      if (!validation.ok) {
        if (canOverride) {
          await appendSemanticEvent(input.deps, {
            projectId: input.projectId,
            actorIdentity: input.actorIdentity,
            eventType: "semantic_override_applied",
            severity: "warning",
            payloadJson: {
              mode: input.mode,
              commandType: command.type,
              reason: overrideReason,
              violation: validation.violation,
            },
          });
          return;
        }

        await appendSemanticEvent(input.deps, {
          projectId: input.projectId,
          actorIdentity: input.actorIdentity,
          eventType: "semantic_violation_blocked",
          severity: "error",
          payloadJson: {
            mode: input.mode,
            commandType: command.type,
            violation: validation.violation,
            allowedEdgeKinds: validation.allowedEdgeKinds,
            recommendedEdgeKind: validation.recommendedEdgeKind,
          },
        });

        throw new AppError(
          validation.violation?.message ?? "Conexao invalida para o diagrama atual.",
          {
            code: "SEMANTIC_VIOLATION",
            status: 422,
            details: {
              details: validation.violation?.details,
              allowedEdgeKinds: validation.allowedEdgeKinds,
              recommendedEdgeKind: validation.recommendedEdgeKind,
              violations: validation.violation ? [validation.violation] : [],
              overrideAllowed: policy.allowTechOverride,
              requireOverrideReason: policy.requireOverrideReason,
            },
          },
        );
      }

      return;
    }

    case "updateEdge": {
      if (!command.patch.kind) {
        return;
      }

      const currentEdge = input.snapshot.edges.find(
        (edge) => edge.id === command.edgeId,
      );

      if (!currentEdge) {
        return;
      }

      const sourceNode = input.snapshot.nodes.find(
        (node) => node.id === currentEdge.sourceNodeId,
      );
      const targetNode = input.snapshot.nodes.find(
        (node) => node.id === currentEdge.targetNodeId,
      );
      const validation = validateEdgeKindChange({
        diagramType,
        mode: input.mode,
        edge: {
          id: currentEdge.id,
          sourceNodeId: currentEdge.sourceNodeId,
          targetNodeId: currentEdge.targetNodeId,
          kind: currentEdge.kind,
          label: currentEdge.label,
          payload: currentEdge.data,
        },
        sourceNode: sourceNode
          ? {
              id: sourceNode.id,
              kind: sourceNode.kind,
              label: sourceNode.label,
              payload: sourceNode.data,
            }
          : undefined,
        targetNode: targetNode
          ? {
              id: targetNode.id,
              kind: targetNode.kind,
              label: targetNode.label,
              payload: targetNode.data,
            }
          : undefined,
        nextKind: command.patch.kind,
      }, engineOptions);

      if (!validation.ok) {
        if (canOverride) {
          await appendSemanticEvent(input.deps, {
            projectId: input.projectId,
            actorIdentity: input.actorIdentity,
            eventType: "semantic_override_applied",
            severity: "warning",
            payloadJson: {
              mode: input.mode,
              commandType: command.type,
              reason: overrideReason,
              violation: validation.violation,
            },
          });
          return;
        }

        await appendSemanticEvent(input.deps, {
          projectId: input.projectId,
          actorIdentity: input.actorIdentity,
          eventType: "semantic_violation_blocked",
          severity: "error",
          payloadJson: {
            mode: input.mode,
            commandType: command.type,
            violation: validation.violation,
            recommendedEdgeKind: validation.recommendedEdgeKind,
          },
        });

        throw new AppError(
          validation.violation?.message ?? "Tipo de relacao invalido para esta conexao.",
          {
            code: "SEMANTIC_VIOLATION",
            status: 422,
            details: {
              details: validation.violation?.details,
              recommendedEdgeKind: validation.recommendedEdgeKind,
              violations: validation.violation ? [validation.violation] : [],
              overrideAllowed: policy.allowTechOverride,
              requireOverrideReason: policy.requireOverrideReason,
            },
          },
        );
      }

      return;
    }

    case "updateNode": {
      const currentNode = input.snapshot.nodes.find(
        (node) => node.id === command.nodeId,
      );

      if (!currentNode) {
        return;
      }

      if (command.patch.kind && currentNode.kind !== command.patch.kind) {
        const validation = validateNodeKindChange({
          diagramType,
          // Technical mode only permits an explicit override at backend level.
          // Validation itself stays strict so 409/422 is deterministic.
          mode: "operational",
          nodeId: command.nodeId,
          nextKind: command.patch.kind,
          nodes: input.snapshot.nodes.map((node) => ({
            id: node.id,
            kind: node.kind,
            label: node.label,
            payload: node.data,
          })),
          edges: input.snapshot.edges.map((edge) => ({
            id: edge.id,
            sourceNodeId: edge.sourceNodeId,
            targetNodeId: edge.targetNodeId,
            kind: edge.kind,
            label: edge.label,
            payload: edge.data,
          })),
        }, engineOptions);

        if (validation.violations.length > 0) {
          if (canOverride) {
            await appendSemanticEvent(input.deps, {
              projectId: input.projectId,
              actorIdentity: input.actorIdentity,
              eventType: "semantic_override_applied",
              severity: "warning",
              payloadJson: {
                mode: input.mode,
                commandType: command.type,
                reason: overrideReason,
                violations: validation.violations,
              },
            });
            return;
          }

          const hasRepairPlan =
            Boolean(validation.repairPlan) &&
            (validation.repairPlan?.actions.length ?? 0) > 0;

          await appendSemanticEvent(input.deps, {
            projectId: input.projectId,
            actorIdentity: input.actorIdentity,
            eventType: "semantic_violation_blocked",
            severity: "error",
            payloadJson: {
              mode: input.mode,
              commandType: command.type,
              violations: validation.violations,
              repairPlan: validation.repairPlan,
            },
          });

          if (hasRepairPlan) {
            throw new AppError("Alteracao exige reparo semantico antes de aplicar.", {
              code: "REPAIR_REQUIRED",
              status: 409,
              details: {
                repairPlan: validation.repairPlan,
                violations: validation.violations,
                overrideAllowed: policy.allowTechOverride,
                requireOverrideReason: policy.requireOverrideReason,
              },
            });
          }

          throw new AppError("Alteracao de tipo viola regras semanticas do diagrama.", {
            code: "SEMANTIC_VIOLATION",
            status: 422,
            details: {
              violations: validation.violations,
              overrideAllowed: policy.allowTechOverride,
              requireOverrideReason: policy.requireOverrideReason,
            },
          });
        }
      }

      if (
        diagramType === "flow" &&
        (command.patch.kind !== undefined ||
          command.patch.label !== undefined ||
          command.patch.data !== undefined)
      ) {
        const projectedSnapshot = applyEditorCommandToSnapshot(
          input.snapshot,
          input.projectId,
          command,
        );
        const nodeById = new Map(
          projectedSnapshot.nodes.map((node) => [
            node.id,
            {
              id: node.id,
              kind: node.kind,
              label: node.label,
              payload: node.data,
            },
          ] as const),
        );
        const relatedViolations = projectedSnapshot.edges
          .filter(
            (edge) =>
              edge.sourceNodeId === command.nodeId || edge.targetNodeId === command.nodeId,
          )
          .map((edge) =>
            validateEdgeCreation(
              {
                diagramType,
                mode: "operational",
                sourceNode: nodeById.get(edge.sourceNodeId),
                targetNode: nodeById.get(edge.targetNodeId),
                edgeKind: edge.kind,
              },
              engineOptions,
            ).violation,
          )
          .filter((violation): violation is SemanticViolation => Boolean(violation));

        if (relatedViolations.length > 0) {
          if (canOverride) {
            await appendSemanticEvent(input.deps, {
              projectId: input.projectId,
              actorIdentity: input.actorIdentity,
              eventType: "semantic_override_applied",
              severity: "warning",
              payloadJson: {
                mode: input.mode,
                commandType: command.type,
                reason: overrideReason,
                violations: relatedViolations,
              },
            });
            return;
          }

          await appendSemanticEvent(input.deps, {
            projectId: input.projectId,
            actorIdentity: input.actorIdentity,
            eventType: "semantic_violation_blocked",
            severity: "error",
            payloadJson: {
              mode: input.mode,
              commandType: command.type,
              violations: relatedViolations,
            },
          });

          throw new AppError(
            relatedViolations[0]?.message ??
              "Alteracao deixa ligacoes do processo inconsistentes.",
            {
              code: "SEMANTIC_VIOLATION",
              status: 422,
              details: {
                violations: relatedViolations,
                overrideAllowed: policy.allowTechOverride,
                requireOverrideReason: policy.requireOverrideReason,
              },
            },
          );
        }
      }

      return;
    }

    default:
      return;
  }
}

async function enforceSnapshotSemantics(input: {
  deps: EditorUseCaseDeps;
  projectId: string;
  actorIdentity?: string;
  mode: SemanticMode;
  policy: SemanticPolicyRecord;
  snapshot: WorkingSnapshotRecord["snapshot"];
  allowSemanticOverride?: boolean;
  overrideReason?: string;
}) {
  const { policy } = input;
  if (!policy.enforceOnServer) {
    return;
  }

  const diagramType = resolvePolicyDiagramType(policy, input.snapshot.diagramType);
  if (isErdDiagramType(diagramType)) {
    return;
  }

  if (!policy.strictEnabled) {
    return;
  }

  const engineOptions = buildSemanticEngineOptions(policy);
  const audit = runGraphAudit(
    {
      nodes: input.snapshot.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        label: node.label,
        payload: node.data,
      })),
      edges: input.snapshot.edges.map((edge) => ({
        id: edge.id,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        kind: edge.kind,
        label: edge.label,
        payload: edge.data,
      })),
    },
    diagramType,
    "operational",
    engineOptions,
  );

  if (audit.bySeverity.error === 0) {
    return;
  }

  const canOverride = canUseTechnicalOverride({
    mode: input.mode,
    policy,
    allowSemanticOverride: input.allowSemanticOverride,
    overrideReason: input.overrideReason,
  });

  if (canOverride) {
    await appendSemanticEvent(input.deps, {
      projectId: input.projectId,
      actorIdentity: input.actorIdentity,
      eventType: "semantic_override_applied",
      severity: "warning",
      payloadJson: {
        mode: input.mode,
        reason: input.overrideReason,
        issuesCount: audit.counters.total,
        bySeverity: audit.bySeverity,
      },
    });
    return;
  }

  await appendSemanticEvent(input.deps, {
    projectId: input.projectId,
    actorIdentity: input.actorIdentity,
    eventType: "semantic_violation_blocked",
    severity: "error",
    payloadJson: {
      mode: input.mode,
      issuesCount: audit.counters.total,
      bySeverity: audit.bySeverity,
      issues: audit.issues.slice(0, 50),
    },
  });

  throw new AppError(
    "Snapshot viola regras semanticas e nao pode ser salvo com politica estrita.",
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

export class GetWorkingSnapshotForEditorUseCase {
  constructor(private readonly deps: EditorUseCaseDeps) {}

  async execute(
    input: GetWorkingSnapshotForEditorInput,
  ): Promise<WorkingSnapshotRecord | null> {
    return await withTelemetrySpan(
      "editor.snapshot.read",
      {
        attributes: {
          "editor.snapshot.source": "editor_gateway",
        },
      },
      async (span) => {
        const parsed = GetWorkingSnapshotForEditorInputSchema.parse(input);
        span.setAttribute("editor.snapshot.project_id", parsed.projectId);
        const current = await this.deps.editorSnapshotGateway.loadWorkingSnapshot(
          parsed.projectId,
        );

        span.setAttribute("editor.snapshot.found", Boolean(current));
        if (!current) {
          return null;
        }

        return {
          ...current,
          snapshot: validateGraphSnapshotInvariants(current.snapshot),
        };
      },
    );
  }
}

export class ApplyEditorCommandUseCase {
  constructor(private readonly deps: EditorUseCaseDeps) {}

  async execute(input: ApplyEditorCommandInput): Promise<WorkingSnapshotRecord> {
    const parsed = ApplyEditorCommandInputSchema.parse(input);
    const current = await loadValidatedWorkingSnapshotOrThrow(
      this.deps.editorSnapshotGateway,
      parsed.projectId,
    );
    const mode = resolveSemanticMode(parsed.semanticMode);
    const policy = await loadOrCreateSemanticPolicy({
      deps: this.deps,
      projectId: parsed.projectId,
      actorIdentity: parsed.actorIdentity,
      snapshotDiagramType: resolveSnapshotSemanticDiagramType(current.snapshot),
    });
    const command = enrichCommandForSemanticPolicy({
      command: parsed.command,
      snapshot: current.snapshot,
      policy,
    });

    await enforceCommandSemantics({
      deps: this.deps,
      projectId: parsed.projectId,
      actorIdentity: parsed.actorIdentity,
      mode,
      policy,
      snapshot: current.snapshot,
      command,
      allowSemanticOverride: parsed.allowSemanticOverride,
      overrideReason: parsed.overrideReason,
    });

    const nextSnapshot = applyEditorCommandToSnapshot(
      current.snapshot,
      parsed.projectId,
      command,
    );
    const persisted = await this.deps.editorSnapshotGateway.saveWorkingSnapshot({
      projectId: parsed.projectId,
      snapshot: nextSnapshot,
      actorIdentity: parsed.actorIdentity,
      label: parsed.label ?? current.label ?? "fase1-working-v1",
      expectedRevision: parsed.expectedRevision,
    });

    if (commandHasRepairAppliedFlag(command)) {
      await appendSemanticEvent(this.deps, {
        projectId: parsed.projectId,
        actorIdentity: parsed.actorIdentity,
        eventType: "repair_applied",
        severity: "info",
        payloadJson: {
          source: "editor_command",
          commandType: command.type,
          newRevision: persisted.revision,
        },
      });
    }

    return persisted;
  }
}

export class ApplyEditorCommandsUseCase {
  constructor(private readonly deps: EditorUseCaseDeps) {}

  async execute(input: ApplyEditorCommandsInput): Promise<WorkingSnapshotRecord> {
    const parsed = ApplyEditorCommandsInputSchema.parse(input);
    const current = await loadValidatedWorkingSnapshotOrThrow(
      this.deps.editorSnapshotGateway,
      parsed.projectId,
    );
    const mode = resolveSemanticMode(parsed.semanticMode);
    const policy = await loadOrCreateSemanticPolicy({
      deps: this.deps,
      projectId: parsed.projectId,
      actorIdentity: parsed.actorIdentity,
      snapshotDiagramType: resolveSnapshotSemanticDiagramType(current.snapshot),
    });

    let nextSnapshot = current.snapshot;
    let hasRepairAppliedCommand = false;
    for (const rawCommand of parsed.commands) {
      const command = enrichCommandForSemanticPolicy({
        command: rawCommand,
        snapshot: nextSnapshot,
        policy,
      });

      await enforceCommandSemantics({
        deps: this.deps,
        projectId: parsed.projectId,
        actorIdentity: parsed.actorIdentity,
        mode,
        policy,
        snapshot: nextSnapshot,
        command,
        allowSemanticOverride: parsed.allowSemanticOverride,
        overrideReason: parsed.overrideReason,
      });

      nextSnapshot = applyEditorCommandToSnapshot(
        nextSnapshot,
        parsed.projectId,
        command,
      );
      if (commandHasRepairAppliedFlag(command)) {
        hasRepairAppliedCommand = true;
      }
    }
    const persisted = await this.deps.editorSnapshotGateway.saveWorkingSnapshot({
      projectId: parsed.projectId,
      snapshot: nextSnapshot,
      actorIdentity: parsed.actorIdentity,
      label: parsed.label ?? current.label ?? "fase1-working-v1",
      expectedRevision: parsed.expectedRevision,
    });

    if (hasRepairAppliedCommand) {
      await appendSemanticEvent(this.deps, {
        projectId: parsed.projectId,
        actorIdentity: parsed.actorIdentity,
        eventType: "repair_applied",
        severity: "info",
        payloadJson: {
          source: "editor_commands_batch",
          commands: parsed.commands.length,
          newRevision: persisted.revision,
        },
      });
    }

    return persisted;
  }
}

export class SaveEditorFullSnapshotUseCase {
  constructor(private readonly deps: EditorUseCaseDeps) {}

  async execute(input: SaveEditorFullSnapshotInput): Promise<WorkingSnapshotRecord> {
    const parsed = SaveEditorFullSnapshotInputSchema.parse(input);
    const snapshot = validateGraphSnapshotInvariants(parsed.snapshot);
    const mode = resolveSemanticMode(parsed.semanticMode);
    const policy = await loadOrCreateSemanticPolicy({
      deps: this.deps,
      projectId: parsed.projectId,
      actorIdentity: parsed.actorIdentity,
      snapshotDiagramType: resolveSnapshotSemanticDiagramType(snapshot),
    });

    await enforceSnapshotSemantics({
      deps: this.deps,
      projectId: parsed.projectId,
      actorIdentity: parsed.actorIdentity,
      mode,
      policy,
      snapshot,
      allowSemanticOverride: parsed.allowSemanticOverride,
      overrideReason: parsed.overrideReason,
    });

    return this.deps.editorSnapshotGateway.saveWorkingSnapshot({
      projectId: parsed.projectId,
      snapshot,
      actorIdentity: parsed.actorIdentity,
      label: parsed.label ?? "fase1-working-v1",
      expectedRevision: parsed.expectedRevision,
    });
  }
}
