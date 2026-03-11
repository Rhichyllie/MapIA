import type { EdgeKind, NodeKind } from "@/src/domain";

export type ErdFieldFlag =
  | "PK"
  | "FK"
  | "UQ"
  | "NOT_NULL"
  | "NULLABLE"
  | "INDEX"
  | "AUTO_INCREMENT"
  | "DEFAULT"
  | "DERIVED"
  | "VIRTUAL";

export type ErdFieldReference = {
  entityId: string;
  fieldId?: string;
  relationEdgeId?: string;
};

export type ErdField = {
  id: string;
  name: string;
  type: string;
  flags: ErdFieldFlag[];
  description?: string;
  default?: string;
  references?: ErdFieldReference;
};

export type ErdEntityPayload = {
  description?: string;
  tags?: string[];
  tableName?: string;
  fields: ErdField[];
  semantic?: {
    normalizedName?: string;
    pkKind?: "none" | "single" | "composite";
    hasPk?: boolean;
  };
};

export type ErdCardinality = {
  minSource: 0 | 1;
  maxSource: 1 | "N";
  minTarget: 0 | 1;
  maxTarget: 1 | "N";
};

export type ErdReferentialAction = "restrict" | "cascade" | "setNull" | "noAction";

export type ErdRelationMaterialization =
  | { mode: "conceptual" }
  | {
      mode: "fk";
      dependentSide: "source" | "target";
      fk: {
        dependentEntityId: string;
        fkFieldIds: string[];
        referencesEntityId: string;
        referencesFieldIds: string[];
        unique?: boolean;
      };
    }
  | {
      mode: "associative";
      join: {
        joinEntityId: string;
        sourceFkFieldIds: string[];
        targetFkFieldIds: string[];
        pkMode: "composite" | "surrogate";
      };
    };

export type ErdRelationPayload = {
  name?: string;
  description?: string;
  cardinality?: ErdCardinality;
  identifying?: boolean;
  roles?: {
    sourceRole?: string;
    targetRole?: string;
  };
  materialization?: ErdRelationMaterialization;
  referentialActions?: {
    onDelete?: ErdReferentialAction;
    onUpdate?: ErdReferentialAction;
  };
};

export type ErdValidationLevel = "draft" | "guided" | "strict";
export type ErdNamingStyle = "camel" | "snake";
export type ErdEntityCase = "PascalCase";

export type ErdPolicyConfig = {
  validationLevel: ErdValidationLevel;
  namingStyle: ErdNamingStyle;
  entityCase: ErdEntityCase;
  requirePrimaryKeyInStrict: boolean;
  allowConceptualRelations: boolean;
  preferSurrogateKeyInAssociative: boolean;
};

export type ErdEditorCommandMeta = {
  repairApplied?: boolean;
};

export type ErdEditorCommand =
  | {
      type: "addNode";
      node: {
        id: string;
        kind: NodeKind;
        label: string;
        position: { x: number; y: number };
        data: Record<string, unknown>;
      };
      meta?: ErdEditorCommandMeta;
    }
  | {
      type: "updateNode";
      nodeId: string;
      patch: {
        label?: string;
        kind?: NodeKind;
        data?: Record<string, unknown>;
      };
      meta?: ErdEditorCommandMeta;
    }
  | {
      type: "removeNode";
      nodeId: string;
      meta?: ErdEditorCommandMeta;
    }
  | {
      type: "addEdge";
      edge: {
        id: string;
        sourceNodeId: string;
        targetNodeId: string;
        kind: EdgeKind;
        label?: string;
        data: Record<string, unknown>;
      };
      meta?: ErdEditorCommandMeta;
    }
  | {
      type: "updateEdge";
      edgeId: string;
      patch: {
        label?: string;
        kind?: EdgeKind;
        data?: Record<string, unknown>;
      };
      meta?: ErdEditorCommandMeta;
    }
  | {
      type: "removeEdge";
      edgeId: string;
      meta?: ErdEditorCommandMeta;
    };

export type ErdSuggestedFix = {
  id: string;
  label: string;
  description?: string;
  safety: "safe" | "manual";
  commands: ErdEditorCommand[];
};

export type ErdDiagnosticSeverity = "error" | "warning" | "info" | "suggestion";

export type ErdDiagnosticTarget =
  | { type: "graph" }
  | { type: "entity"; entityId: string }
  | { type: "field"; entityId: string; fieldId: string }
  | { type: "relation"; relationId: string };

export type ErdDiagnostic = {
  id: string;
  code: string;
  severity: ErdDiagnosticSeverity;
  message: string;
  explanation: string;
  target: ErdDiagnosticTarget;
  suggestedFixes: ErdSuggestedFix[];
};

export type ErdEntityRef = {
  id: string;
  label?: string;
  kind: NodeKind;
  payload: ErdEntityPayload;
};

export type ErdRelationRef = {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  kind: EdgeKind;
  label?: string;
  payload: ErdRelationPayload;
};

export type ErdGraph = {
  entities: ErdEntityRef[];
  relations: ErdRelationRef[];
};

export type ErdIndexes = {
  entityById: Map<string, ErdEntityRef>;
  fieldsByEntityId: Map<string, ErdField[]>;
  relationsByEntityId: Map<string, ErdRelationRef[]>;
  adjacency: Map<string, Set<string>>;
};

export type ErdAffectedSubgraph = {
  entityIds: Set<string>;
  relationIds: Set<string>;
};

export const ERD_LOGICAL_TYPES = [
  "string",
  "text",
  "integer",
  "uuid",
  "datetime",
  "boolean",
  "json",
  "decimal",
] as const;

export type ErdLogicalType = (typeof ERD_LOGICAL_TYPES)[number];

export const DEFAULT_ERD_POLICY: ErdPolicyConfig = {
  validationLevel: "guided",
  namingStyle: "camel",
  entityCase: "PascalCase",
  requirePrimaryKeyInStrict: true,
  allowConceptualRelations: true,
  preferSurrogateKeyInAssociative: false,
};
