import { z } from "zod";
import {
  resolveCanonicalDiagramTypeFromView,
  type CanonicalDiagramType,
  type DiagramView,
} from "@/src/domain";
import {
  DEFAULT_AUTOMATION_TOGGLES,
  resolveRecipeContextBlocks,
  resolveRecipeLayoutCatalog,
  resolveRecipeRuntime,
  resolveRecipeValidationRules,
  validateStrictByRecipe as validateStrictByRecipeFromRegistry,
  type RecipeContextBlock,
} from "./recipes";
import { redactSensitiveText } from "./redact-source-config";
import {
  parseGraphQlSchema,
  parseOpenApiDocument,
  type GraphQlParseErrorCode,
  type OpenApiParseErrorCode,
} from "./source-precheck";

export const ProjectProfileSchema = z.enum([
  "blank",
  "information-structure",
  "process",
  "data-model",
  "system-architecture",
  "documents-governance",
  "mixed",
]);

export const StartStrategySchema = z.enum([
  "manual",
  "import",
  "template",
  "hybrid",
]);

export const StartSourceSchema = z.enum([
  "postgres",
  "mysql",
  "sqlserver",
  "prisma-schema",
  "sql-file",
  "relational-json",
  "openapi",
  "graphql",
  "code-routes",
  "folder-structure",
  "events",
  "yaml-json",
  "csv",
  "json",
  "spreadsheet",
  "cms-export",
  "existing-map",
  "document-repository",
  "custom-import",
]);

export const TemplatePresetSchema = z.enum([
  "erd-basic",
  "process-basic",
  "sitemap-basic",
  "architecture-basic",
  "blank-canvas",
]);

export const InitialViewSchema = z.enum([
  "free",
  "hierarchy",
  "flow",
  "graph",
  "erd",
  "sitemap",
  "timeline",
  "mindmap",
]);

export const LayoutChoiceSchema = z.enum([
  "auto",
  "vertical",
  "horizontal",
  "radial",
  "relational",
  "free",
]);

export const DetailLevelSchema = z.enum([
  "essential",
  "intermediate",
  "detailed",
]);

export const AutomationTogglesSchema = z.object({
  inferRelations: z.boolean(),
  createLinkFields: z.boolean(),
  applySuggestedNames: z.boolean(),
  autoOrganizeOnCreate: z.boolean(),
  detectInconsistenciesEarly: z.boolean(),
});

export const SourceStatusCodeSchema = z.enum([
  "not_configured",
  "configured",
  "precheck_ok",
  "ready_to_attempt_import",
  "imported",
  "failed",
]);

const LegacySourceStatusSchema = z.enum([
  "not-configured",
  "configured",
  "prechecked",
  "ready-to-import",
  "imported",
  "failed",
]);

export function normalizeSourceStatusCode(
  value?: string | null,
): z.infer<typeof SourceStatusCodeSchema> | undefined {
  if (!value) {
    return undefined;
  }

  if (value === "not-configured") {
    return "not_configured";
  }
  if (value === "prechecked") {
    return "precheck_ok";
  }
  if (value === "ready-to-import") {
    return "ready_to_attempt_import";
  }

  if (SourceStatusCodeSchema.safeParse(value).success) {
    return value as z.infer<typeof SourceStatusCodeSchema>;
  }

  return undefined;
}

export const SourceStatusSchema = z
  .union([SourceStatusCodeSchema, LegacySourceStatusSchema])
  .transform((value) => normalizeSourceStatusCode(value) ?? "not_configured");

const TranslationValueSchema = z.union([z.string().max(500), z.number()]);
const TranslationValuesSchema = z.record(z.string(), TranslationValueSchema);
const MessageDescriptorSchema = z.object({
  code: z.string().min(1).max(160),
  values: TranslationValuesSchema.optional(),
});

export type TranslationValues = z.infer<typeof TranslationValuesSchema>;
export type MessageDescriptor = z.infer<typeof MessageDescriptorSchema>;

export type SourcePreviewSummaryCode =
  | "prisma_preview_schema_required"
  | "prisma_preview_models_detected"
  | "prisma_preview_ready_without_models"
  | "relational_preview_connection_string_ready"
  | "relational_preview_connection_string_required"
  | "relational_preview_fields_ready"
  | "relational_preview_fields_required"
  | "openapi_preview_url_ready"
  | "openapi_preview_url_required"
  | "openapi_preview_spec_required"
  | "openapi_preview_recognized"
  | "graphql_preview_recognized"
  | "graphql_preview_endpoint_ready"
  | "graphql_preview_endpoint_or_schema_required"
  | "csv_preview_text_required"
  | "csv_preview_columns_detected"
  | "csv_preview_header_not_recognized"
  | "json_preview_text_required"
  | "json_preview_invalid"
  | "json_preview_recognized"
  | "spreadsheet_preview_ready"
  | "spreadsheet_preview_text_required"
  | "generic_preview_ready"
  | "generic_preview_text_required"
  | OpenApiParseErrorCode
  | GraphQlParseErrorCode;

export type SourcePreviewDetailCode =
  | "openapi_preview_format"
  | "openapi_preview_title"
  | "graphql_preview_source_sdl"
  | "graphql_preview_source_introspection_json"
  | "legacy_runtime_text";

export type SourceLifecycleSummaryCode =
  | "source_lifecycle_precheck_failed"
  | "source_lifecycle_imported"
  | "legacy_runtime_text";

export type CreationAssistantValidationIssueCode =
  | "setup_initial_root_name_required"
  | "relational_connection_string_invalid"
  | "relational_host_required"
  | "relational_database_required"
  | "relational_port_required"
  | "relational_username_required"
  | "prisma_schema_required"
  | "openapi_url_required"
  | "openapi_url_invalid"
  | "openapi_spec_required"
  | "graphql_endpoint_or_schema_required"
  | "graphql_endpoint_invalid"
  | "generic_text_required"
  | "generic_json_invalid"
  | "generic_csv_headers_invalid"
  | "generic_mapping_field_not_found"
  | "source_config_required_for_import"
  | "start_source_required_for_source_config"
  | "source_config_kind_mismatch"
  | "template_preset_required"
  | "template_cannot_use_source"
  | "template_cannot_use_source_config"
  | "manual_cannot_use_source"
  | "manual_cannot_use_template_preset"
  | "manual_cannot_use_source_config"
  | "import_cannot_use_template_preset"
  | "start_source_incompatible_with_profile"
  | "initial_view_incompatible_with_profile"
  | "layout_incompatible_with_initial_view"
  | OpenApiParseErrorCode
  | GraphQlParseErrorCode;

const LegacySourcePrecheckResultSchema = z.object({
  level: z.enum(["ok", "warning", "error"]),
  summary: z.string().min(1).max(500),
  recognizedAs: z.string().min(1).max(120).optional(),
  details: z.array(z.string().min(1).max(500)).max(10).optional(),
  detectedFields: z.number().int().min(0).optional(),
});

const CanonicalSourcePrecheckResultSchema = z.object({
  level: z.enum(["ok", "warning", "error"]),
  summaryCode: z.string().min(1).max(160),
  summaryValues: TranslationValuesSchema.optional(),
  recognizedAs: z.string().min(1).max(120).optional(),
  details: z.array(MessageDescriptorSchema).max(10).optional(),
  detectedFields: z.number().int().min(0).optional(),
});

