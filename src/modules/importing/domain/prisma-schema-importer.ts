import { type GraphSnapshot, GraphSnapshotSchema } from "@/src/domain";
import { AppError } from "@/src/lib/app-error";
import { validateGraphSnapshotInvariants } from "@/src/modules/graph/domain";
import {
  type ImportExternalRefContext,
  buildImportedEdgeExternalRefs,
  buildImportedNodeExternalRefs,
  deterministicUuidFromParts,
} from "./external-refs";
import {
  type ImportTelemetryClock,
  type ImportTelemetryAttributes,
  type ImportTelemetryCollector,
  type ImportTelemetryOutcome,
  type ImportTelemetryPhase,
  type ImportTelemetrySourceKind,
  type ImportTelemetryStep,
  IMPORT_TELEMETRY_NAMESPACE,
  createDeterministicImportRunId,
  createImportTelemetrySession,
} from "./import-telemetry";
import {
  IMPORT_TELEMETRY_EVENT_NAMES,
  IMPORT_TELEMETRY_STEP_NAMES,
} from "./import-telemetry-contract";
import { IMPORT_TELEMETRY_CODES } from "./import-telemetry-codes";
import { normalizeImportedSnapshotCanonical } from "./imported-snapshot-normalizer";

type ParsedPrismaField = {
  name: string;
  type: string;
  isOptional: boolean;
  isList: boolean;
  attributesRaw: string;
};

type ParsedPrismaModel = {
  name: string;
  tableName: string;
  fields: ParsedPrismaField[];
};

type PrismaRelationCardinality = "1:1" | "1:N" | "N:N";

type PrismaRelationCandidate = {
  sourceModelName: string;
  targetModelName: string;
  sourceFieldName: string;
  relationName?: string;
  isList: boolean;
  isOptional: boolean;
  fkFields?: string[];
  references?: string[];
  onDelete?: string;
  onUpdate?: string;
};

type PrismaRelation = PrismaRelationCandidate & {
  cardinality: PrismaRelationCardinality;
};

export type PrismaSchemaImportSummary = {
  modelsCount: number;
  relationsCount: number;
  scalarFieldsCount: number;
};

export type ImportPrismaSchemaToGraphSnapshotResult = {
  snapshot: GraphSnapshot;
  summary: PrismaSchemaImportSummary;
};

export type ImportPrismaSchemaToGraphSnapshotTelemetryOptions = {
  collector?: ImportTelemetryCollector;
  clock?: ImportTelemetryClock;
  includeTimestamps?: boolean;
};

export type ImportPrismaSchemaToGraphSnapshotInput = {
  projectId: string;
  schemaText: string;
  externalRefContext?: ImportExternalRefContext;
  telemetry?: ImportPrismaSchemaToGraphSnapshotTelemetryOptions;
};

function parseRelationName(attributesRaw: string): string | undefined {
  const namedArgumentMatch = attributesRaw.match(
    /@relation\s*\(\s*name\s*:\s*"([^"]+)"/,
  );
  if (namedArgumentMatch?.[1]) {
    return namedArgumentMatch[1];
  }

  const positionalArgumentMatch = attributesRaw.match(/@relation\s*\(\s*"([^"]+)"/);
  if (positionalArgumentMatch?.[1]) {
    return positionalArgumentMatch[1];
  }

  return undefined;
}

