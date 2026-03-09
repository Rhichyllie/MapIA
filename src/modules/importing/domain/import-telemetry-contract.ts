import {
  IMPORT_TELEMETRY_CODES,
  type ImportTelemetryCode,
} from "./import-telemetry-codes";

export const IMPORT_TELEMETRY_EVENT_NAMES = {
  FINALIZE_SUMMARY: "import.finalize.summary",
  INPUT_ACCEPTED: "import.input.accepted",
  PARSE_START: "import.parse.start",
  PARSE_END: "import.parse.end",
  EXTERNALREFS_MAP_START: "import.externalRefs.map.start",
  EXTERNALREFS_MAP_STATS: "import.externalRefs.map.stats",
  PROVENANCE_WARNING_NODE_MISS: "import.provenance.warning.node-miss",
  PROVENANCE_WARNING_EDGE_MISS: "import.provenance.warning.edge-miss",
  VALIDATE_SCHEMA_START: "import.validate.schema.start",
  VALIDATE_SCHEMA_END: "import.validate.schema.end",
  VALIDATE_INVARIANTS_START: "import.validate.invariants.start",
  VALIDATE_INVARIANTS_END: "import.validate.invariants.end",
  NORMALIZE_START: "import.normalize.start",
  NORMALIZE_END: "import.normalize.end",
  REPARSE_START: "import.reparse.start",
  REPARSE_END: "import.reparse.end",
  REVALIDATE_START: "import.revalidate.start",
  REVALIDATE_END: "import.revalidate.end",
  PIPELINE_FAILED: "import.pipeline.failed",
} as const;

export type ImportTelemetryEventName =
  (typeof IMPORT_TELEMETRY_EVENT_NAMES)[keyof typeof IMPORT_TELEMETRY_EVENT_NAMES];

export const IMPORT_TELEMETRY_STEP_NAMES = {
  FINALIZE_SUMMARY: "finalize.summary",
  PARSE_PRISMA_SCHEMA_MODELS: "parse.prisma-schema-models",
  EXTERNALREFS_MAP_ELEMENTS: "externalRefs.map-elements",
  VALIDATE_GRAPH_SNAPSHOT_SCHEMA_INITIAL: "validate.graph-snapshot-schema.initial",
  VALIDATE_GRAPH_INVARIANTS_INITIAL: "validate.graph-invariants.initial",
  NORMALIZE_IMPORTED_SNAPSHOT_CANONICAL: "normalize.imported-snapshot-canonical",
  REPARSE_GRAPH_SNAPSHOT_SCHEMA_AFTER_NORMALIZE:
    "reparse.graph-snapshot-schema.after-normalize",
  VALIDATE_GRAPH_INVARIANTS_AFTER_NORMALIZE:
    "validate.graph-invariants.after-normalize",
} as const;

export type ImportTelemetryStepName =
  (typeof IMPORT_TELEMETRY_STEP_NAMES)[keyof typeof IMPORT_TELEMETRY_STEP_NAMES];

type ImportTelemetryCatalogPhase =
  | "input"
  | "parse"
  | "validate"
  | "externalRefs"
  | "provenance"
  | "normalize"
  | "reparse"
  | "finalize";

type ImportTelemetryCatalogSeverity = "debug" | "info" | "warn" | "error";

export type ImportTelemetryEventContractMeta = {
  eventName: ImportTelemetryEventName;
  code: ImportTelemetryCode;
  possibleCodes?: readonly ImportTelemetryCode[];
  phase: ImportTelemetryCatalogPhase;
  defaultSeverity: ImportTelemetryCatalogSeverity;
  description: string;
};