function emptyStringToUndefined(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalTrimmedString(max: number) {
  return z.preprocess(emptyStringToUndefined, z.string().max(max).optional());
}

function optionalUrlString() {
  return z.preprocess(emptyStringToUndefined, z.string().optional());
}

function buildMessageDescriptor(
  code: string,
  values?: TranslationValues,
): MessageDescriptor {
  if (!values || Object.keys(values).length === 0) {
    return { code };
  }

  return { code, values };
}

function toLegacyMessageDescriptor(text: string): MessageDescriptor {
  return buildMessageDescriptor("legacy_runtime_text", { text });
}

function addValidationIssue(
  ctx: z.RefinementCtx,
  input: {
    path: Array<string | number>;
    issueCode: CreationAssistantValidationIssueCode;
    values?: TranslationValues;
  },
) {
  ctx.addIssue({
    code: "custom",
    path: input.path,
    message: input.issueCode,
    ...(input.values ? { params: { i18nValues: input.values } } : {}),
  });
}

export const SourcePrecheckResultSchema = z
  .union([CanonicalSourcePrecheckResultSchema, LegacySourcePrecheckResultSchema])
  .transform((value) => {
    if ("summaryCode" in value) {
      return value;
    }

    return {
      level: value.level,
      summaryCode: "legacy_runtime_text" as const,
      summaryValues: { text: value.summary },
      ...(value.recognizedAs ? { recognizedAs: value.recognizedAs } : {}),
      ...(value.details?.length
        ? { details: value.details.map((detail) => toLegacyMessageDescriptor(detail)) }
        : {}),
      ...(value.detectedFields !== undefined
        ? { detectedFields: value.detectedFields }
        : {}),
    };
  });

function tryParseJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function parseCsvHeaders(input: string, delimiter: "," | ";" | "\t" = ",") {
  const [rawHeader] = input.split(/\r?\n/);
  if (!rawHeader?.trim()) {
    return [];
  }

  return rawHeader
    .split(delimiter)
    .map((column) => column.trim())
    .filter((column) => column.length > 0);
}

function extractJsonCandidateKeys(input: string) {
  const parsed = tryParseJson(input.trim());
  if (!parsed) {
    return [];
  }

  if (Array.isArray(parsed)) {
    const first = parsed.find(
      (value) => typeof value === "object" && value !== null,
    );
    return first && !Array.isArray(first) ? Object.keys(first) : [];
  }

  if (typeof parsed === "object") {
    return Object.keys(parsed as Record<string, unknown>);
  }

  return [];
}

const SourceFieldMappingSchema = z.object({
  idField: optionalTrimmedString(120),
  labelField: optionalTrimmedString(120),
  parentField: optionalTrimmedString(120),
  typeField: optionalTrimmedString(120),
});

const AssistantSetupContextSchema = z
  .object({
    createExamples: z.boolean(),
    suggestedBlockCount: z.number().int().min(1).max(12).default(3),
    createInitialRoot: z.boolean().default(false),
    initialRootName: optionalTrimmedString(120),
  })
  .superRefine((value, ctx) => {
    if (value.createInitialRoot && !value.initialRootName?.trim()) {
      addValidationIssue(ctx, {
        path: ["initialRootName"],
        issueCode: "setup_initial_root_name_required",
      });
    }
  });

export const AssistantContextSchema = z.object({
  setup: AssistantSetupContextSchema.optional(),
  erd: z
    .object({
      useDefaultIdPk: z.boolean(),
      autoCreateFk: z.boolean(),
      suggestAssociativeForNN: z.boolean(),
      showFieldTypes: z.boolean(),
      enableDataSemantics: z.boolean(),
      generateTimestamps: z.boolean().default(true),
      suggestIndexes: z.boolean().default(true),
    })
    .optional(),
  flow: z
    .object({
      autoCreateStartEnd: z.boolean(),
      allowDecisions: z.boolean(),
      direction: z.enum(["left-right", "top-down"]),
      allowMultipleOutputs: z.boolean(),
    })
    .optional(),
  hierarchy: z
    .object({
      createRoot: z.boolean(),
      direction: z.enum(["top-down", "left-right"]),
      initialDepthHint: z.number().int().min(1).max(12),
    })
    .optional(),
  sitemap: z
    .object({
      autoCreateHome: z.boolean(),
      generateMainSections: z.boolean(),
      showNavDepth: z.boolean(),
    })
    .optional(),
  graph: z
    .object({
      autoGroup: z.boolean(),
      reduceCrossing: z.boolean(),
      showEdgeLabels: z.boolean(),
    })
    .optional(),
});

const RelationalDbSourceConfigSchema = z
  .object({
    kind: z.enum(["postgres", "mysql", "sqlserver"]),
    connectionMode: z.enum(["string", "fields"]),
    connectionString: optionalTrimmedString(500),
    host: optionalTrimmedString(255),
    port: z.number().int().min(1).max(65535).optional(),
    database: optionalTrimmedString(255),
    schema: optionalTrimmedString(255),
    authMode: z.enum(["userpass", "iam"]).default("userpass"),
    sslMode: z.enum(["disable", "require", "verify-full"]).default("require"),
    username: optionalTrimmedString(255),
    password: optionalTrimmedString(255),
  })
  .superRefine((value, ctx) => {
    if (
      value.connectionMode === "string" &&
      value.connectionString?.trim() &&
      !value.connectionString.includes("://")
    ) {
      addValidationIssue(ctx, {
        issueCode: "relational_connection_string_invalid",
        path: ["connectionString"],
      });
    }

    if (value.connectionMode === "fields") {
      if (!value.host?.trim()) {
        addValidationIssue(ctx, {
          issueCode: "relational_host_required",
          path: ["host"],
        });
      }
      if (!value.database?.trim()) {
        addValidationIssue(ctx, {
          issueCode: "relational_database_required",
          path: ["database"],
        });
      }
      if (!value.port) {
        addValidationIssue(ctx, {
          issueCode: "relational_port_required",
          path: ["port"],
        });
      }
      if (value.authMode === "userpass" && !value.username?.trim()) {
        addValidationIssue(ctx, {
          issueCode: "relational_username_required",
          path: ["username"],
        });
      }
    }
  });

const PrismaSchemaSourceConfigSchema = z
  .object({
    kind: z.literal("prisma-schema"),
    inputMode: z.enum(["paste", "upload"]).default("paste"),
    schemaText: z.preprocess(emptyStringToUndefined, z.string().max(500000).optional()),
  })
  .superRefine((value, ctx) => {
    if (value.inputMode === "paste" && !value.schemaText?.trim()) {
      addValidationIssue(ctx, {
        issueCode: "prisma_schema_required",
        path: ["schemaText"],
      });
    }
  });

const OpenApiSourceConfigSchema = z
  .object({
    kind: z.literal("openapi"),
    inputMode: z.enum(["url", "upload", "paste"]).default("url"),
    url: optionalUrlString(),
    specText: z.preprocess(emptyStringToUndefined, z.string().max(500000).optional()),
  })
  .superRefine((value, ctx) => {
    if (value.inputMode === "url" && !value.url?.trim()) {
      addValidationIssue(ctx, {
        issueCode: "openapi_url_required",
        path: ["url"],
      });
    }

    if (
      value.inputMode === "url" &&
      value.url?.trim() &&
      !z.string().url().safeParse(value.url).success
    ) {
      addValidationIssue(ctx, {
        issueCode: "openapi_url_invalid",
        path: ["url"],
      });
    }

    if (value.inputMode === "paste" && !value.specText?.trim()) {
      addValidationIssue(ctx, {
        issueCode: "openapi_spec_required",
        path: ["specText"],
      });
    }

    if (value.inputMode === "paste" && value.specText?.trim()) {
      const parsed = parseOpenApiDocument(value.specText);
      if (parsed.ok) {
        return;
      }
      addValidationIssue(ctx, {
        issueCode: parsed.errorCode,
        path: ["specText"],
      });
    }
  });

const GraphQlSourceConfigSchema = z
  .object({
    kind: z.literal("graphql"),
    endpointUrl: optionalUrlString(),
    schemaText: z.preprocess(emptyStringToUndefined, z.string().max(500000).optional()),
  })
  .superRefine((value, ctx) => {
    if (!value.endpointUrl?.trim() && !value.schemaText?.trim()) {
      addValidationIssue(ctx, {
        issueCode: "graphql_endpoint_or_schema_required",
        path: ["endpointUrl"],
      });
    }

    if (
      value.endpointUrl?.trim() &&
      !z.string().url().safeParse(value.endpointUrl).success
    ) {
      addValidationIssue(ctx, {
        issueCode: "graphql_endpoint_invalid",
        path: ["endpointUrl"],
      });
    }

    if (value.schemaText?.trim()) {
      const parsed = parseGraphQlSchema(value.schemaText);
      if (parsed.ok) {
        return;
      }
      addValidationIssue(ctx, {
        issueCode: parsed.errorCode,
        path: ["schemaText"],
      });
    }
  });

const GenericImportSourceConfigSchema = z
  .object({
    kind: z.enum([
      "csv",
      "json",
      "spreadsheet",
      "cms-export",
      "existing-map",
      "document-repository",
      "custom-import",
      "sql-file",
      "relational-json",
      "code-routes",
      "folder-structure",
      "events",
      "yaml-json",
    ]),
    inputMode: z.enum(["upload", "paste"]).default("paste"),
    text: z.preprocess(emptyStringToUndefined, z.string().max(500000).optional()),
    delimiter: z.enum([",", ";", "\t"]).optional(),
    hasHeader: z.boolean().optional(),
    previewRows: z.number().int().min(1).max(20).optional(),
    mapping: SourceFieldMappingSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.inputMode === "paste" && !value.text?.trim()) {
      addValidationIssue(ctx, {
        issueCode: "generic_text_required",
        path: ["text"],
      });
    }

    if (value.kind === "json" && value.text?.trim() && !tryParseJson(value.text)) {
      addValidationIssue(ctx, {
        issueCode: "generic_json_invalid",
        path: ["text"],
      });
    }

    if (value.kind === "csv" && value.text?.trim()) {
      const headers = parseCsvHeaders(value.text, value.delimiter ?? ",");
      if (headers.length < 2) {
        addValidationIssue(ctx, {
          issueCode: "generic_csv_headers_invalid",
          path: ["text"],
        });
      }
    }

    if (value.mapping) {
      const candidateFields =
        value.kind === "csv"
          ? parseCsvHeaders(value.text ?? "", value.delimiter ?? ",")
          : value.kind === "json"
            ? extractJsonCandidateKeys(value.text ?? "")
            : [];

      const mappingEntries = Object.entries(value.mapping).filter(
        ([, mapped]) => Boolean(mapped?.trim()),
      );

      for (const [mappingKey, mappedField] of mappingEntries) {
        if (candidateFields.length > 0 && !candidateFields.includes(mappedField!)) {
          addValidationIssue(ctx, {
            issueCode: "generic_mapping_field_not_found",
            path: ["mapping", mappingKey],
            values: { field: mappedField! },
          });
        }
      }
    }
  });

