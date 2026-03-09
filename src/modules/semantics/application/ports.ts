import type { WorkingSnapshotRepository } from "@/src/modules/graph/application";
import type { SemanticIssue } from "@/src/modules/semantics/domain";

export type SemanticPolicyRecord = {
  id: string;
  projectId: string;
  diagramType?: string;
  strictEnabled: boolean;
  enforceOnServer: boolean;
  allowTechOverride: boolean;
  requireOverrideReason: boolean;
  customRulesJson?: Record<string, unknown>;
  version: number;
  updatedByIdentity?: string;
  updatedAt: Date;
  createdAt: Date;
};

export type CreateSemanticPolicyInput = {
  projectId: string;
  diagramType?: string;
  strictEnabled?: boolean;
  enforceOnServer?: boolean;
  allowTechOverride?: boolean;
  requireOverrideReason?: boolean;
  customRulesJson?: Record<string, unknown>;
  updatedByIdentity?: string;
};

export type UpdateSemanticPolicyRecordInput = {
  projectId: string;
  diagramType?: string;
  strictEnabled?: boolean;
  enforceOnServer?: boolean;
  allowTechOverride?: boolean;
  requireOverrideReason?: boolean;
  customRulesJson?: Record<string, unknown>;
  updatedByIdentity?: string;
};

export interface SemanticPolicyRepository {
  loadByProjectId(projectId: string): Promise<SemanticPolicyRecord | null>;
  create(input: CreateSemanticPolicyInput): Promise<SemanticPolicyRecord>;
  update(input: UpdateSemanticPolicyRecordInput): Promise<SemanticPolicyRecord>;
}

export type SemanticEventLogRecord = {
  id: string;
  projectId: string;
  actorIdentity?: string;
  eventType: string;
  severity?: string;
  payloadJson: Record<string, unknown>;
  createdAt: Date;
};

export type AppendSemanticEventLogInput = {
  projectId: string;
  actorIdentity?: string;
  eventType: string;
  severity?: "error" | "warning" | "info";
  payloadJson: Record<string, unknown>;
};

export interface SemanticEventLogRepository {
  append(input: AppendSemanticEventLogInput): Promise<SemanticEventLogRecord>;
}

export type ValidateSemanticDraftResult = {
  policy: SemanticPolicyRecord;
  issues: SemanticIssue[];
  counters: {
    total: number;
    nodes: number;
    edges: number;
    graph: number;
  };
  bySeverity: {
    error: number;
    warning: number;
  };
};

export type AuditWorkingSnapshotResult = ValidateSemanticDraftResult & {
  snapshotRevision: number;
};

export type SemanticUseCaseDeps = {
  semanticPolicyRepository: SemanticPolicyRepository;
  semanticEventLogRepository: SemanticEventLogRepository;
  workingSnapshotRepository: WorkingSnapshotRepository;
};
