import { z } from "zod";
import {
  DEFAULT_AUTOMATION_COPY,
  DEFAULT_AUTOMATION_TOGGLES,
  resolveRecipeContextBlocks,
  resolveRecipeLayoutCatalog,
  resolveRecipeRuntime,
  resolveRecipeValidationRules,
  validateStrictByRecipe as validateStrictByRecipeFromRegistry,
  type RecipeContextBlock,
} from "./recipes";
import { redactSensitiveText } from "./redact-source-config";
import { parseGraphQlSchema, parseOpenApiDocument } from "./source-precheck";

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

export const SourcePrecheckResultSchema = z.object({
  level: z.enum(["ok", "warning", "error"]),
  summary: z.string().min(1).max(500),
  recognizedAs: z.string().min(1).max(120).optional(),
  details: z.array(z.string().min(1).max(500)).max(10).optional(),
  detectedFields: z.number().int().min(0).optional(),
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
  idField: z.string().trim().min(1).max(120).optional(),
  labelField: z.string().trim().min(1).max(120).optional(),
  parentField: z.string().trim().min(1).max(120).optional(),
  typeField: z.string().trim().min(1).max(120).optional(),
});

const AssistantSetupContextSchema = z
  .object({
    createExamples: z.boolean(),
    suggestedBlockCount: z.number().int().min(1).max(12).default(3),
    createInitialRoot: z.boolean().default(false),
    initialRootName: z.string().trim().min(1).max(120).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.createInitialRoot && !value.initialRootName?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["initialRootName"],
        message: "Informe o nome do no raiz inicial.",
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
    connectionString: z.string().min(1).optional(),
    host: z.string().min(1).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    database: z.string().min(1).optional(),
    schema: z.string().min(1).optional(),
    authMode: z.enum(["userpass", "iam"]).default("userpass"),
    sslMode: z.enum(["disable", "require", "verify-full"]).default("require"),
    username: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.connectionMode === "string" &&
      value.connectionString?.trim() &&
      !value.connectionString.includes("://")
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Use uma connection string valida (ex: postgresql://...).",
        path: ["connectionString"],
      });
    }

    if (value.connectionMode === "fields") {
      if (!value.host?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Informe o host.",
          path: ["host"],
        });
      }
      if (!value.database?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Informe o banco.",
          path: ["database"],
        });
      }
      if (!value.port) {
        ctx.addIssue({
          code: "custom",
          message: "Informe a porta.",
          path: ["port"],
        });
      }
      if (value.authMode === "userpass" && !value.username?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Informe o usuario.",
          path: ["username"],
        });
      }
    }
  });

const PrismaSchemaSourceConfigSchema = z
  .object({
    kind: z.literal("prisma-schema"),
    inputMode: z.enum(["paste", "upload"]).default("paste"),
    schemaText: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.inputMode === "paste" && !value.schemaText?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Cole o conteudo do schema Prisma.",
        path: ["schemaText"],
      });
    }
  });

const OpenApiSourceConfigSchema = z
  .object({
    kind: z.literal("openapi"),
    inputMode: z.enum(["url", "upload", "paste"]).default("url"),
    url: z.string().url().optional(),
    specText: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.inputMode === "url" && !value.url?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Informe a URL da especificacao OpenAPI.",
        path: ["url"],
      });
    }

    if (value.inputMode === "paste" && !value.specText?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Cole a especificacao OpenAPI.",
        path: ["specText"],
      });
    }

    if (
      value.inputMode === "paste" &&
      value.specText?.trim()
    ) {
      const parsed = parseOpenApiDocument(value.specText);
      if (parsed.ok) {
        return;
      }
      ctx.addIssue({
        code: "custom",
        message: `A especificacao OpenAPI e invalida: ${parsed.error}`,
        path: ["specText"],
      });
    }
  });