export const AssistantSourceConfigSchema = z.discriminatedUnion("kind", [
  RelationalDbSourceConfigSchema,
  PrismaSchemaSourceConfigSchema,
  OpenApiSourceConfigSchema,
  GraphQlSourceConfigSchema,
  GenericImportSourceConfigSchema,
]);

export const AssistantCreationSettingsSchema = z.object({
  profile: ProjectProfileSchema,
  startStrategy: StartStrategySchema,
  startSource: StartSourceSchema.optional(),
  templatePreset: TemplatePresetSchema.optional(),
  sourceConfig: AssistantSourceConfigSchema.optional(),
  sourceStatus: SourceStatusSchema.optional(),
  precheckResult: SourcePrecheckResultSchema.optional(),
  lastError: z.string().max(500).optional(),
  lastCheckedAt: z.string().datetime().optional(),
  initialView: InitialViewSchema,
  layout: LayoutChoiceSchema,
  detailLevel: DetailLevelSchema,
  automation: AutomationTogglesSchema,
  context: AssistantContextSchema,
});

export const ViewCompatibilityRankSchema = z.enum([
  "primary",
  "secondary",
  "experimental",
  "incompatible",
]);

export type ProjectProfile = z.infer<typeof ProjectProfileSchema>;
export type StartStrategy = z.infer<typeof StartStrategySchema>;
export type StartSource = z.infer<typeof StartSourceSchema>;
export type TemplatePreset = z.infer<typeof TemplatePresetSchema>;
export type InitialView = z.infer<typeof InitialViewSchema>;
export type LayoutChoice = z.infer<typeof LayoutChoiceSchema>;
export type DetailLevel = z.infer<typeof DetailLevelSchema>;
export type AutomationToggles = z.infer<typeof AutomationTogglesSchema>;
export type SourceStatus = z.infer<typeof SourceStatusCodeSchema>;
export type SourcePrecheckResult = z.infer<typeof SourcePrecheckResultSchema>;
export type AssistantContext = z.infer<typeof AssistantContextSchema>;
export type AssistantSetupContext = z.infer<typeof AssistantSetupContextSchema>;
export type AssistantSourceConfig = z.infer<typeof AssistantSourceConfigSchema>;
export type AssistantCreationSettings = z.infer<
  typeof AssistantCreationSettingsSchema
>;
export type ViewCompatibilityRank = z.infer<typeof ViewCompatibilityRankSchema>;
export type SourceFieldMapping = z.infer<typeof SourceFieldMappingSchema>;

export type StartStrategyRecommendationReason =
  | "existing_project_previous_source"
  | "data_model_structural_import"
  | "data_model_configurable_import"
  | "data_model_preview_hybrid"
  | "data_model_template"
  | "system_architecture_import"
  | "system_architecture_hybrid"
  | "system_architecture_template"
  | "information_structure_import"
  | "information_structure_hybrid"
  | "information_structure_template"
  | "process_template"
  | "mixed_hybrid"
  | "mixed_manual_preview"
  | "mixed_manual_blank"
  | "blank_manual";

export type StartStrategyRecommendation = {
  strategy: StartStrategy;
  reasonCode: StartStrategyRecommendationReason;
};

export type LayoutNormalizationWarningCode =
  "legacy_layout_normalized_to_auto";

export type ConnectorCapability =
  | "full_import"
  | "configurable_import"
  | "preview_only"
  | "configure_later";

export type SourceConfigPreview = {
  status: "ready" | "warning";
  summaryCode: SourcePreviewSummaryCode;
  summaryValues?: TranslationValues;
  recognizedAs?: string;
  details?: MessageDescriptor[];
  fields?: string[];
  sample?: Array<Record<string, string>>;
};

type CompatibilityMatrix = Record<
  ProjectProfile,
  Record<InitialView, ViewCompatibilityRank>