function parseRelationFieldList(
  attributesRaw: string,
  key: "fields" | "references",
): string[] | undefined {
  const match = attributesRaw.match(
    new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`),
  );
  if (!match?.[1]) {
    return undefined;
  }

  const values = match[1]
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return values.length > 0 ? values : undefined;
}

function parseRelationEnumValue(
  attributesRaw: string,
  key: "onDelete" | "onUpdate",
): string | undefined {
  const match = attributesRaw.match(
    new RegExp(`${key}\\s*:\\s*([A-Za-z_][A-Za-z0-9_]*)`),
  );

  return match?.[1];
}

function parseModelTableName(modelName: string, body: string) {
  const mapped = body.match(/@@map\s*\(\s*"([^"]+)"\s*\)/)?.[1];
  return mapped?.trim() || modelName;
}

function resolveCardinalityForCandidates(
  candidates: PrismaRelationCandidate[],
): PrismaRelationCardinality {
  const listCount = candidates.filter((candidate) => candidate.isList).length;

  if (listCount >= 2) {
    return "N:N";
  }

  if (listCount === 1) {
    return "1:N";
  }

  return "1:1";
}

function normalizeSchemaText(schemaText: string): string {
  return schemaText.replace(/^\uFEFF/, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

export function parsePrismaSchemaModels(schemaText: string): ParsedPrismaModel[] {
  const normalized = normalizeSchemaText(schemaText);
  const trimmed = normalized.trim();

  if (!trimmed) {
    throw new AppError("Schema Prisma vazio. Cole o conteudo de um arquivo .prisma.", {
      code: "PRISMA_SCHEMA_EMPTY",
      status: 400,
    });
  }

  const models: ParsedPrismaModel[] = [];
  const modelBlockRegex = /\bmodel\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)\}/g;

  for (const match of normalized.matchAll(modelBlockRegex)) {
    const modelName = match[1];
    const body = match[2] ?? "";
    const fields: ParsedPrismaField[] = [];

    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();

      if (!line || line.startsWith("//") || line.startsWith("///")) {
        continue;
      }

      if (line.startsWith("@@")) {
        continue;
      }

      const fieldMatch = line.match(
        /^([A-Za-z_][A-Za-z0-9_]*)\s+([^\s]+)(?:\s+(.*))?$/,
      );

      if (!fieldMatch) {
        throw new AppError(
          `Schema Prisma invalido. Nao foi possivel interpretar o campo "${line}" no model ${modelName}.`,
          {
            code: "PRISMA_SCHEMA_INVALID",
            status: 400,
          },
        );
      }

      const fieldName = fieldMatch[1];
      const rawType = fieldMatch[2];
      const attributesRaw = fieldMatch[3] ?? "";

      let type = rawType;
      let isOptional = false;
      let isList = false;

      if (type.endsWith("[]")) {
        isList = true;
        type = type.slice(0, -2);
      }

      if (type.endsWith("?")) {
        isOptional = true;
        type = type.slice(0, -1);
      }

      if (!type) {
        throw new AppError(
          `Schema Prisma invalido. Tipo vazio no campo ${modelName}.${fieldName}.`,
          {
            code: "PRISMA_SCHEMA_INVALID",
            status: 400,
          },
        );
      }

      fields.push({
        name: fieldName,
        type,
        isOptional,
        isList,
        attributesRaw,
      });
    }

    models.push({
      name: modelName,
      tableName: parseModelTableName(modelName, body),
      fields,
    });
  }

  if (models.length === 0) {
    if (/\bmodel\b/.test(trimmed)) {
      throw new AppError(
        "Schema Prisma invalido. Verifique a sintaxe dos blocos `model { ... }`.",
        {
          code: "PRISMA_SCHEMA_INVALID",
          status: 400,
        },
      );
    }

    throw new AppError(
      "Schema Prisma sem models. Adicione ao menos um bloco `model` para importar.",
      {
        code: "PRISMA_SCHEMA_NO_MODELS",
        status: 400,
      },
    );
  }

  return models;
}

function buildRelationCandidates(models: ParsedPrismaModel[]): PrismaRelationCandidate[] {
  const modelNames = new Set(models.map((model) => model.name));
  const relations: PrismaRelationCandidate[] = [];

  for (const model of models) {
    for (const field of model.fields) {
      if (!modelNames.has(field.type)) {
        continue;
      }

      relations.push({
        sourceModelName: model.name,
        targetModelName: field.type,
        sourceFieldName: field.name,
        relationName: parseRelationName(field.attributesRaw),
        isList: field.isList,
        isOptional: field.isOptional,
        fkFields: parseRelationFieldList(field.attributesRaw, "fields"),
        references: parseRelationFieldList(field.attributesRaw, "references"),
        onDelete: parseRelationEnumValue(field.attributesRaw, "onDelete"),
        onUpdate: parseRelationEnumValue(field.attributesRaw, "onUpdate"),
      });
    }
  }

  return relations;
}

function dedupeRelations(
  candidates: PrismaRelationCandidate[],
): PrismaRelation[] {
  const byKey = new Map<string, PrismaRelationCandidate[]>();

  for (const candidate of candidates) {
    const sortedModels = [candidate.sourceModelName, candidate.targetModelName]
      .sort((a, b) => a.localeCompare(b))
      .join("::");
    const relationKey = candidate.relationName
      ? `named::${sortedModels}::${candidate.relationName}`
      : `models::${sortedModels}`;
    const current = byKey.get(relationKey) ?? [];
    current.push(candidate);
    byKey.set(relationKey, current);
  }

  const relations: PrismaRelation[] = [];
  for (const group of byKey.values()) {
    const sorted = [...group].sort((a, b) => {
      const left = `${a.sourceModelName}.${a.sourceFieldName}->${a.targetModelName}`;
      const right = `${b.sourceModelName}.${b.sourceFieldName}->${b.targetModelName}`;
      return left.localeCompare(right);
    });
    const primary = sorted[0];
    if (!primary) {
      continue;
    }

    const owner =
      sorted.find(
        (candidate) =>
          (candidate.fkFields && candidate.fkFields.length > 0) ||
          (candidate.references && candidate.references.length > 0),
      ) ?? primary;

    relations.push({
      ...primary,
      cardinality: resolveCardinalityForCandidates(sorted),
      fkFields: owner.fkFields,
      references: owner.references,
      onDelete: owner.onDelete,
      onUpdate: owner.onUpdate,
    });
  }

  return relations.sort((a, b) => {
    const left = `${a.sourceModelName}.${a.sourceFieldName}->${a.targetModelName}`;
    const right = `${b.sourceModelName}.${b.sourceFieldName}->${b.targetModelName}`;
    return left.localeCompare(right);
  });
}

type ImportTelemetryWarningCategory =
  | "provenance.node.miss"
  | "provenance.edge.miss.no-relation-name"
  | "provenance.edge.miss.relation-origin-not-found";

type ImportTelemetrySanitizedSourceContext = {
  sourceKind: ImportTelemetrySourceKind;
  sourceLabel?: string;
  hasExternalRefContext: boolean;
  metadata: ImportTelemetryAttributes;
};

function countSchemaLines(schemaText: string) {
  if (!schemaText) {
    return 0;
  }

  return schemaText.split(/\r?\n/).length;
}

function buildSchemaFingerprint(schemaText: string) {
  return deterministicUuidFromParts(["schema-fingerprint", schemaText]).slice(0, 12);
}

function normalizeTelemetrySourceLabelPath(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/").trim();
  const segments = normalized.split("/").filter(Boolean);

  if (segments.length <= 2) {
    return segments.join("/") || normalized;
  }

  return `.../${segments.slice(-2).join("/")}`;
}

function buildTelemetrySourceContext(
  context: ImportExternalRefContext | undefined,
): ImportTelemetrySanitizedSourceContext {
  if (!context) {
    return {
      sourceKind: "prisma-schema-inline",
      sourceLabel: "inline-prisma-schema",
      hasExternalRefContext: false,
      metadata: {
        sourceLabelSanitized: true,
      },
    };
  }

  if (context.sourceKind === "prisma-schema-file") {
    const sourceLabel = normalizeTelemetrySourceLabelPath(context.filePath);

    return {
      sourceKind: context.sourceKind,
      sourceLabel,
      hasExternalRefContext: true,
      metadata: {
        sourceLabelSanitized: true,
        sourcePathSegmentsKept: Math.min(
          2,
          context.filePath.replace(/\\/g, "/").split("/").filter(Boolean).length,
        ),
      },
    };
  }

  return {
    sourceKind: context.sourceKind,
    sourceLabel: "postgres-live",
    hasExternalRefContext: true,
    metadata: {
      sourceLabelSanitized: true,
      provenanceModelCatalogCount: Object.keys(context.modelsByModelName).length,
      provenanceRelationCatalogCount: Object.keys(context.relationsByRelationName).length,
    },
  };
}

function incrementWarningCategory(
  warningsByCategory: Record<string, number>,
  category: ImportTelemetryWarningCategory,
  amount = 1,
) {
  warningsByCategory[category] = (warningsByCategory[category] ?? 0) + amount;
}

function toErrorCode(error: unknown) {
  return typeof (error as { code?: unknown })?.code === "string"
    ? ((error as { code: string }).code as string)
    : undefined;
}

export function importPrismaSchemaToGraphSnapshot(
  input: ImportPrismaSchemaToGraphSnapshotInput,
): ImportPrismaSchemaToGraphSnapshotResult {
  const schemaFingerprint = buildSchemaFingerprint(input.schemaText);
  const sourceTelemetry = buildTelemetrySourceContext(input.externalRefContext);
  const schemaBytes = Buffer.byteLength(input.schemaText, "utf8");
  const schemaLineCount = countSchemaLines(input.schemaText);
  const telemetrySession = createImportTelemetrySession({
    collector: input.telemetry?.collector,
    clock: input.telemetry?.clock,
    includeTimestamps: input.telemetry?.includeTimestamps,
    correlation: {
      projectId: input.projectId,
      sourceKind: sourceTelemetry.sourceKind,
      sourceLabel: sourceTelemetry.sourceLabel,
      importRunId: createDeterministicImportRunId({
        projectId: input.projectId,
        sourceKind: sourceTelemetry.sourceKind,
        sourceLabel: sourceTelemetry.sourceLabel,
        schemaFingerprint,
      }),
    },
  });
  const telemetrySteps: ImportTelemetryStep[] = [];
  const warningsByCategory: Record<string, number> = {};
  let lastPhase: ImportTelemetryPhase = "input";
  let normalizationApplied = false;
  let revalidatedAfterNormalize = false;
  let modelsCount = 0;
  let relationsCount = 0;
  let scalarFieldsCount = 0;
  let relationCandidatesCount = 0;
  let relationsDeduplicatedCount = 0;
  let nodeExternalRefsCount = 0;
  let edgeExternalRefsCount = 0;
  let provenanceNodeMissCount = 0;
  let provenanceEdgeMissCount = 0;
  let finalizeSummaryEmitted = false;

  const completeStep = (
    handle: ReturnType<typeof telemetrySession.startStep>,
    inputStep: Parameters<ReturnType<typeof telemetrySession.startStep>["end"]>[0],
  ) => {
    const step = handle.end(inputStep);
    telemetrySteps.push(step);
    return step;
  };

  const buildTelemetrySummary = (outcome: ImportTelemetryOutcome) => {
    const hasPartialProvenance =
      provenanceNodeMissCount > 0 || provenanceEdgeMissCount > 0;
    const normalizedOutcome =
      outcome === "success" && hasPartialProvenance ? "partial" : outcome;

    return {
      namespace: IMPORT_TELEMETRY_NAMESPACE,
      correlation: telemetrySession.correlation,
      outcome: normalizedOutcome,
      counts: {
        nodesGenerated: modelsCount,
        edgesGenerated: relationsCount,
        scalarFieldsGenerated: scalarFieldsCount,
        relationCandidates: relationCandidatesCount,
        relationsDeduplicated: relationsDeduplicatedCount,
        externalRefsGenerated: {
          nodes: nodeExternalRefsCount,
          edges: edgeExternalRefsCount,
          total: nodeExternalRefsCount + edgeExternalRefsCount,
        },
        provenanceFallbacks: {
          nodeMiss: provenanceNodeMissCount,
          edgeMiss: provenanceEdgeMissCount,
        },
        warningsByCategory: { ...warningsByCategory },
      },
      phases: telemetrySteps.map((step) => ({
        phase: step.phase,
        stepName: step.stepName,
        status: step.status,
        durationMs: step.durationMs,
      })),
      flags: {
        normalizationApplied,
        revalidatedAfterNormalize,
        hasPartialProvenance,
      },
      source: {
        sourceKind: sourceTelemetry.sourceKind,
        ...(sourceTelemetry.sourceLabel
          ? { sourceLabel: sourceTelemetry.sourceLabel }
          : {}),
        hasExternalRefContext: sourceTelemetry.hasExternalRefContext,
        metadata: {
          schemaBytes,
          schemaLineCount,
          schemaFingerprint,
          ...sourceTelemetry.metadata,
        },
      },
    } as const;
  };

  const emitFinalizeSummary = (outcome: ImportTelemetryOutcome) => {
    if (finalizeSummaryEmitted) {
      return;
    }

    lastPhase = "finalize";
    const finalizeStepHandle = telemetrySession.startStep({
      stepName: IMPORT_TELEMETRY_STEP_NAMES.FINALIZE_SUMMARY,
      phase: "finalize",
      attributes: {
        executedPhasesCount: telemetrySteps.length,
      },
    });
    const summary = buildTelemetrySummary(outcome);
    const finalizeStep = completeStep(finalizeStepHandle, {
      status: summary.outcome === "failure" ? "failure" : "success",
      attributes: {
        outcome: summary.outcome,
        warningsCount: Object.keys(summary.counts.warningsByCategory).length,
        hasPartialProvenance: summary.flags.hasPartialProvenance,
      },
    });
    const finalizedSummary = buildTelemetrySummary(
      finalizeStep.status === "failure" ? "failure" : outcome,
    );

    telemetrySession.event({
      eventName: IMPORT_TELEMETRY_EVENT_NAMES.FINALIZE_SUMMARY,
      phase: "finalize",
      severity: finalizedSummary.outcome === "failure" ? "error" : "info",
      code: IMPORT_TELEMETRY_CODES.FINALIZE_SUMMARY,
      message: "Resumo consolidado da importacao gerado.",
      attributes: {
        outcome: finalizedSummary.outcome,
        nodesGenerated: finalizedSummary.counts.nodesGenerated,
        edgesGenerated: finalizedSummary.counts.edgesGenerated,
        warningsByCategory: finalizedSummary.counts.warningsByCategory,
      },
      durationMs: finalizeStep.durationMs,
      outcome: finalizedSummary.outcome,
    });
    telemetrySession.summary(finalizedSummary);
    finalizeSummaryEmitted = true;
  };

  telemetrySession.event({
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.INPUT_ACCEPTED,
    phase: "input",
    severity: "info",
    code: IMPORT_TELEMETRY_CODES.INPUT_ACCEPTED,
    message: "Entrada de importacao aceita e fonte identificada.",
    attributes: {
      schemaBytes,
      schemaLineCount,
      hasExternalRefContext: sourceTelemetry.hasExternalRefContext,
      sourceKind: sourceTelemetry.sourceKind,
      sourceLabel: sourceTelemetry.sourceLabel,
      sourceMetadata: sourceTelemetry.metadata,
      schemaFingerprint,
    },
    outcome: "success",
  });

  try {
    let models: ParsedPrismaModel[];

    lastPhase = "parse";
    telemetrySession.event({
      eventName: IMPORT_TELEMETRY_EVENT_NAMES.PARSE_START,
      phase: "parse",
      severity: "debug",
      code: IMPORT_TELEMETRY_CODES.PARSE_START,
      message: "Inicio do parse de models Prisma.",
      attributes: {
        schemaBytes,
        schemaLineCount,
      },
    });
    const parseStepHandle = telemetrySession.startStep({
      stepName: IMPORT_TELEMETRY_STEP_NAMES.PARSE_PRISMA_SCHEMA_MODELS,
      phase: "parse",
    });
    try {
      models = parsePrismaSchemaModels(input.schemaText);
      const parseStep = completeStep(parseStepHandle, {
        status: "success",
        attributes: {
          modelsCount: models.length,
        },
      });
      telemetrySession.event({
        eventName: IMPORT_TELEMETRY_EVENT_NAMES.PARSE_END,
        phase: "parse",
        severity: "info",
        code: IMPORT_TELEMETRY_CODES.PARSE_OK,
        message: "Parse de models Prisma concluido.",
        attributes: {
          modelsCount: models.length,
        },
        durationMs: parseStep.durationMs,
        outcome: "success",
      });
    } catch (error) {
      const parseStep = completeStep(parseStepHandle, {
        status: "failure",
        error,
      });
      telemetrySession.event({
        eventName: IMPORT_TELEMETRY_EVENT_NAMES.PARSE_END,
        phase: "parse",
        severity: "error",
        code: IMPORT_TELEMETRY_CODES.PARSE_FAILED,
        message: "Falha no parse de models Prisma.",
        attributes: {
          errorCode: toErrorCode(error),
        },
        durationMs: parseStep.durationMs,
        outcome: "failure",
      });
      throw error;
    }

    const relationCandidates = buildRelationCandidates(models);
    relationCandidatesCount = relationCandidates.length;
    const relations = dedupeRelations(relationCandidates);
    relationsDeduplicatedCount = relationCandidates.length - relations.length;

    lastPhase = "externalRefs";
    telemetrySession.event({
      eventName: IMPORT_TELEMETRY_EVENT_NAMES.EXTERNALREFS_MAP_START,
      phase: "externalRefs",
      severity: "debug",
      code: IMPORT_TELEMETRY_CODES.EXTERNALREFS_MAP_START,
      message: "Inicio do mapeamento de elementos e ExternalRefs.",
      attributes: {
        relationCandidates: relationCandidates.length,
        externalRefSourceKind: sourceTelemetry.sourceKind,
      },
    });
    const externalRefsStepHandle = telemetrySession.startStep({
      stepName: IMPORT_TELEMETRY_STEP_NAMES.EXTERNALREFS_MAP_ELEMENTS,
      phase: "externalRefs",
      attributes: {
        externalRefSourceKind: sourceTelemetry.sourceKind,
      },
    });

    const nodeIdByModelName = new Map<string, string>();
    const sortedModels = [...models].sort((a, b) => a.name.localeCompare(b.name));
    const modelNameSet = new Set(sortedModels.map((model) => model.name));

    const nodes = sortedModels.map((model, index) => {
      const nodeId = deterministicUuidFromParts([
        "prisma-schema-import",
        input.projectId,
        "model",
        model.name,
      ]);
      nodeIdByModelName.set(model.name, nodeId);

      const scalarFields = model.fields
        .filter((field) => !modelNameSet.has(field.type))
        .map((field) => ({
          name: field.name,
          type: field.type,
          isOptional: field.isOptional,
          isId: /(^|\s)@id(\s|$)/.test(field.attributesRaw),
          isUnique: /(^|\s)@unique(\s|$)/.test(field.attributesRaw),
        }));

      const columnIndex = index % 3;
      const rowIndex = Math.floor(index / 3);
      const externalRefs = buildImportedNodeExternalRefs({
        modelName: model.name,
        context: input.externalRefContext,
      });

      nodeExternalRefsCount += externalRefs.length;
      if (
        input.externalRefContext?.sourceKind === "postgres-live" &&
        externalRefs.length === 0
      ) {
        provenanceNodeMissCount += 1;
        incrementWarningCategory(warningsByCategory, "provenance.node.miss");
      }

      return {
        id: nodeId,
        projectId: input.projectId,
        kind: "entity" as const,
        label: model.name,
        position: {
          x: 120 + columnIndex * 360,
          y: 120 + rowIndex * 260,
        },
        data: {
          modelName: model.name,
          tableName: model.tableName,
          source: "prisma-schema",
          fields: scalarFields,
        },
        externalRefs,
      };
    });

    scalarFieldsCount = sortedModels.reduce(
      (acc, model) =>
        acc +
        model.fields.filter((field) => !modelNameSet.has(field.type)).length,
      0,
    );

    const edges = relations.flatMap((relation) => {
      const sourceNodeId = nodeIdByModelName.get(relation.sourceModelName);
      const targetNodeId = nodeIdByModelName.get(relation.targetModelName);

      if (!sourceNodeId || !targetNodeId) {
        return [];
      }

      const externalRefs = buildImportedEdgeExternalRefs({
        sourceModelName: relation.sourceModelName,
        sourceFieldName: relation.sourceFieldName,
        relationName: relation.relationName,
        context: input.externalRefContext,
      });

      edgeExternalRefsCount += externalRefs.length;
      if (input.externalRefContext?.sourceKind === "postgres-live" && externalRefs.length === 0) {
        provenanceEdgeMissCount += 1;
        incrementWarningCategory(
          warningsByCategory,
          relation.relationName
            ? "provenance.edge.miss.relation-origin-not-found"
            : "provenance.edge.miss.no-relation-name",
        );
      }

      return [
        {
          id: deterministicUuidFromParts([
            "prisma-schema-import",
            input.projectId,
            "relation",
            relation.relationName ?? "",
            relation.sourceModelName,
            relation.sourceFieldName,
            relation.targetModelName,
          ]),
          projectId: input.projectId,
          sourceNodeId,
          targetNodeId,
          kind: "references" as const,
          label: relation.sourceFieldName,
          data: (() => {
            const fk =
              relation.fkFields ||
              relation.references ||
              relation.onDelete ||
              relation.onUpdate
                ? {
                    ...(relation.fkFields ? { fkFields: relation.fkFields } : {}),
                    ...(relation.references ? { references: relation.references } : {}),
                    ...(relation.onDelete ? { onDelete: relation.onDelete } : {}),
                    ...(relation.onUpdate ? { onUpdate: relation.onUpdate } : {}),
                  }
                : undefined;

            return {
              source: "prisma-schema",
              ...(relation.relationName ? { relationName: relation.relationName } : {}),
              sourceFieldName: relation.sourceFieldName,
              cardinality: relation.cardinality,
              ...(relation.fkFields ? { fkFields: relation.fkFields } : {}),
              ...(relation.references ? { references: relation.references } : {}),
              ...(relation.onDelete ? { onDelete: relation.onDelete } : {}),
              ...(relation.onUpdate ? { onUpdate: relation.onUpdate } : {}),
              ...(fk ? { fk } : {}),
            };
          })(),
          externalRefs,
        },
      ];
    });

    modelsCount = nodes.length;
    relationsCount = edges.length;

    const externalRefsStep = completeStep(externalRefsStepHandle, {
      status:
        provenanceNodeMissCount > 0 || provenanceEdgeMissCount > 0 ? "partial" : "success",
      attributes: {
        nodesGenerated: nodes.length,
        edgesGenerated: edges.length,
        relationCandidates: relationCandidates.length,
        relationsDeduplicated: relationsDeduplicatedCount,
        nodeExternalRefsGenerated: nodeExternalRefsCount,
        edgeExternalRefsGenerated: edgeExternalRefsCount,
      },
    });
    telemetrySession.event({
      eventName: IMPORT_TELEMETRY_EVENT_NAMES.EXTERNALREFS_MAP_STATS,
      phase: "externalRefs",
      severity: "info",
      code: IMPORT_TELEMETRY_CODES.EXTERNALREFS_MAP_STATS,
      message: "Mapeamento de elementos e estatisticas de ExternalRef concluido.",
      attributes: {
        nodesGenerated: nodes.length,
        edgesGenerated: edges.length,
        relationCandidates: relationCandidates.length,
        relationsDeduplicated: relationsDeduplicatedCount,
        externalRefsGenerated: {
          nodes: nodeExternalRefsCount,
          edges: edgeExternalRefsCount,
          total: nodeExternalRefsCount + edgeExternalRefsCount,
        },
      },
      durationMs: externalRefsStep.durationMs,
      outcome:
        provenanceNodeMissCount > 0 || provenanceEdgeMissCount > 0 ? "partial" : "success",
    });

    if (provenanceNodeMissCount > 0) {
      lastPhase = "provenance";
      telemetrySession.event({
        eventName: IMPORT_TELEMETRY_EVENT_NAMES.PROVENANCE_WARNING_NODE_MISS,
        phase: "provenance",
        severity: "warn",
        code: IMPORT_TELEMETRY_CODES.PROVENANCE_NODE_MISS,
        message: "Nem todos os models importados tiveram provenance de node mapeada.",
        attributes: {
          nodeMissCount: provenanceNodeMissCount,
          category: "provenance.node.miss",
        },
        outcome: "partial",
      });
    }

    if (provenanceEdgeMissCount > 0) {
      lastPhase = "provenance";
      telemetrySession.event({
        eventName: IMPORT_TELEMETRY_EVENT_NAMES.PROVENANCE_WARNING_EDGE_MISS,
        phase: "provenance",
        severity: "warn",
        code: IMPORT_TELEMETRY_CODES.PROVENANCE_EDGE_MISS,
        message: "Nem todas as relacoes importadas tiveram provenance de edge mapeada.",
        attributes: {
          edgeMissCount: provenanceEdgeMissCount,
          warningsByCategory,
        },
        outcome: "partial",
      });
    }

    lastPhase = "validate";
    telemetrySession.event({
      eventName: IMPORT_TELEMETRY_EVENT_NAMES.VALIDATE_SCHEMA_START,
      phase: "validate",
      severity: "debug",
      code: IMPORT_TELEMETRY_CODES.VALIDATE_PARSE_START,
      message: "Inicio da validacao estrutural inicial do GraphSnapshot.",
      attributes: {
        nodesCount: nodes.length,
        edgesCount: edges.length,
      },
    });
    const validateParseStepHandle = telemetrySession.startStep({
      stepName: IMPORT_TELEMETRY_STEP_NAMES.VALIDATE_GRAPH_SNAPSHOT_SCHEMA_INITIAL,
      phase: "validate",
    });
    const parsedSnapshot = (() => {
      try {
        const value = GraphSnapshotSchema.parse({
          nodes,
          edges,
          viewport: { x: 0, y: 0, zoom: 1 },
        });
        const validateParseStep = completeStep(validateParseStepHandle, {
          status: "success",
          attributes: {
            nodesCount: value.nodes.length,
            edgesCount: value.edges.length,
          },
        });
        telemetrySession.event({
          eventName: IMPORT_TELEMETRY_EVENT_NAMES.VALIDATE_SCHEMA_END,
          phase: "validate",
          severity: "info",
          code: IMPORT_TELEMETRY_CODES.VALIDATE_PARSE_OK,
          message: "Validacao estrutural inicial concluida.",
          attributes: {
            nodesCount: value.nodes.length,
            edgesCount: value.edges.length,
          },
          durationMs: validateParseStep.durationMs,
          outcome: "success",
        });
        return value;
      } catch (error) {
        const validateParseStep = completeStep(validateParseStepHandle, {
          status: "failure",
          error,
        });
        telemetrySession.event({
          eventName: IMPORT_TELEMETRY_EVENT_NAMES.VALIDATE_SCHEMA_END,
          phase: "validate",
          severity: "error",
          code: IMPORT_TELEMETRY_CODES.PIPELINE_FAILED,
          message: "Falha na validacao estrutural inicial.",
          attributes: {
            failedStep: "validate.graph-snapshot-schema.initial",
            errorCode: toErrorCode(error),
          },
          durationMs: validateParseStep.durationMs,
          outcome: "failure",
        });
        throw error;
      }
    })();

    telemetrySession.event({
      eventName: IMPORT_TELEMETRY_EVENT_NAMES.VALIDATE_INVARIANTS_START,
      phase: "validate",
      severity: "debug",
      code: IMPORT_TELEMETRY_CODES.VALIDATE_INVARIANTS_START,
      message: "Inicio da validacao de invariantes (passo inicial).",
      attributes: {
        nodesCount: parsedSnapshot.nodes.length,
        edgesCount: parsedSnapshot.edges.length,
      },
    });
    const validateInvariantsStepHandle = telemetrySession.startStep({
      stepName: IMPORT_TELEMETRY_STEP_NAMES.VALIDATE_GRAPH_INVARIANTS_INITIAL,
      phase: "validate",
    });
    const validatedSnapshot = (() => {
      try {
        const value = validateGraphSnapshotInvariants(parsedSnapshot);
        const validateInvariantsStep = completeStep(validateInvariantsStepHandle, {
          status: "success",
          attributes: {
            nodesCount: value.nodes.length,
            edgesCount: value.edges.length,
          },
        });
        telemetrySession.event({
          eventName: IMPORT_TELEMETRY_EVENT_NAMES.VALIDATE_INVARIANTS_END,
          phase: "validate",
          severity: "info",
          code: IMPORT_TELEMETRY_CODES.VALIDATE_INVARIANTS_OK,
          message: "Validacao de invariantes inicial concluida.",
          attributes: {
            nodesCount: value.nodes.length,
            edgesCount: value.edges.length,
          },
          durationMs: validateInvariantsStep.durationMs,
          outcome: "success",
        });
        return value;
      } catch (error) {
        const validateInvariantsStep = completeStep(validateInvariantsStepHandle, {
          status: "failure",
          error,
        });
        telemetrySession.event({
          eventName: IMPORT_TELEMETRY_EVENT_NAMES.VALIDATE_INVARIANTS_END,
          phase: "validate",
          severity: "error",
          code: IMPORT_TELEMETRY_CODES.PIPELINE_FAILED,
          message: "Falha na validacao de invariantes inicial.",
          attributes: {
            failedStep: "validate.graph-invariants.initial",
            errorCode: toErrorCode(error),
          },
          durationMs: validateInvariantsStep.durationMs,
          outcome: "failure",
        });
        throw error;
      }
    })();

    lastPhase = "normalize";
    telemetrySession.event({
      eventName: IMPORT_TELEMETRY_EVENT_NAMES.NORMALIZE_START,
      phase: "normalize",
      severity: "debug",
      code: IMPORT_TELEMETRY_CODES.NORMALIZE_START,
      message: "Inicio da normalizacao canonica do snapshot importado.",
      attributes: {
        nodesCount: validatedSnapshot.nodes.length,
        edgesCount: validatedSnapshot.edges.length,
      },
    });
    const normalizeStepHandle = telemetrySession.startStep({
      stepName: IMPORT_TELEMETRY_STEP_NAMES.NORMALIZE_IMPORTED_SNAPSHOT_CANONICAL,
      phase: "normalize",
    });
    const normalizedSnapshot = (() => {
      try {
        const value = normalizeImportedSnapshotCanonical(validatedSnapshot);
        normalizationApplied = true;
        const normalizeStep = completeStep(normalizeStepHandle, {
          status: "success",
          attributes: {
            nodesCount: value.nodes.length,
            edgesCount: value.edges.length,
          },
        });
        telemetrySession.event({
          eventName: IMPORT_TELEMETRY_EVENT_NAMES.NORMALIZE_END,
          phase: "normalize",
          severity: "info",
          code: IMPORT_TELEMETRY_CODES.NORMALIZE_OK,
          message: "Normalizacao canonica concluida.",
          attributes: {
            nodesCount: value.nodes.length,
            edgesCount: value.edges.length,
          },
          durationMs: normalizeStep.durationMs,
          outcome: "success",
        });
        return value;
      } catch (error) {
        const normalizeStep = completeStep(normalizeStepHandle, {
          status: "failure",
          error,
        });
        telemetrySession.event({
          eventName: IMPORT_TELEMETRY_EVENT_NAMES.NORMALIZE_END,
          phase: "normalize",
          severity: "error",
          code: IMPORT_TELEMETRY_CODES.PIPELINE_FAILED,
          message: "Falha na normalizacao canonica.",
          attributes: {
            failedStep: "normalize.imported-snapshot-canonical",
            errorCode: toErrorCode(error),
          },
          durationMs: normalizeStep.durationMs,
          outcome: "failure",
        });
        throw error;
      }
    })();

    lastPhase = "reparse";
    telemetrySession.event({
      eventName: IMPORT_TELEMETRY_EVENT_NAMES.REPARSE_START,
      phase: "reparse",
      severity: "debug",
      code: IMPORT_TELEMETRY_CODES.REPARSE_START,
      message: "Inicio da revalidacao estrutural apos normalizacao (re-parse).",
      attributes: {
        nodesCount: normalizedSnapshot.nodes.length,
        edgesCount: normalizedSnapshot.edges.length,
      },
    });
    const reparseStepHandle = telemetrySession.startStep({
      stepName: IMPORT_TELEMETRY_STEP_NAMES.REPARSE_GRAPH_SNAPSHOT_SCHEMA_AFTER_NORMALIZE,
      phase: "reparse",
    });
    const reparsedNormalizedSnapshot = (() => {
      try {
        const value = GraphSnapshotSchema.parse(normalizedSnapshot);
        const reparseStep = completeStep(reparseStepHandle, {
          status: "success",
          attributes: {
            nodesCount: value.nodes.length,
            edgesCount: value.edges.length,
          },
        });
        telemetrySession.event({
          eventName: IMPORT_TELEMETRY_EVENT_NAMES.REPARSE_END,
          phase: "reparse",
          severity: "info",
          code: IMPORT_TELEMETRY_CODES.REPARSE_OK,
          message: "Re-parse estrutural apos normalizacao concluido.",
          attributes: {
            nodesCount: value.nodes.length,
            edgesCount: value.edges.length,
          },
          durationMs: reparseStep.durationMs,
          outcome: "success",
        });
        return value;
      } catch (error) {
        const reparseStep = completeStep(reparseStepHandle, {
          status: "failure",
          error,
        });
        telemetrySession.event({
          eventName: IMPORT_TELEMETRY_EVENT_NAMES.REPARSE_END,
          phase: "reparse",
          severity: "error",
          code: IMPORT_TELEMETRY_CODES.PIPELINE_FAILED,
          message: "Falha no re-parse estrutural apos normalizacao.",
          attributes: {
            failedStep: "reparse.graph-snapshot-schema.after-normalize",
            errorCode: toErrorCode(error),
          },
          durationMs: reparseStep.durationMs,
          outcome: "failure",
        });
        throw error;
      }
    })();

    lastPhase = "validate";
    telemetrySession.event({
      eventName: IMPORT_TELEMETRY_EVENT_NAMES.REVALIDATE_START,
      phase: "validate",
      severity: "debug",
      code: IMPORT_TELEMETRY_CODES.REVALIDATE_START,
      message: "Inicio da revalidacao de invariantes apos normalizacao.",
      attributes: {
        nodesCount: reparsedNormalizedSnapshot.nodes.length,
        edgesCount: reparsedNormalizedSnapshot.edges.length,
      },
    });
    const revalidateStepHandle = telemetrySession.startStep({
      stepName: IMPORT_TELEMETRY_STEP_NAMES.VALIDATE_GRAPH_INVARIANTS_AFTER_NORMALIZE,
      phase: "validate",
    });
    const snapshot = (() => {
      try {
        const value = validateGraphSnapshotInvariants(reparsedNormalizedSnapshot);
        revalidatedAfterNormalize = true;
        const revalidateStep = completeStep(revalidateStepHandle, {
          status: "success",
          attributes: {
            nodesCount: value.nodes.length,
            edgesCount: value.edges.length,
          },
        });
        telemetrySession.event({
          eventName: IMPORT_TELEMETRY_EVENT_NAMES.REVALIDATE_END,
          phase: "validate",
          severity: "info",
          code: IMPORT_TELEMETRY_CODES.REVALIDATE_OK,
          message: "Revalidacao de invariantes apos normalizacao concluida.",
          attributes: {
            nodesCount: value.nodes.length,
            edgesCount: value.edges.length,
          },
          durationMs: revalidateStep.durationMs,
          outcome: "success",
        });
        return value;
      } catch (error) {
        const revalidateStep = completeStep(revalidateStepHandle, {
          status: "failure",
          error,
        });
        telemetrySession.event({
          eventName: IMPORT_TELEMETRY_EVENT_NAMES.REVALIDATE_END,
          phase: "validate",
          severity: "error",
          code: IMPORT_TELEMETRY_CODES.PIPELINE_FAILED,
          message: "Falha na revalidacao de invariantes apos normalizacao.",
          attributes: {
            failedStep: "validate.graph-invariants.after-normalize",
            errorCode: toErrorCode(error),
          },
          durationMs: revalidateStep.durationMs,
          outcome: "failure",
        });
        throw error;
      }
    })();

    emitFinalizeSummary("success");

    return {
      snapshot,
      summary: {
        modelsCount,
        relationsCount,
        scalarFieldsCount,
      },
    };
  } catch (error) {
    telemetrySession.event({
      eventName: IMPORT_TELEMETRY_EVENT_NAMES.PIPELINE_FAILED,
      phase: lastPhase,
      severity: "error",
      code: IMPORT_TELEMETRY_CODES.PIPELINE_FAILED,
      message: "Pipeline de importacao falhou.",
      attributes: {
        errorCode: toErrorCode(error),
        failedPhase: lastPhase,
        executedStepsCount: telemetrySteps.length,
      },
      outcome: "failure",
    });
    emitFinalizeSummary("failure");
    throw error;
  }
}