const GraphQlSourceConfigSchema = z
  .object({
    kind: z.literal("graphql"),
    endpointUrl: z.string().url().optional(),
    schemaText: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.endpointUrl?.trim() && !value.schemaText?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Informe endpoint ou cole o schema GraphQL.",
        path: ["endpointUrl"],
      });
    }

    if (value.schemaText?.trim()) {
      const parsed = parseGraphQlSchema(value.schemaText);
      if (parsed.ok) {
        return;
      }
      ctx.addIssue({
        code: "custom",
        message: `O schema GraphQL parece invalido: ${parsed.error}`,
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
    text: z.string().optional(),
    delimiter: z.enum([",", ";", "\t"]).optional(),
    hasHeader: z.boolean().optional(),
    previewRows: z.number().int().min(1).max(20).optional(),
    mapping: SourceFieldMappingSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.inputMode === "paste" && !value.text?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Cole o conteudo da fonte selecionada.",
        path: ["text"],
      });
    }

    if (value.kind === "json" && value.text?.trim() && !tryParseJson(value.text)) {
      ctx.addIssue({
        code: "custom",
        message: "JSON invalido.",
        path: ["text"],
      });
    }

    if (value.kind === "csv" && value.text?.trim()) {
      const headers = parseCsvHeaders(value.text, value.delimiter ?? ",");
      if (headers.length < 2) {
        ctx.addIssue({
          code: "custom",
          message: "CSV invalido: inclua pelo menos duas colunas no cabecalho.",
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
          ctx.addIssue({
            code: "custom",
            message: `Campo mapeado nao encontrado no preview: ${mappedField}.`,
            path: ["mapping", mappingKey],
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

export type StartStrategyRecommendation = {
  strategy: StartStrategy;
  reason: string;
};

export type ConnectorCapability =
  | "full_import"
  | "configurable_import"
  | "preview_only"
  | "configure_later";

export type SourceConfigPreview = {
  status: "ready" | "warning";
  message: string;
  recognizedAs?: string;
  details?: string[];
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
    ctx.addIssue({
      code: "custom",
      message: "Configure a fonte para continuar com importacao.",
      path: ["sourceConfig"],
    });
    return;
  }

  if (!value.sourceConfig) {
    return;
  }

  if (!value.startSource) {
    ctx.addIssue({
      code: "custom",
      message: "Defina uma fonte para configurar.",
      path: ["startSource"],
    });
    return;
  }

  if (value.sourceConfig.kind !== value.startSource) {
    ctx.addIssue({
      code: "custom",
      message: "A configuracao da fonte nao corresponde a fonte selecionada.",
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
        ctx.addIssue({
          code: "custom",
          path: ["templatePreset"],
          message: "Selecione um modelo inicial.",
        });
      }
      if (value.startSource) {
        ctx.addIssue({
          code: "custom",
          path: ["startSource"],
          message: "Template nao usa fonte de importacao.",
        });
      }
      if (value.sourceConfig) {
        ctx.addIssue({
          code: "custom",
          path: ["sourceConfig"],
          message: "Template nao exige configuracao de fonte.",
        });
      }
    }

    if (value.startStrategy === "manual") {
      if (value.startSource) {
        ctx.addIssue({
          code: "custom",
          path: ["startSource"],
          message: "Criacao manual nao exige fonte inicial.",
        });
      }
      if (value.templatePreset) {
        ctx.addIssue({
          code: "custom",
          path: ["templatePreset"],
          message: "Criacao manual nao usa template preset.",
        });
      }
      if (value.sourceConfig) {
        ctx.addIssue({
          code: "custom",
          path: ["sourceConfig"],
          message: "Criacao manual nao exige configuracao de fonte.",
        });
      }
    }

    if (
      (value.startStrategy === "import" || value.startStrategy === "hybrid") &&
      !value.startSource
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["startSource"],
        message: "Selecione uma fonte para a estrategia escolhida.",
      });
    }

    if (value.startStrategy === "import" && value.templatePreset) {
      ctx.addIssue({
        code: "custom",
        path: ["templatePreset"],
        message: "Importacao pura nao deve usar template preset.",
      });
    }

    if (
      value.startSource &&
      !isStartSourceAllowedForProfile(value.profile, value.startSource)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["startSource"],
        message: "A fonte selecionada nao e compativel com o perfil.",
      });
    }

    validateSourceConfigRequirements(value, ctx);

    if (getViewCompatibilityRank(value.profile, value.initialView) === "incompatible") {
      ctx.addIssue({
        code: "custom",
        path: ["initialView"],
        message: "A visao inicial selecionada e incompativel com o perfil.",
      });
    }

    if (
      !isLayoutAllowedForViewInternal(
        value.initialView,
        value.layout,
        value.profile,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["layout"],
        message: "Layout indisponivel para a visao inicial selecionada.",
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
      reason:
        "Projeto existente com origem anterior: manter importacao configurada e complementar manualmente.",
    };
  }

  switch (input.profile) {
    case "data-model":
      if (available.has("prisma-schema") || hasFullImportConnector) {
        return {
          strategy: "import",
          reason:
            "Modelo de dados fica mais consistente quando nasce de schema/importacao estrutural.",
        };
      }
      if (hasConfigurableImportConnector) {
        return {
          strategy: "import",
          reason:
            "Existe conector configuravel para dados relacionais, recomendado iniciar por importacao configurada.",
        };
      }
      if (hasPreviewOnlyConnector) {
        return {
          strategy: "hybrid",
          reason:
            "Ha fonte com preview assistido, combine reconhecimento inicial com edicao manual.",
        };
      }
      return {
        strategy: "template",
        reason:
          "Sem conector ativo de dados: use preset ERD e conecte a fonte depois.",
      };
    case "system-architecture":
      if (hasFullImportConnector || hasConfigurableImportConnector) {
        return {
          strategy: "import",
          reason:
            "Arquitetura ganha aceleracao quando nasce de uma fonte tecnica configurada.",
        };
      }
      if (hasPreviewOnlyConnector || available.has("openapi") || available.has("graphql")) {
        return {
          strategy: "hybrid",
          reason:
            "Com preview assistido de APIs, comece por reconhecimento preliminar e refine manualmente.",
        };
      }
      return {
        strategy: "template",
        reason:
          "Sem especificacao pronta para importacao, o preset inicial reduz retrabalho.",
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
          reason:
            hasConfigurableImportConnector
              ? "Estruturas de informacao ficam mais fieis quando partem de fonte configuravel."
              : "Fonte tabular com preview assistido funciona melhor em modo hibrido.",
        };
      }
      return {
        strategy: "template",
        reason:
          "Sem fonte tabular pronta, o modelo inicial acelera a configuracao.",
      };
    case "process":
      return {
        strategy: "template",
        reason:
          "Fluxos de processo ficam mais claros com um preset inicial e ajustes guiados.",
      };
    case "mixed":
      if (hasFullImportConnector || hasConfigurableImportConnector) {
        return {
          strategy: "hybrid",
          reason:
            "Cenario misto pede combinacao de importacao parcial com edicao manual orientada.",
        };
      }
      if (hasPreviewOnlyConnector) {
        return {
          strategy: "manual",
          reason:
            "As fontes disponiveis oferecem apenas preview assistido; comece manualmente e conecte depois.",
        };
      }
      return {
        strategy: "manual",
        reason:
          "Sem conectores ativos, comece no canvas livre e conecte fontes depois.",
      };
    case "blank":
    default:
      return {
        strategy: "manual",
        reason:
          "Perfil em branco prioriza exploracao inicial antes de decidir origem externa.",
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
      warning: null as string | null,
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
      warning: null as string | null,
    };
  }

  return {
    layout: autoFallback,
    normalized: true,
    warning: "Layout legado incompativel normalizado para Automatico.",
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

  return validateStrictByRecipeFromRegistry(input.draft).blockingIssues;
}

export function resolveDiagramTypeForInitialView(initialView: InitialView) {
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

export function resolveInitialViewFromDiagramType(
  diagramType: string | undefined,
): InitialView {
  if (diagramType === "tree") {
    return "hierarchy";
  }
  if (diagramType === "flow" || diagramType === "flowchart") {
    return "flow";
  }
  if (diagramType === "mindmap") {
    return "mindmap";
  }
  if (diagramType === "erd") {
    return "erd";
  }
  if (diagramType === "sitemap") {
    return "sitemap";
  }
  if (diagramType === "timeline") {
    return "timeline";
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
        message: "Cole o schema Prisma para verificacao inicial/importacao.",
      };
    }
    const modelCount = (text.match(/\bmodel\s+[A-Za-z_]/g) ?? []).length;
    return {
      status: "ready",
      message:
        modelCount > 0
          ? `Reconhecimento preliminar: ${modelCount} modelos identificados.`
          : "Schema preenchido; execute verificacao inicial para confirmar entidades.",
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
        message: sourceConfig.connectionString?.trim()
          ? "Connection string informada. Conexao real pode ser feita depois."
          : "Preencha a connection string para habilitar verificacao inicial local.",
      };
    }
    const ready = Boolean(
      sourceConfig.host?.trim() &&
        sourceConfig.database?.trim() &&
        sourceConfig.port,
    );
    return {
      status: ready ? "ready" : "warning",
      message: ready
        ? "Campos basicos de conexao preenchidos."
        : "Complete host, porta e banco para continuar.",
    };
  }

  if (sourceConfig.kind === "openapi") {
    if (sourceConfig.inputMode === "url") {
      return {
        status: sourceConfig.url?.trim() ? "ready" : "warning",
        message: sourceConfig.url?.trim()
          ? "URL da especificacao informada."
          : "Informe uma URL OpenAPI para verificacao inicial.",
        recognizedAs: "openapi-url",
      };
    }

    const specText = sourceConfig.specText?.trim() ?? "";
    if (!specText) {
      return {
        status: "warning",
        message: "Cole a especificacao OpenAPI para preview assistido.",
      };
    }

    const parsed = parseOpenApiDocument(specText);
    if (!parsed.ok) {
      return {
        status: "warning",
        message: `Falha no reconhecimento preliminar OpenAPI: ${parsed.error}`,
        recognizedAs: "openapi",
      };
    }

    return {
      status: "ready",
      message: `Reconhecimento preliminar OpenAPI concluido (${parsed.version}, ${parsed.pathCount} rotas).`,
      recognizedAs: "openapi",
      details: [
        `Formato: ${parsed.format.toUpperCase()}`,
        ...(parsed.title ? [`Titulo: ${parsed.title}`] : []),
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
        message: parsed.ok
          ? `Reconhecimento preliminar GraphQL concluido (${parsed.typeCount} tipos).`
          : `Falha no reconhecimento preliminar GraphQL: ${parsed.error}`,
        ...(parsed.ok ? { recognizedAs: `graphql-${parsed.source}` } : {}),
        ...(parsed.ok
          ? {
              details: [
                parsed.source === "sdl"
                  ? "Fonte: SDL"
                  : "Fonte: introspection JSON",
              ],
            }
          : {}),
      };
    }

    return {
      status: sourceConfig.endpointUrl?.trim() ? "ready" : "warning",
      message: sourceConfig.endpointUrl?.trim()
        ? "Endpoint GraphQL informado."
        : "Informe endpoint ou schema para verificacao inicial.",
      recognizedAs: "graphql-endpoint",
    };
  }

  if (sourceConfig.kind === "csv") {
    const text = sourceConfig.text?.trim() ?? "";
    if (!text) {
      return {
        status: "warning",
        message: "Cole o CSV para preview assistido.",
      };
    }

    const previewRows = sourceConfig.previewRows ?? 5;
    const delimiter = sourceConfig.delimiter ?? ",";
    const preview = buildCsvSample(text, delimiter, previewRows);
    return {
      status: preview.fields.length > 0 ? "ready" : "warning",
      message:
        preview.fields.length > 0
          ? `Reconhecimento preliminar: ${preview.fields.length} colunas encontradas.`
          : "Nao foi possivel reconhecer o cabecalho CSV no preview assistido.",
      fields: preview.fields,
      sample: preview.sample,
    };
  }

  if (sourceConfig.kind === "json") {
    const text = sourceConfig.text?.trim() ?? "";
    if (!text) {
      return {
        status: "warning",
        message: "Cole o JSON para preview assistido.",
      };
    }

    const parsed = tryParseJson(text);
    if (!parsed) {
      return {
        status: "warning",
        message: "JSON invalido.",
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
      message: "JSON reconhecido no preview assistido para configuracao inicial.",
      fields,
      sample,
    };
  }

  if (sourceConfig.kind === "spreadsheet") {
    return {
      status: sourceConfig.text?.trim() ? "ready" : "warning",
      message: sourceConfig.text?.trim()
        ? "Dados de planilha recebidos para mapeamento inicial."
        : "Cole os dados exportados da planilha para preview assistido.",
    };
  }

  const genericText =
    "text" in sourceConfig && typeof sourceConfig.text === "string"
      ? sourceConfig.text
      : "";

  return {
    status: genericText.trim() ? "ready" : "warning",
    message: genericText.trim()
      ? "Fonte configurada para conexao/importacao posterior."
      : "Adicione o conteudo da fonte ou use conectar depois.",
  };
}

const sourceStatusLabels: Record<SourceStatus, string> = {
  not_configured: "Fonte nao configurada",
  configured: "Configurada para importacao",
  precheck_ok: "Pre-verificacao OK",
  ready_to_attempt_import: "Pronta para tentar importar",
  imported: "Importada com sucesso",
  failed: "Falha na configuracao da fonte",
};

function redactSourceErrorText(errorText?: string | null) {
  if (!errorText?.trim()) {
    return undefined;
  }

  return redactSensitiveText(errorText);
}

function toPrecheckResult(preview: SourceConfigPreview): SourcePrecheckResult {
  return {
    level: preview.status === "ready" ? "ok" : "warning",
    summary: preview.message,
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
        summary: "Verificacao inicial falhou.",
        details: [input.markAsFailed],
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
        summary: "Importacao inicial executada.",
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

export function getSourceStatusLabel(sourceStatus: SourceStatus) {
  return sourceStatusLabels[sourceStatus];
}

export function getSourceStatusPresentation(sourceStatus: SourceStatus) {
  return {
    statusCode: sourceStatus,
    statusLabel: getSourceStatusLabel(sourceStatus),
  };
}

export function getSourceStatusSummary(input: {
  sourceStatus?: SourceStatus;
  precheckResult?: SourcePrecheckResult;
  sourceSelected?: boolean;
}) {
  if (!input.sourceSelected) {
    return "Fonte nao selecionada.";
  }

  if (!input.sourceStatus) {
    return "Fonte selecionada.";
  }

  const base = getSourceStatusLabel(input.sourceStatus);
  if (!input.precheckResult) {
    return base;
  }

  return `${base} (${input.precheckResult.summary})`;
}

const projectProfileLabels: Record<ProjectProfile, string> = {
  blank: "em branco",
  "information-structure": "estrutura da informacao",
  process: "processo",
  "data-model": "modelo de dados",
  "system-architecture": "arquitetura do sistema",
  "documents-governance": "documentos e governanca",
  mixed: "misto",
};

const startStrategyLabels: Record<StartStrategy, string> = {
  manual: "Criar manualmente",
  import: "Importar do sistema",
  template: "Usar modelo inicial",
  hybrid: "Combinar importacao e edicao manual",
};

const startSourceLabels: Record<StartSource, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  sqlserver: "SQL Server",
  "prisma-schema": "Prisma schema",
  "sql-file": "Arquivo SQL",
  "relational-json": "JSON relacional",
  openapi: "OpenAPI",
  graphql: "GraphQL",
  "code-routes": "Rotas de codigo",
  "folder-structure": "Estrutura de pastas",
  events: "Eventos",
  "yaml-json": "YAML/JSON",
  csv: "CSV",
  json: "JSON",
  spreadsheet: "Planilha",
  "cms-export": "Exportacao de CMS",
  "existing-map": "Mapa existente",
  "document-repository": "Repositorio de documentos",
  "custom-import": "Importacao personalizada",
};

const templatePresetLabels: Record<TemplatePreset, string> = {
  "erd-basic": "ERD basico",
  "process-basic": "Processo basico",
  "sitemap-basic": "Sitemap basico",
  "architecture-basic": "Arquitetura basica",
  "blank-canvas": "Canvas em branco",
};

const initialViewLabels: Record<InitialView, string> = {
  free: "Livre",
  hierarchy: "Hierarquia",
  flow: "Fluxo",
  graph: "Grafo",
  erd: "ERD",
  sitemap: "Sitemap",
  timeline: "Timeline",
  mindmap: "Mapa mental",
};

const layoutChoiceLabels: Record<LayoutChoice, string> = {
  auto: "Automatico",
  vertical: "Vertical",
  horizontal: "Horizontal",
  radial: "Radial",
  relational: "Relacional",
  free: "Livre",
};

const detailLevelLabels: Record<DetailLevel, string> = {
  essential: "Essencial",
  intermediate: "Intermediario",
  detailed: "Detalhado",
};

export const automationHumanLabels: Record<
  keyof AutomationToggles,
  { label: string; help: string }
> = DEFAULT_AUTOMATION_COPY;

export function getProjectProfileLabel(profile: ProjectProfile) {
  return projectProfileLabels[profile];
}

export function getStartStrategyLabel(strategy: StartStrategy) {
  return startStrategyLabels[strategy];
}

export function getStartSourceLabel(source: StartSource) {
  return startSourceLabels[source];
}

export function getTemplatePresetLabel(templatePreset: TemplatePreset) {
  return templatePresetLabels[templatePreset];
}

export function getInitialViewLabel(view: InitialView) {
  return initialViewLabels[view];
}

export function getLayoutChoiceLabel(layout: LayoutChoice) {
  return layoutChoiceLabels[layout];
}

export function getDetailLevelLabel(detailLevel: DetailLevel) {
  return detailLevelLabels[detailLevel];
}

export function buildWhatWillBeCreatedSummary(input: {
  profile: ProjectProfile;
  initialView: InitialView;
  layout: LayoutChoice;
  automation: AutomationToggles;
  sourceStatus?: SourceStatus;
}) {
  const profileLabel = getProjectProfileLabel(input.profile);
  const viewLabel = getInitialViewLabel(input.initialView);
  const layoutLabel = getLayoutChoiceLabel(input.layout).toLowerCase();
  const semanticValidationEnabled = input.automation.detectInconsistenciesEarly;

  const sourceStatusSummary = input.sourceStatus
    ? ` Estado da fonte: ${getSourceStatusLabel(input.sourceStatus).toLowerCase()}.`
    : "";

  return `Sera criado um projeto de ${profileLabel} com visao inicial ${viewLabel}, layout ${layoutLabel} e validacao semantica ${semanticValidationEnabled ? "ativada" : "desativada"}.${sourceStatusSummary}`;
}