>;

const profileViewOrder: Record<ProjectProfile, InitialView[]> = {
  blank: [
    "free",
    "mindmap",
    "graph",
    "hierarchy",
    "flow",
    "sitemap",
    "timeline",
    "erd",
  ],
  "information-structure": [
    "sitemap",
    "hierarchy",
    "graph",
    "free",
    "flow",
    "mindmap",
    "timeline",
    "erd",
  ],
  process: [
    "flow",
    "hierarchy",
    "timeline",
    "graph",
    "free",
    "mindmap",
    "sitemap",
    "erd",
  ],
  "data-model": [
    "erd",
    "graph",
    "free",
    "hierarchy",
    "flow",
    "mindmap",
    "sitemap",
    "timeline",
  ],
  "system-architecture": [
    "graph",
    "hierarchy",
    "flow",
    "erd",
    "free",
    "mindmap",
    "timeline",
    "sitemap",
  ],
  "documents-governance": [
    "hierarchy",
    "graph",
    "flow",
    "timeline",
    "free",
    "sitemap",
    "mindmap",
    "erd",
  ],
  mixed: [
    "graph",
    "free",
    "flow",
    "hierarchy",
    "erd",
    "sitemap",
    "timeline",
    "mindmap",
  ],
};

export const VIEW_COMPATIBILITY_MATRIX: CompatibilityMatrix = {
  blank: {
    free: "primary",
    mindmap: "primary",
    hierarchy: "secondary",
    flow: "secondary",
    graph: "secondary",
    erd: "experimental",
    sitemap: "experimental",
    timeline: "experimental",
  },
  "information-structure": {
    sitemap: "primary",
    hierarchy: "primary",
    graph: "primary",
    free: "secondary",
    flow: "secondary",
    timeline: "secondary",
    mindmap: "secondary",
    erd: "incompatible",
  },
  process: {
    flow: "primary",
    hierarchy: "secondary",
    timeline: "secondary",
    graph: "secondary",
    free: "secondary",
    mindmap: "secondary",
    erd: "incompatible",
    sitemap: "incompatible",
  },
  "data-model": {
    erd: "primary",
    graph: "primary",
    free: "secondary",
    hierarchy: "experimental",
    flow: "incompatible",
    sitemap: "incompatible",
    timeline: "incompatible",
    mindmap: "incompatible",
  },
  "system-architecture": {
    graph: "primary",
    hierarchy: "secondary",
    flow: "secondary",
    erd: "secondary",
    free: "secondary",
    timeline: "secondary",
    mindmap: "secondary",
    sitemap: "incompatible",
  },
  "documents-governance": {
    hierarchy: "primary",
    graph: "primary",
    flow: "secondary",
    timeline: "secondary",
    free: "secondary",
    sitemap: "secondary",
    mindmap: "secondary",
    erd: "experimental",
  },
  mixed: {
    graph: "primary",
    free: "primary",
    flow: "secondary",
    hierarchy: "secondary",
    erd: "secondary",
    sitemap: "secondary",
    timeline: "experimental",
    mindmap: "experimental",
  },
};

type LayoutCatalog = {
  recommended: LayoutChoice[];
  advanced: LayoutChoice[];
};

const LAYOUT_CATALOG_BY_VIEW: Record<InitialView, LayoutCatalog> = {
  erd: {
    recommended: ["relational", "auto"],
    advanced: ["free"],
  },
  mindmap: {
    recommended: ["radial", "auto"],
    advanced: ["free"],
  },
  flow: {
    recommended: ["horizontal", "vertical", "auto"],
    advanced: ["free"],
  },
  sitemap: {
    recommended: ["vertical", "horizontal", "auto"],
    advanced: ["free"],
  },
  hierarchy: {
    recommended: ["vertical", "horizontal", "auto"],
    advanced: ["free"],
  },
  graph: {
    recommended: ["auto", "free"],
    advanced: ["vertical", "horizontal", "radial", "relational"],
  },
  free: {
    recommended: ["free", "auto"],
    advanced: ["vertical", "horizontal", "radial", "relational"],
  },
  timeline: {
    recommended: ["horizontal", "auto"],
    advanced: ["vertical", "free"],
  },
};

const rankWeight: Record<ViewCompatibilityRank, number> = {
  primary: 0,
  secondary: 1,
  experimental: 2,
  incompatible: 3,
};

const startSourcesByProfile: Record<ProjectProfile, StartSource[]> = {
  "data-model": [
    "postgres",
    "mysql",
    "sqlserver",
    "prisma-schema",
    "sql-file",
    "relational-json",
  ],
  "system-architecture": [
    "openapi",
    "graphql",
    "code-routes",
    "folder-structure",
    "events",
    "yaml-json",
  ],
  "information-structure": [
    "spreadsheet",
    "csv",
    "json",
    "cms-export",
    "existing-map",
  ],
  "documents-governance": [
    "spreadsheet",
    "csv",
    "document-repository",
    "json",
    "custom-import",
  ],
  process: ["spreadsheet", "csv"],
  blank: [
    "spreadsheet",
    "csv",
    "json",
    "custom-import",
    "openapi",
    "graphql",
  ],
  mixed: [
    "spreadsheet",
    "csv",
    "json",
    "custom-import",
    "openapi",
    "graphql",
    "prisma-schema",
    "sql-file",
  ],
};

const connectorCapabilityBySource: Record<StartSource, ConnectorCapability> = {
  postgres: "configurable_import",
  mysql: "configurable_import",
  sqlserver: "configurable_import",
  "prisma-schema": "full_import",
  "sql-file": "configure_later",
  "relational-json": "configure_later",
  openapi: "preview_only",
  graphql: "preview_only",
  "code-routes": "configure_later",
  "folder-structure": "configure_later",
  events: "configure_later",
  "yaml-json": "configure_later",
  csv: "preview_only",
  json: "preview_only",
  spreadsheet: "preview_only",
  "cms-export": "configure_later",
  "existing-map": "configure_later",
  "document-repository": "configure_later",
  "custom-import": "configure_later",
};

const templatePresetsByProfile: Record<ProjectProfile, TemplatePreset[]> = {
  "data-model": ["erd-basic", "blank-canvas"],
  process: ["process-basic", "blank-canvas"],
  "information-structure": ["sitemap-basic", "blank-canvas"],
  "system-architecture": ["architecture-basic", "blank-canvas"],
  "documents-governance": ["sitemap-basic", "blank-canvas"],
  blank: ["blank-canvas"],
  mixed: [
    "architecture-basic",
    "process-basic",
    "erd-basic",
    "sitemap-basic",
    "blank-canvas",
  ],
};

function sortViews(profile: ProjectProfile, views: InitialView[]) {
  const order = profileViewOrder[profile];

  return [...views].sort((a, b) => {
    const rankA = rankWeight[VIEW_COMPATIBILITY_MATRIX[profile][a]];
    const rankB = rankWeight[VIEW_COMPATIBILITY_MATRIX[profile][b]];
    if (rankA !== rankB) {
      return rankA - rankB;
    }

    return order.indexOf(a) - order.indexOf(b);
  });
}

function isLayoutAllowedForViewInternal(
  initialView: InitialView,
  layout: LayoutChoice,
  profile?: ProjectProfile,
) {
  const catalog = resolveRecipeLayoutCatalog({
    profile,
    view: initialView,
    fallback: LAYOUT_CATALOG_BY_VIEW[initialView],
  });
  return (
    catalog.recommended.some((candidate) => candidate === layout) ||
    catalog.advanced.some((candidate) => candidate === layout)
  );
}

