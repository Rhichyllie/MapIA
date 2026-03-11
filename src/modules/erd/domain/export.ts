import { collectSafeFixesFromDiagnostics } from "./autofix";
import type { ErdDiagnostic, ErdGraph } from "./types";

export type ErdExportPreview = {
  format: "json";
  entities: Array<{
    id: string;
    name: string;
    tableName?: string;
    description?: string;
    fields: Array<{
      id: string;
      name: string;
      type: string;
      flags: string[];
      default?: string;
      description?: string;
      references?: {
        entityId: string;
        fieldId?: string;
        relationEdgeId?: string;
      };
    }>;
  }>;
  relations: Array<{
    id: string;
    sourceEntityId: string;
    targetEntityId: string;
    name?: string;
    description?: string;
    payload: Record<string, unknown>;
  }>;
};

export type ErdRepairPlan = {
  summary: string;
  previewBullets: string[];
  safeFixes: Array<{
    id: string;
    label: string;
    description?: string;
    commands: unknown[];
  }>;
};

export function buildErdExportPreview(graph: ErdGraph): ErdExportPreview {
  return {
    format: "json",
    entities: graph.entities.map((entity) => ({
      id: entity.id,
      name: entity.label?.trim() || entity.payload.tableName?.trim() || entity.id,
      ...(entity.payload.tableName?.trim() ? { tableName: entity.payload.tableName.trim() } : {}),
      ...(entity.payload.description?.trim() ? { description: entity.payload.description.trim() } : {}),
      fields: entity.payload.fields.map((field) => ({
        id: field.id,
        name: field.name,
        type: field.type,
        flags: field.flags,
        ...(field.default ? { default: field.default } : {}),
        ...(field.description ? { description: field.description } : {}),
        ...(field.references ? { references: field.references } : {}),
      })),
    })),
    relations: graph.relations.map((relation) => ({
      id: relation.id,
      sourceEntityId: relation.sourceEntityId,
      targetEntityId: relation.targetEntityId,
      ...(relation.payload.name ? { name: relation.payload.name } : {}),
      ...(relation.payload.description ? { description: relation.payload.description } : {}),
      payload: relation.payload as unknown as Record<string, unknown>,
    })),
  };
}

export function buildErdRepairPlanFromDiagnostics(
  diagnostics: ErdDiagnostic[],
): ErdRepairPlan {
  const safeFixes = collectSafeFixesFromDiagnostics(diagnostics);
  const previewBullets = safeFixes.slice(0, 10).map((fix) =>
    fix.description ? `${fix.label}: ${fix.description}` : fix.label,
  );

  return {
    summary:
      safeFixes.length > 0
        ? `${safeFixes.length} correcoes seguras disponiveis.`
        : "Nenhuma correcao segura automatica disponivel.",
    previewBullets,
    safeFixes: safeFixes.map((fix) => ({
      id: fix.id,
      label: fix.label,
      ...(fix.description ? { description: fix.description } : {}),
      commands: fix.commands,
    })),
  };
}