export const IMPORT_TELEMETRY_EVENT_CONTRACT = {
  FINALIZE_SUMMARY: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.FINALIZE_SUMMARY,
    code: IMPORT_TELEMETRY_CODES.FINALIZE_SUMMARY,
    phase: "finalize",
    defaultSeverity: "info",
    description: "Resumo consolidado da importacao foi emitido.",
  },
  INPUT_ACCEPTED: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.INPUT_ACCEPTED,
    code: IMPORT_TELEMETRY_CODES.INPUT_ACCEPTED,
    phase: "input",
    defaultSeverity: "info",
    description: "Entrada de importacao aceita e origem identificada.",
  },
  PARSE_START: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.PARSE_START,
    code: IMPORT_TELEMETRY_CODES.PARSE_START,
    phase: "parse",
    defaultSeverity: "debug",
    description: "Inicio do parse de models Prisma.",
  },
  PARSE_END: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.PARSE_END,
    code: IMPORT_TELEMETRY_CODES.PARSE_OK,
    possibleCodes: [IMPORT_TELEMETRY_CODES.PARSE_OK, IMPORT_TELEMETRY_CODES.PARSE_FAILED],
    phase: "parse",
    defaultSeverity: "info",
    description: "Fim do parse (sucesso ou falha) de models Prisma.",
  },
  EXTERNALREFS_MAP_START: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.EXTERNALREFS_MAP_START,
    code: IMPORT_TELEMETRY_CODES.EXTERNALREFS_MAP_START,
    phase: "externalRefs",
    defaultSeverity: "debug",
    description: "Inicio do mapeamento de elementos/import provenance.",
  },
  EXTERNALREFS_MAP_STATS: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.EXTERNALREFS_MAP_STATS,
    code: IMPORT_TELEMETRY_CODES.EXTERNALREFS_MAP_STATS,
    phase: "externalRefs",
    defaultSeverity: "info",
    description: "Estatisticas finais do mapeamento de elementos/ExternalRefs.",
  },
  PROVENANCE_WARNING_NODE_MISS: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.PROVENANCE_WARNING_NODE_MISS,
    code: IMPORT_TELEMETRY_CODES.PROVENANCE_NODE_MISS,
    phase: "provenance",
    defaultSeverity: "warn",
    description: "Fallback de provenance em nodes sem match.",
  },
  PROVENANCE_WARNING_EDGE_MISS: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.PROVENANCE_WARNING_EDGE_MISS,
    code: IMPORT_TELEMETRY_CODES.PROVENANCE_EDGE_MISS,
    phase: "provenance",
    defaultSeverity: "warn",
    description: "Fallback de provenance em edges sem match.",
  },
  VALIDATE_SCHEMA_START: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.VALIDATE_SCHEMA_START,
    code: IMPORT_TELEMETRY_CODES.VALIDATE_PARSE_START,
    phase: "validate",
    defaultSeverity: "debug",
    description: "Inicio da validacao estrutural via GraphSnapshotSchema.",
  },
  VALIDATE_SCHEMA_END: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.VALIDATE_SCHEMA_END,
    code: IMPORT_TELEMETRY_CODES.VALIDATE_PARSE_OK,
    possibleCodes: [
      IMPORT_TELEMETRY_CODES.VALIDATE_PARSE_OK,
      IMPORT_TELEMETRY_CODES.PIPELINE_FAILED,
    ],
    phase: "validate",
    defaultSeverity: "info",
    description: "Fim da validacao estrutural inicial (sucesso ou falha).",
  },
  VALIDATE_INVARIANTS_START: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.VALIDATE_INVARIANTS_START,
    code: IMPORT_TELEMETRY_CODES.VALIDATE_INVARIANTS_START,
    phase: "validate",
    defaultSeverity: "debug",
    description: "Inicio da validacao de invariantes do grafo.",
  },
  VALIDATE_INVARIANTS_END: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.VALIDATE_INVARIANTS_END,
    code: IMPORT_TELEMETRY_CODES.VALIDATE_INVARIANTS_OK,
    possibleCodes: [
      IMPORT_TELEMETRY_CODES.VALIDATE_INVARIANTS_OK,
      IMPORT_TELEMETRY_CODES.PIPELINE_FAILED,
    ],
    phase: "validate",
    defaultSeverity: "info",
    description: "Fim da validacao de invariantes (sucesso ou falha).",
  },
  NORMALIZE_START: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.NORMALIZE_START,
    code: IMPORT_TELEMETRY_CODES.NORMALIZE_START,
    phase: "normalize",
    defaultSeverity: "debug",
    description: "Inicio da normalizacao canonica do snapshot importado.",
  },
  NORMALIZE_END: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.NORMALIZE_END,
    code: IMPORT_TELEMETRY_CODES.NORMALIZE_OK,
    possibleCodes: [IMPORT_TELEMETRY_CODES.NORMALIZE_OK, IMPORT_TELEMETRY_CODES.PIPELINE_FAILED],
    phase: "normalize",
    defaultSeverity: "info",
    description: "Fim da normalizacao canonica (sucesso ou falha).",
  },
  REPARSE_START: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.REPARSE_START,
    code: IMPORT_TELEMETRY_CODES.REPARSE_START,
    phase: "reparse",
    defaultSeverity: "debug",
    description: "Inicio do re-parse estrutural apos normalizacao.",
  },
  REPARSE_END: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.REPARSE_END,
    code: IMPORT_TELEMETRY_CODES.REPARSE_OK,
    possibleCodes: [IMPORT_TELEMETRY_CODES.REPARSE_OK, IMPORT_TELEMETRY_CODES.PIPELINE_FAILED],
    phase: "reparse",
    defaultSeverity: "info",
    description: "Fim do re-parse estrutural (sucesso ou falha).",
  },
  REVALIDATE_START: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.REVALIDATE_START,
    code: IMPORT_TELEMETRY_CODES.REVALIDATE_START,
    phase: "validate",
    defaultSeverity: "debug",
    description: "Inicio da revalidacao de invariantes apos normalizacao.",
  },
  REVALIDATE_END: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.REVALIDATE_END,
    code: IMPORT_TELEMETRY_CODES.REVALIDATE_OK,
    possibleCodes: [
      IMPORT_TELEMETRY_CODES.REVALIDATE_OK,
      IMPORT_TELEMETRY_CODES.PIPELINE_FAILED,
    ],
    phase: "validate",
    defaultSeverity: "info",
    description: "Fim da revalidacao de invariantes (sucesso ou falha).",
  },
  PIPELINE_FAILED: {
    eventName: IMPORT_TELEMETRY_EVENT_NAMES.PIPELINE_FAILED,
    code: IMPORT_TELEMETRY_CODES.PIPELINE_FAILED,
    phase: "finalize",
    defaultSeverity: "error",
    description: "Falha global do pipeline de importacao.",
  },
} as const satisfies Record<string, ImportTelemetryEventContractMeta>;