function validateSourceConfigRequirements(value: {
  startStrategy: StartStrategy;
  startSource?: StartSource;
  sourceConfig?: AssistantSourceConfig;
}, ctx: z.RefinementCtx) {
  const needsSourceConfig = value.startStrategy === "import";
  if (needsSourceConfig && !value.sourceConfig) {
    addValidationIssue(ctx, {
      issueCode: "source_config_required_for_import",
      path: ["sourceConfig"],
    });
    return;
  }

  if (!value.sourceConfig) {
    return;
  }

  if (!value.startSource) {
    addValidationIssue(ctx, {
      issueCode: "start_source_required_for_source_config",
      path: ["startSource"],
    });
    return;
  }

  if (value.sourceConfig.kind !== value.startSource) {
    addValidationIssue(ctx, {
      issueCode: "source_config_kind_mismatch",
      path: ["sourceConfig", "kind"],
    });
  }
}

export const AssistantDraftSchema = z
  .object({
    projectName: z.string().min(1).max(120),
    projectObjective: z.string().max(500).optional(),
    profile: ProjectProfileSchema,
    startStrategy: StartStrategySchema,
    startSource: StartSourceSchema.optional(),
    templatePreset: TemplatePresetSchema.optional(),
    sourceConfig: AssistantSourceConfigSchema.optional(),
    sourceStatus: SourceStatusSchema.optional(),
    precheckResult: SourcePrecheckResultSchema.optional(),
    lastError: z.string().max(500).optional(),
    lastCheckedAt: z.string().datetime().optional(),
    initialView: InitialViewSchema,
    layout: LayoutChoiceSchema,
    detailLevel: DetailLevelSchema,
    automation: AutomationTogglesSchema,
    context: AssistantContextSchema.default({}),
  })
  .superRefine((value, ctx) => {
    if (value.startStrategy === "template") {
      if (!value.templatePreset) {
        addValidationIssue(ctx, {
          issueCode: "template_preset_required",
          path: ["templatePreset"],
        });
      }
      if (value.startSource) {
        addValidationIssue(ctx, {
          issueCode: "template_cannot_use_source",
          path: ["startSource"],
        });
      }
      if (value.sourceConfig) {
        addValidationIssue(ctx, {
          issueCode: "template_cannot_use_source_config",
          path: ["sourceConfig"],
        });
      }
    }

    if (value.startStrategy === "manual") {
      if (value.startSource) {
        addValidationIssue(ctx, {
          issueCode: "manual_cannot_use_source",
          path: ["startSource"],
        });
      }
      if (value.templatePreset) {
        addValidationIssue(ctx, {
          issueCode: "manual_cannot_use_template_preset",
          path: ["templatePreset"],
        });
      }
      if (value.sourceConfig) {
        addValidationIssue(ctx, {
          issueCode: "manual_cannot_use_source_config",
          path: ["sourceConfig"],
        });
      }
    }

    if (
      (value.startStrategy === "import" || value.startStrategy === "hybrid") &&
      !value.startSource
    ) {
      addValidationIssue(ctx, {
        issueCode: "start_source_required_for_source_config",
        path: ["startSource"],
      });
    }

    if (value.startStrategy === "import" && value.templatePreset) {
      addValidationIssue(ctx, {
        issueCode: "import_cannot_use_template_preset",
        path: ["templatePreset"],
      });
    }

    if (
      value.startSource &&
      !isStartSourceAllowedForProfile(value.profile, value.startSource)
    ) {
      addValidationIssue(ctx, {
        issueCode: "start_source_incompatible_with_profile",
        path: ["startSource"],
      });
    }

    validateSourceConfigRequirements(value, ctx);

    if (getViewCompatibilityRank(value.profile, value.initialView) === "incompatible") {
      addValidationIssue(ctx, {
        issueCode: "initial_view_incompatible_with_profile",
        path: ["initialView"],
      });
    }

    if (
      !isLayoutAllowedForViewInternal(
        value.initialView,
        value.layout,
        value.profile,
      )
    ) {
      addValidationIssue(ctx, {
        issueCode: "layout_incompatible_with_initial_view",
        path: ["layout"],
      });
    }

  });

export type AssistantDraft = z.infer<typeof AssistantDraftSchema>;

export function getViewCompatibilityRank(
  profile: ProjectProfile,
  view: InitialView,
): ViewCompatibilityRank {
  return VIEW_COMPATIBILITY_MATRIX[profile][view];
}

export function getRecommendedViewsForProfile(profile: ProjectProfile) {
  const allViews = InitialViewSchema.options;
  const sorted = sortViews(profile, [...allViews]);
  const recommended = sorted.filter(
    (view) => getViewCompatibilityRank(profile, view) === "primary",
  );
  const other = sorted.filter((view) => {
    const rank = getViewCompatibilityRank(profile, view);
    return rank === "secondary" || rank === "experimental";
  });
  const incompatible = sorted.filter(
    (view) => getViewCompatibilityRank(profile, view) === "incompatible",
  );

  return {
    recommended,
    other,
    incompatible,
  };
}

export function getAllowedStartSourcesForProfile(profile: ProjectProfile) {
  return startSourcesByProfile[profile];
}

export function getConnectorCapability(
  source: StartSource,
): ConnectorCapability {
  return connectorCapabilityBySource[source];
}

export function resolveRecommendedStartStrategy(input: {
  profile: ProjectProfile;
  connectorsAvailable: StartSource[];
  fromProjectId?: string | null;
  hasPreviousSourceConfig?: boolean;
}): StartStrategyRecommendation {
  const available = new Set(input.connectorsAvailable);
  const hasFullImportConnector = [...available].some(
    (source) => getConnectorCapability(source) === "full_import",
  );
  const hasConfigurableImportConnector = [...available].some(
    (source) => getConnectorCapability(source) === "configurable_import",
  );
  const hasPreviewOnlyConnector = [...available].some(
    (source) => getConnectorCapability(source) === "preview_only",
  );

  if (input.fromProjectId && input.hasPreviousSourceConfig) {
    return {
      strategy: "hybrid",
      reasonCode: "existing_project_previous_source",
    };
  }

  switch (input.profile) {
    case "data-model":
      if (available.has("prisma-schema") || hasFullImportConnector) {
        return {
          strategy: "import",
          reasonCode: "data_model_structural_import",
        };
      }
      if (hasConfigurableImportConnector) {
        return {
          strategy: "import",
          reasonCode: "data_model_configurable_import",
        };
      }
      if (hasPreviewOnlyConnector) {
        return {
          strategy: "hybrid",
          reasonCode: "data_model_preview_hybrid",
        };
      }
      return {
        strategy: "template",
        reasonCode: "data_model_template",
      };
    case "system-architecture":
      if (hasFullImportConnector || hasConfigurableImportConnector) {
        return {
          strategy: "import",
          reasonCode: "system_architecture_import",
        };
      }
      if (hasPreviewOnlyConnector || available.has("openapi") || available.has("graphql")) {
        return {
          strategy: "hybrid",
          reasonCode: "system_architecture_hybrid",
        };
      }
      return {
        strategy: "template",
        reasonCode: "system_architecture_template",
      };
    case "information-structure":
    case "documents-governance":
      if (
        available.has("spreadsheet") ||
        available.has("csv") ||
        available.has("json")
      ) {
        return {
          strategy: hasConfigurableImportConnector ? "import" : "hybrid",
          reasonCode: hasConfigurableImportConnector
            ? "information_structure_import"
            : "information_structure_hybrid",
        };
      }
      return {
        strategy: "template",
        reasonCode: "information_structure_template",
      };
    case "process":
      return {
        strategy: "template",
        reasonCode: "process_template",
      };
    case "mixed":
      if (hasFullImportConnector || hasConfigurableImportConnector) {
        return {
          strategy: "hybrid",
          reasonCode: "mixed_hybrid",
        };
      }
      if (hasPreviewOnlyConnector) {
        return {
          strategy: "manual",
          reasonCode: "mixed_manual_preview",
        };
      }
      return {
        strategy: "manual",
        reasonCode: "mixed_manual_blank",
      };
    case "blank":
    default:
      return {
        strategy: "manual",
        reasonCode: "blank_manual",
      };
  }
}

export function getAllowedTemplatePresetsForProfile(profile: ProjectProfile) {
  return templatePresetsByProfile[profile];
}

export function isStartSourceAllowedForProfile(
  profile: ProjectProfile,
  startSource: StartSource,
) {
  return getAllowedStartSourcesForProfile(profile).includes(startSource);
}

export function resolveRecommendedInitialView(profile: ProjectProfile): InitialView {
  const recommended = getRecommendedViewsForProfile(profile).recommended;
  return recommended[0] ?? "free";
}

export function getLayoutCatalogForView(
  initialView: InitialView,
  profile?: ProjectProfile,
) {
  return resolveRecipeLayoutCatalog({
    profile,
    view: initialView,
    fallback: LAYOUT_CATALOG_BY_VIEW[initialView],
  });
}

export function isLayoutAllowedForView(
  initialView: InitialView,
  layout: LayoutChoice,
  profile?: ProjectProfile,
) {
  return isLayoutAllowedForViewInternal(initialView, layout, profile);
}

export function normalizeLayoutForView(input: {
  profile?: ProjectProfile;
  initialView: InitialView;
  layout?: LayoutChoice;
}) {
  const fallback = resolveRecommendedLayout(input.initialView, input.profile);
  const autoFallback = isLayoutAllowedForViewInternal(
    input.initialView,
    "auto",
    input.profile,
  )
    ? "auto"
    : fallback;

  if (!input.layout) {
    return {
      layout: fallback,
      normalized: false,
      warningCode: null as LayoutNormalizationWarningCode | null,
    };
  }

  if (
    isLayoutAllowedForViewInternal(
      input.initialView,
      input.layout,
      input.profile,
    )
  ) {
    return {
      layout: input.layout,
      normalized: false,
      warningCode: null as LayoutNormalizationWarningCode | null,
    };
  }

  return {
    layout: autoFallback,
    normalized: true,
    warningCode: "legacy_layout_normalized_to_auto" as const,
  };
}

export function resolveRecommendedLayout(
  initialView: InitialView,
  profile?: ProjectProfile,
): LayoutChoice {
  const catalog = getLayoutCatalogForView(initialView, profile);
  return catalog.recommended[0] ?? "auto";
}

const FALLBACK_CONTEXT_BLOCKS_BY_VIEW: Record<InitialView, RecipeContextBlock[]> = {
  erd: ["setup", "erd"],
  flow: ["setup", "flow"],
  sitemap: ["setup", "sitemap"],
  hierarchy: ["setup", "hierarchy"],
  graph: ["setup", "graph"],
  free: ["setup", "graph"],
  mindmap: ["setup", "graph"],
  timeline: ["setup"],
};

export function getContextBlocksForProfileView(input: {
  profile?: ProjectProfile;
  initialView: InitialView;
}) {
  return resolveRecipeContextBlocks({
    profile: input.profile,
    view: input.initialView,
    fallback: FALLBACK_CONTEXT_BLOCKS_BY_VIEW[input.initialView],
  });
}

export function getRecipeValidationHints(input: {
  profile: ProjectProfile;
  initialView: InitialView;
  phase: "draft" | "guided" | "strict";
}) {
  return resolveRecipeValidationRules({
    profile: input.profile,
    view: input.initialView,
    phase: input.phase,
  });
}

export function validateAssistantDraftForPhase(input: {
  draft: AssistantDraft;
  phase: "draft" | "guided" | "strict";
}) {
  if (input.phase !== "strict") {
    return [] as string[];
  }

  return validateStrictByRecipeFromRegistry(input.draft).blockingIssueCodes;
}

export function resolveDiagramViewForInitialView(
  initialView: InitialView,
): DiagramView {
  switch (initialView) {
    case "hierarchy":
      return "tree";
    case "flow":
      return "flow";
    case "mindmap":
      return "mindmap";
    case "erd":
      return "erd";
    case "sitemap":
      return "sitemap";
    case "timeline":
      return "timeline";
    case "graph":
    case "free":
    default:
      return "graph";
  }
}

export function resolveDiagramIdentityForInitialView(
  initialView: InitialView,
): {
  diagramType: CanonicalDiagramType;
  diagramView: DiagramView;
} {
  const diagramView = resolveDiagramViewForInitialView(initialView);

  return {
    diagramType: resolveCanonicalDiagramTypeFromView(diagramView),
    diagramView,
  };
}

export function resolveInitialViewFromDiagramIdentity(input: {
  diagramType?: CanonicalDiagramType;
  diagramView?: DiagramView;
}): InitialView {
  const diagramView = input.diagramView;

  if (diagramView === "tree") {
    return "hierarchy";
  }
  if (diagramView === "flow") {
    return "flow";
  }
  if (diagramView === "mindmap") {
    return "mindmap";
  }
  if (diagramView === "erd") {
    return "erd";
  }
  if (diagramView === "sitemap") {
    return "sitemap";
  }
  if (diagramView === "timeline") {
    return "timeline";
  }
  if (diagramView === "graph") {
    return "graph";
  }

  if (input.diagramType === "tree") {
    return "hierarchy";
  }
  if (input.diagramType === "flow") {
    return "flow";
  }
  if (input.diagramType === "mindmap") {
    return "mindmap";
  }

  return "free";
}

export function buildDefaultAutomationToggles(): AutomationToggles {
  return {
    ...DEFAULT_AUTOMATION_TOGGLES,
  };
}

export function buildDefaultContextForView(
  initialView: InitialView,
  profile?: ProjectProfile,
): AssistantContext {
  const runtimeContextBlocks = profile
    ? resolveRecipeRuntime({
        profile,
        view: initialView,
      }).contextBlocks
    : getContextBlocksForProfileView({
        initialView,
      });
  const contextBlocks = new Set(runtimeContextBlocks);
  const setup: AssistantSetupContext = {
    createExamples: true,
    suggestedBlockCount: 3,
    createInitialRoot: initialView === "hierarchy",
    initialRootName: initialView === "hierarchy" ? "No raiz" : "Nucleo",
  };
  const context: AssistantContext = {
    setup,
  };

  if (contextBlocks.has("erd")) {
    context.erd = {
      useDefaultIdPk: true,
      autoCreateFk: true,
      suggestAssociativeForNN: true,
      showFieldTypes: true,
      enableDataSemantics: true,
      generateTimestamps: true,
      suggestIndexes: true,
    };
  }

  if (contextBlocks.has("flow")) {
    context.flow = {
      autoCreateStartEnd: true,
      allowDecisions: true,
      direction: "left-right",
      allowMultipleOutputs: false,
    };
  }

  if (contextBlocks.has("hierarchy")) {
    context.hierarchy = {
      createRoot: true,
      direction: "top-down",
      initialDepthHint: 2,
    };
  }

  if (contextBlocks.has("sitemap")) {
    context.sitemap = {
      autoCreateHome: true,
      generateMainSections: true,
      showNavDepth: true,
    };
  }

  if (contextBlocks.has("graph")) {
    context.graph = {
      autoGroup: true,
      reduceCrossing: true,
      showEdgeLabels: true,
    };
  }

  return context;
}

export function buildDefaultSourceConfigForSource(
  source: StartSource,
): AssistantSourceConfig {
  if (source === "prisma-schema") {
    return {
      kind: "prisma-schema",
      inputMode: "paste",
      schemaText: "",
    };
  }

  if (source === "openapi") {
    return {
      kind: "openapi",
      inputMode: "url",
      url: "",
    };
  }

  if (source === "graphql") {
    return {
      kind: "graphql",
      endpointUrl: "",
      schemaText: "",
    };
  }

  if (source === "postgres" || source === "mysql" || source === "sqlserver") {
    return {
      kind: source,
      connectionMode: "string",
      connectionString: "",
      authMode: "userpass",
      sslMode: "require",
      username: "",
    };
  }

  return {
    kind: source,
    inputMode: "paste",
    text: "",
    ...(source === "csv" ? { delimiter: "," as const } : {}),
    hasHeader: true,
    previewRows: 5,
    mapping: {},
  };
}

function toStringRecord(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      typeof val === "string" ? val : JSON.stringify(val),
    ]),
  );
}

function buildCsvSample(
  text: string,
  delimiter: "," | ";" | "\t",
  previewRows: number,
) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) {
    return { fields: [] as string[], sample: [] as Array<Record<string, string>> };
  }

  const fields = parseCsvHeaders(lines[0], delimiter);
  const sample = lines.slice(1, 1 + previewRows).map((line) => {
    const values = line.split(delimiter).map((cell) => cell.trim());
    return Object.fromEntries(fields.map((field, index) => [field, values[index] ?? ""]));
  });

  return { fields, sample };
}

export function resolveSourceConfigPreview(
  sourceConfig?: AssistantSourceConfig,
): SourceConfigPreview | null {
  if (!sourceConfig) {
    return null;
  }

  if (sourceConfig.kind === "prisma-schema") {
    const text = sourceConfig.schemaText?.trim() ?? "";
    if (!text) {
      return {
        status: "warning",
        summaryCode: "prisma_preview_schema_required",
      };
    }
    const modelCount = (text.match(/\bmodel\s+[A-Za-z_]/g) ?? []).length;
    return {
      status: "ready",
      summaryCode:
        modelCount > 0
          ? "prisma_preview_models_detected"
          : "prisma_preview_ready_without_models",
      ...(modelCount > 0 ? { summaryValues: { count: modelCount } } : {}),
    };
  }

  if (
    sourceConfig.kind === "postgres" ||
    sourceConfig.kind === "mysql" ||
    sourceConfig.kind === "sqlserver"
  ) {
    if (sourceConfig.connectionMode === "string") {
      return {
        status: sourceConfig.connectionString?.trim() ? "ready" : "warning",
        summaryCode: sourceConfig.connectionString?.trim()
          ? "relational_preview_connection_string_ready"
          : "relational_preview_connection_string_required",
      };
    }
    const ready = Boolean(
      sourceConfig.host?.trim() &&
        sourceConfig.database?.trim() &&
        sourceConfig.port,
    );
    return {
      status: ready ? "ready" : "warning",
      summaryCode: ready
        ? "relational_preview_fields_ready"
        : "relational_preview_fields_required",
    };
  }

  if (sourceConfig.kind === "openapi") {
    if (sourceConfig.inputMode === "url") {
      return {
        status: sourceConfig.url?.trim() ? "ready" : "warning",
        summaryCode: sourceConfig.url?.trim()
          ? "openapi_preview_url_ready"
          : "openapi_preview_url_required",
        recognizedAs: "openapi-url",
      };
    }

    const specText = sourceConfig.specText?.trim() ?? "";
    if (!specText) {
      return {
        status: "warning",
        summaryCode: "openapi_preview_spec_required",
      };
    }

    const parsed = parseOpenApiDocument(specText);
    if (!parsed.ok) {
      return {
        status: "warning",
        summaryCode: parsed.errorCode,
        recognizedAs: "openapi",
      };
    }

    return {
      status: "ready",
      summaryCode: "openapi_preview_recognized",
      summaryValues: {
        version: parsed.version,
        pathCount: parsed.pathCount,
      },
      recognizedAs: "openapi",
      details: [
        buildMessageDescriptor("openapi_preview_format", {
          format: parsed.format.toUpperCase(),
        }),
        ...(parsed.title
          ? [buildMessageDescriptor("openapi_preview_title", { title: parsed.title })]
          : []),
      ],
      fields: ["paths"],
    };
  }

  if (sourceConfig.kind === "graphql") {
    const schemaText = sourceConfig.schemaText?.trim() ?? "";
    if (schemaText) {
      const parsed = parseGraphQlSchema(schemaText);
      return {
        status: parsed.ok ? "ready" : "warning",
        summaryCode: parsed.ok
          ? "graphql_preview_recognized"
          : parsed.errorCode,
        ...(parsed.ok ? { summaryValues: { typeCount: parsed.typeCount } } : {}),
        ...(parsed.ok ? { recognizedAs: `graphql-${parsed.source}` } : {}),
        ...(parsed.ok
          ? {
              details: [
                buildMessageDescriptor(
                  parsed.source === "sdl"
                    ? "graphql_preview_source_sdl"
                    : "graphql_preview_source_introspection_json",
                ),
              ],
            }
          : {}),
      };
    }

    return {
      status: sourceConfig.endpointUrl?.trim() ? "ready" : "warning",
      summaryCode: sourceConfig.endpointUrl?.trim()
        ? "graphql_preview_endpoint_ready"
        : "graphql_preview_endpoint_or_schema_required",
      recognizedAs: "graphql-endpoint",
    };
  }

  if (sourceConfig.kind === "csv") {
    const text = sourceConfig.text?.trim() ?? "";
    if (!text) {
      return {
        status: "warning",
        summaryCode: "csv_preview_text_required",
      };
    }

    const previewRows = sourceConfig.previewRows ?? 5;
    const delimiter = sourceConfig.delimiter ?? ",";
    const preview = buildCsvSample(text, delimiter, previewRows);
    return {
      status: preview.fields.length > 0 ? "ready" : "warning",
      summaryCode:
        preview.fields.length > 0
          ? "csv_preview_columns_detected"
          : "csv_preview_header_not_recognized",
      ...(preview.fields.length > 0
        ? { summaryValues: { count: preview.fields.length } }
        : {}),
      fields: preview.fields,
      sample: preview.sample,
    };
  }

  if (sourceConfig.kind === "json") {
    const text = sourceConfig.text?.trim() ?? "";
    if (!text) {
      return {
        status: "warning",
        summaryCode: "json_preview_text_required",
      };
    }

    const parsed = tryParseJson(text);
    if (!parsed) {
      return {
        status: "warning",
        summaryCode: "json_preview_invalid",
      };
    }

    const fields = extractJsonCandidateKeys(text);
    let sample: Array<Record<string, string>> = [];
    if (Array.isArray(parsed)) {
      sample = parsed
        .map((value) => toStringRecord(value))
        .filter((value): value is Record<string, string> => value !== null)
        .slice(0, sourceConfig.previewRows ?? 5);
    } else {
      const candidate = toStringRecord(parsed);
      sample = candidate ? [candidate] : [];
    }

    return {
      status: "ready",
      summaryCode: "json_preview_recognized",
      fields,
      sample,
    };
  }

  if (sourceConfig.kind === "spreadsheet") {
    return {
      status: sourceConfig.text?.trim() ? "ready" : "warning",
      summaryCode: sourceConfig.text?.trim()
        ? "spreadsheet_preview_ready"
        : "spreadsheet_preview_text_required",
    };
  }

  const genericText =
    "text" in sourceConfig && typeof sourceConfig.text === "string"
      ? sourceConfig.text
      : "";

  return {
    status: genericText.trim() ? "ready" : "warning",
    summaryCode: genericText.trim()
      ? "generic_preview_ready"
      : "generic_preview_text_required",
  };
}

function redactSourceErrorText(errorText?: string | null) {
  if (!errorText?.trim()) {
    return undefined;
  }

  return redactSensitiveText(errorText);
}

function toPrecheckResult(preview: SourceConfigPreview): SourcePrecheckResult {
  return {
    level: preview.status === "ready" ? "ok" : "warning",
    summaryCode: preview.summaryCode,
    ...(preview.summaryValues ? { summaryValues: preview.summaryValues } : {}),
    ...(preview.recognizedAs ? { recognizedAs: preview.recognizedAs } : {}),
    ...(preview.details?.length ? { details: preview.details } : {}),
    ...(preview.fields ? { detectedFields: preview.fields.length } : {}),
  };
}

function isSourceConfigConfigured(sourceConfig?: AssistantSourceConfig) {
  if (!sourceConfig) {
    return false;
  }

  if (sourceConfig.kind === "prisma-schema") {
    return Boolean(sourceConfig.schemaText?.trim());
  }

  if (
    sourceConfig.kind === "postgres" ||
    sourceConfig.kind === "mysql" ||
    sourceConfig.kind === "sqlserver"
  ) {
    if (sourceConfig.connectionMode === "string") {
      return Boolean(sourceConfig.connectionString?.trim());
    }

    return Boolean(
      sourceConfig.host?.trim() &&
        sourceConfig.database?.trim() &&
        sourceConfig.port,
    );
  }

  if (sourceConfig.kind === "openapi") {
    if (sourceConfig.inputMode === "url") {
      return Boolean(sourceConfig.url?.trim());
    }
    return Boolean(sourceConfig.specText?.trim());
  }

  if (sourceConfig.kind === "graphql") {
    return Boolean(sourceConfig.endpointUrl?.trim() || sourceConfig.schemaText?.trim());
  }

  return Boolean("text" in sourceConfig && sourceConfig.text?.trim());
}

export function resolveSourceLifecycle(input: {
  startStrategy: StartStrategy;
  startSource?: StartSource;
  sourceConfig?: AssistantSourceConfig;
  sourceStatus?: SourceStatus;
  precheckResult?: SourcePrecheckResult;
  lastCheckedAt?: string;
  lastError?: string;
  markAsImported?: boolean;
  markAsFailed?: string;
  checkedAt?: Date;
}) {
  const checkedAtIso = (input.checkedAt ?? new Date()).toISOString();

  if (input.markAsFailed) {
    return {
      sourceStatus: "failed" as const,
      precheckResult: {
        level: "error" as const,
        summaryCode: "source_lifecycle_precheck_failed" as const,
      },
      lastError: redactSourceErrorText(input.markAsFailed),
      lastCheckedAt: checkedAtIso,
    };
  }

  if (input.markAsImported) {
    return {
      sourceStatus: "imported" as const,
      precheckResult: input.precheckResult ?? {
        level: "ok" as const,
        summaryCode: "source_lifecycle_imported" as const,
      },
      lastCheckedAt: checkedAtIso,
      lastError: undefined,
    };
  }

  if (
    input.startStrategy === "manual" ||
    input.startStrategy === "template" ||
    !input.startSource
  ) {
    return {
      sourceStatus: "not_configured" as const,
      precheckResult: undefined,
      lastCheckedAt: undefined,
      lastError: undefined,
    };
  }

  if (!isSourceConfigConfigured(input.sourceConfig)) {
    return {
      sourceStatus: "not_configured" as const,
      precheckResult: undefined,
      lastCheckedAt: input.lastCheckedAt,
      lastError: undefined,
    };
  }

  const preview = resolveSourceConfigPreview(input.sourceConfig);
  if (!preview) {
    return {
      sourceStatus: "configured" as const,
      precheckResult: undefined,
      lastCheckedAt: input.lastCheckedAt,
      lastError: undefined,
    };
  }

  if (preview.status !== "ready") {
    return {
      sourceStatus: "configured" as const,
      precheckResult: toPrecheckResult(preview),
      lastCheckedAt: checkedAtIso,
      lastError: redactSourceErrorText(input.lastError),
    };
  }

  const capability = getConnectorCapability(input.startSource);
  const sourceStatus: SourceStatus =
    capability === "full_import" || capability === "configurable_import"
      ? "ready_to_attempt_import"
      : "precheck_ok";

  return {
    sourceStatus,
    precheckResult: toPrecheckResult(preview),
    lastCheckedAt: checkedAtIso,
    lastError: undefined,
  };
}

export function applyResolvedSourceLifecycleToDraft(
  draft: AssistantDraft,
  overrides?: {
    markAsImported?: boolean;
    markAsFailed?: string;
    checkedAt?: Date;
  },
) {
  const lifecycle = resolveSourceLifecycle({
    startStrategy: draft.startStrategy,
    startSource: draft.startSource,
    sourceConfig: draft.sourceConfig,
    sourceStatus: draft.sourceStatus,
    precheckResult: draft.precheckResult,
    lastCheckedAt: draft.lastCheckedAt,
    lastError: draft.lastError,
    ...(overrides?.markAsImported ? { markAsImported: true } : {}),
    ...(overrides?.markAsFailed ? { markAsFailed: overrides.markAsFailed } : {}),
    ...(overrides?.checkedAt ? { checkedAt: overrides.checkedAt } : {}),
  });

  return AssistantDraftSchema.parse({
    ...draft,
    ...lifecycle,
  });
}

export function applyResolvedSourceLifecycleToSettings(
  settings: AssistantCreationSettings,
  overrides?: {
    markAsImported?: boolean;
    markAsFailed?: string;
    checkedAt?: Date;
  },
) {
  const lifecycle = resolveSourceLifecycle({
    startStrategy: settings.startStrategy,
    startSource: settings.startSource,
    sourceConfig: settings.sourceConfig,
    sourceStatus: settings.sourceStatus,
    precheckResult: settings.precheckResult,
    lastCheckedAt: settings.lastCheckedAt,
    lastError: settings.lastError,
    ...(overrides?.markAsImported ? { markAsImported: true } : {}),
    ...(overrides?.markAsFailed ? { markAsFailed: overrides.markAsFailed } : {}),
    ...(overrides?.checkedAt ? { checkedAt: overrides.checkedAt } : {}),
  });

  return AssistantCreationSettingsSchema.parse({
    ...settings,
    ...lifecycle,
  });
}
