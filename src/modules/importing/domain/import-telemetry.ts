import { deterministicUuidFromParts } from "./external-refs";
import type {
  ImportTelemetryEventName,
  ImportTelemetryStepName,
} from "./import-telemetry-contract";
import type { ImportTelemetryCode } from "./import-telemetry-codes";

export const IMPORT_TELEMETRY_NAMESPACE = "importing.telemetry.v1" as const;

export type ImportTelemetryPrimitive = string | number | boolean | null;
export type ImportTelemetryValue =
  | ImportTelemetryPrimitive
  | ImportTelemetryValue[]
  | { [key: string]: ImportTelemetryValue };
export type ImportTelemetryAttributes = Record<string, ImportTelemetryValue>;

export type ImportTelemetrySeverity = "debug" | "info" | "warn" | "error";
export type ImportTelemetryOutcome = "success" | "partial" | "failure";
export type ImportTelemetrySourceKind =
  | "prisma-schema-inline"
  | "prisma-schema-file"
  | "postgres-live";
export type ImportTelemetryPhase =
  | "input"
  | "parse"
  | "validate"
  | "externalRefs"
  | "provenance"
  | "normalize"
  | "reparse"
  | "finalize";

export type ImportTelemetryCorrelation = {
  namespace: typeof IMPORT_TELEMETRY_NAMESPACE;
  importRunId: string;
  projectId: string;
  sourceKind: ImportTelemetrySourceKind;
  sourceLabel?: string;
};

export type ImportTelemetryEvent = {
  sequence: number;
  timestampMs?: number;
  eventName: ImportTelemetryEventName;
  phase: ImportTelemetryPhase;
  severity: ImportTelemetrySeverity;
  code: ImportTelemetryCode;
  message: string;
  attributes: ImportTelemetryAttributes;
  correlation: ImportTelemetryCorrelation;
  durationMs?: number;
  outcome?: ImportTelemetryOutcome;
};

export type ImportTelemetryStepStatus = "success" | "partial" | "failure";

export type ImportTelemetryStep = {
  sequence: number;
  startedSequence: number;
  endedSequence: number;
  stepName: ImportTelemetryStepName;
  phase: ImportTelemetryPhase;
  status: ImportTelemetryStepStatus;
  startedAtMs?: number;
  endedAtMs?: number;
  durationMs?: number;
  attributes: ImportTelemetryAttributes;
  correlation: ImportTelemetryCorrelation;
  error?: {
    name: string;
    message: string;
    code?: string;
  };
};

export type ImportTelemetryPhaseSummary = {
  phase: ImportTelemetryPhase;
  stepName: ImportTelemetryStepName;
  status: ImportTelemetryStepStatus;
  durationMs?: number;
};

export type ImportTelemetrySummary = {
  namespace: typeof IMPORT_TELEMETRY_NAMESPACE;
  correlation: ImportTelemetryCorrelation;
  outcome: ImportTelemetryOutcome;
  counts: {
    nodesGenerated: number;
    edgesGenerated: number;
    scalarFieldsGenerated: number;
    relationCandidates: number;
    relationsDeduplicated: number;
    externalRefsGenerated: {
      nodes: number;
      edges: number;
      total: number;
    };
    provenanceFallbacks: {
      nodeMiss: number;
      edgeMiss: number;
    };
    warningsByCategory: Record<string, number>;
  };
  phases: ImportTelemetryPhaseSummary[];
  flags: {
    normalizationApplied: boolean;
    revalidatedAfterNormalize: boolean;
    hasPartialProvenance: boolean;
  };
  source: {
    sourceKind: ImportTelemetrySourceKind;
    sourceLabel?: string;
    hasExternalRefContext: boolean;
    metadata: ImportTelemetryAttributes;
  };
};

export interface ImportTelemetryCollector {
  recordEvent(event: ImportTelemetryEvent): void;
  recordStep(step: ImportTelemetryStep): void;
  recordSummary(summary: ImportTelemetrySummary): void;
}

export class NoopImportTelemetryCollector implements ImportTelemetryCollector {
  recordEvent(): void {}

  recordStep(): void {}

  recordSummary(): void {}
}

type BufferedImportTelemetrySnapshot = {
  events: ImportTelemetryEvent[];
  steps: ImportTelemetryStep[];
  summary?: ImportTelemetrySummary;
};

function cloneTelemetryValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class BufferedImportTelemetryCollector implements ImportTelemetryCollector {
  private readonly events: ImportTelemetryEvent[] = [];
  private readonly steps: ImportTelemetryStep[] = [];
  private summary?: ImportTelemetrySummary;

  recordEvent(event: ImportTelemetryEvent): void {
    this.events.push(cloneTelemetryValue(event));
  }

  recordStep(step: ImportTelemetryStep): void {
    this.steps.push(cloneTelemetryValue(step));
  }

  recordSummary(summary: ImportTelemetrySummary): void {
    this.summary = cloneTelemetryValue(summary);
  }

  snapshot(): BufferedImportTelemetrySnapshot {
    return {
      events: cloneTelemetryValue(this.events),
      steps: cloneTelemetryValue(this.steps),
      summary: this.summary ? cloneTelemetryValue(this.summary) : undefined,
    };
  }

  reset(): void {
    this.events.length = 0;
    this.steps.length = 0;
    this.summary = undefined;
  }
}

export type ImportTelemetryClock = {
  nowMs(): number;
};

export type CreateImportTelemetrySessionInput = {
  collector?: ImportTelemetryCollector;
  correlation: {
    projectId: string;
    sourceKind: ImportTelemetrySourceKind;
    sourceLabel?: string;
    importRunId?: string;
  };
  clock?: ImportTelemetryClock;
  includeTimestamps?: boolean;
};

type ImportTelemetryEventInput = Omit<
  ImportTelemetryEvent,
  "sequence" | "timestampMs" | "attributes" | "correlation"
> & {
  attributes?: Record<string, unknown>;
};

type ImportTelemetryStepEndInput = {
  status: ImportTelemetryStepStatus;
  attributes?: Record<string, unknown>;
  error?: unknown;
};

type ImportTelemetryStepStartInput = {
  stepName: ImportTelemetryStepName;
  phase: ImportTelemetryPhase;
  attributes?: Record<string, unknown>;
};

type ImportTelemetryStepHandle = {
  end(input: ImportTelemetryStepEndInput): ImportTelemetryStep;
};

type ImportTelemetrySession = {
  readonly correlation: ImportTelemetryCorrelation;
  event(input: ImportTelemetryEventInput): ImportTelemetryEvent;
  startStep(input: ImportTelemetryStepStartInput): ImportTelemetryStepHandle;
  summary(summary: ImportTelemetrySummary): ImportTelemetrySummary;
};

const forbiddenTelemetryAttributeKeys = new Set(["schemaText", "externalRefContext"]);
const TELEMETRY_MAX_DEPTH_EXCEEDED_MARKER = "[MaxDepthExceeded]" as const;
const TELEMETRY_OBJECT_KEYS_TRUNCATED_KEY = "__telemetryTruncatedKeys" as const;
const TELEMETRY_ARRAY_ITEMS_TRUNCATED_MARKER_PREFIX = "[ArrayTruncated:+" as const;
const TELEMETRY_STRING_TRUNCATED_SUFFIX = "...[truncated]" as const;

export const IMPORT_TELEMETRY_SANITIZATION_LIMITS = {
  maxStringLength: 512,
  maxArrayItems: 50,
  maxObjectDepth: 4,
  maxObjectKeys: 50,
} as const;

type SanitizeTelemetryContext = {
  depth: number;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function truncateTelemetryString(value: string): string {
  if (value.length <= IMPORT_TELEMETRY_SANITIZATION_LIMITS.maxStringLength) {
    return value;
  }

  const maxPrefixLength =
    IMPORT_TELEMETRY_SANITIZATION_LIMITS.maxStringLength -
    TELEMETRY_STRING_TRUNCATED_SUFFIX.length;

  if (maxPrefixLength <= 0) {
    return TELEMETRY_STRING_TRUNCATED_SUFFIX.slice(
      0,
      IMPORT_TELEMETRY_SANITIZATION_LIMITS.maxStringLength,
    );
  }

  return `${value.slice(0, maxPrefixLength)}${TELEMETRY_STRING_TRUNCATED_SUFFIX}`;
}

function sanitizeTelemetryValue(
  value: unknown,
  context: SanitizeTelemetryContext,
): ImportTelemetryValue | undefined {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return truncateTelemetryString(value);
  }

  if (typeof value === "bigint") {
    return truncateTelemetryString(value.toString());
  }

  if (context.depth >= IMPORT_TELEMETRY_SANITIZATION_LIMITS.maxObjectDepth) {
    if (Array.isArray(value) || isPlainRecord(value)) {
      return TELEMETRY_MAX_DEPTH_EXCEEDED_MARKER;
    }
  }

  if (Array.isArray(value)) {
    const sourceItemLimit = value.length > IMPORT_TELEMETRY_SANITIZATION_LIMITS.maxArrayItems
      ? Math.max(0, IMPORT_TELEMETRY_SANITIZATION_LIMITS.maxArrayItems - 1)
      : IMPORT_TELEMETRY_SANITIZATION_LIMITS.maxArrayItems;
    const sanitizedItems = value
      .slice(0, sourceItemLimit)
      .map((entry) =>
        sanitizeTelemetryValue(entry, {
          depth: context.depth + 1,
        }),
      )
      .filter((entry): entry is ImportTelemetryValue => typeof entry !== "undefined");

    if (value.length > IMPORT_TELEMETRY_SANITIZATION_LIMITS.maxArrayItems) {
      const omittedCount = value.length - sourceItemLimit;
      sanitizedItems.push(
        `${TELEMETRY_ARRAY_ITEMS_TRUNCATED_MARKER_PREFIX}${omittedCount}]`,
      );
    }

    return sanitizedItems;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (isPlainRecord(value)) {
    const sanitizedEntries: Array<[string, ImportTelemetryValue]> = [];

    for (const [key, entry] of Object.entries(value)) {
      if (forbiddenTelemetryAttributeKeys.has(key)) {
        continue;
      }

      const sanitizedEntry = sanitizeTelemetryValue(entry, {
        depth: context.depth + 1,
      });
      if (typeof sanitizedEntry !== "undefined") {
        sanitizedEntries.push([key, sanitizedEntry]);
      }
    }

    const sanitized: Record<string, ImportTelemetryValue> = {};
    const keyLimit = IMPORT_TELEMETRY_SANITIZATION_LIMITS.maxObjectKeys;

    if (sanitizedEntries.length <= keyLimit) {
      for (const [key, entry] of sanitizedEntries) {
        sanitized[key] = entry;
      }
      return sanitized;
    }

    const keepCount = Math.max(0, keyLimit - 1);
    for (const [key, entry] of sanitizedEntries.slice(0, keepCount)) {
      sanitized[key] = entry;
    }
    sanitized[TELEMETRY_OBJECT_KEYS_TRUNCATED_KEY] =
      sanitizedEntries.length - keepCount;

    return sanitized;
  }

  if (typeof value === "undefined" || typeof value === "function") {
    return undefined;
  }

  return String(value);
}

function sanitizeTelemetryAttributes(
  attributes: Record<string, unknown> | undefined,
): ImportTelemetryAttributes {
  const sanitized = sanitizeTelemetryValue(attributes ?? {}, { depth: 0 });

  if (!sanitized || Array.isArray(sanitized) || typeof sanitized !== "object") {
    return {};
  }

  return sanitized;
}

function sanitizeNumericRecord(record: Record<string, unknown>): Record<string, number> {
  const sanitized = sanitizeTelemetryAttributes(record);
  const numericRecord: Record<string, number> = {};

  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === "number") {
      numericRecord[key] = value;
    }
  }

  return numericRecord;
}

function toTelemetryError(error: unknown): ImportTelemetryStep["error"] {
  if (error instanceof Error) {
    const errorWithCode = error as Error & { code?: unknown };
    const maybeCode =
      typeof errorWithCode.code === "string" ? errorWithCode.code : undefined;

    return {
      name: error.name,
      message: error.message,
      ...(maybeCode ? { code: maybeCode } : {}),
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

function defaultClock(): ImportTelemetryClock {
  return {
    nowMs: () => Date.now(),
  };
}

export function createDeterministicImportRunId(parts: {
  projectId: string;
  sourceKind: ImportTelemetrySourceKind;
  sourceLabel?: string;
  schemaFingerprint?: string;
}) {
  return deterministicUuidFromParts([
    "import-telemetry-run",
    parts.projectId,
    parts.sourceKind,
    parts.sourceLabel ?? "",
    parts.schemaFingerprint ?? "",
  ]);
}

export function createImportTelemetrySession(
  input: CreateImportTelemetrySessionInput,
): ImportTelemetrySession {
  const collector = input.collector ?? new NoopImportTelemetryCollector();
  const clock = input.clock ?? defaultClock();
  const includeTimestamps = input.includeTimestamps ?? false;
  let sequence = 0;

  const correlation: ImportTelemetryCorrelation = {
    namespace: IMPORT_TELEMETRY_NAMESPACE,
    importRunId:
      input.correlation.importRunId ??
      createDeterministicImportRunId({
        projectId: input.correlation.projectId,
        sourceKind: input.correlation.sourceKind,
        sourceLabel: input.correlation.sourceLabel,
      }),
    projectId: input.correlation.projectId,
    sourceKind: input.correlation.sourceKind,
    ...(input.correlation.sourceLabel
      ? { sourceLabel: input.correlation.sourceLabel }
      : {}),
  };

  const nextSequence = () => {
    sequence += 1;
    return sequence;
  };

  const nowMaybe = () => (includeTimestamps ? clock.nowMs() : undefined);

  return {
    correlation,
    event(eventInput: ImportTelemetryEventInput) {
      const timestampMs = nowMaybe();
      const event: ImportTelemetryEvent = {
        sequence: nextSequence(),
        ...(typeof timestampMs === "number" ? { timestampMs } : {}),
        eventName: eventInput.eventName,
        phase: eventInput.phase,
        severity: eventInput.severity,
        code: eventInput.code,
        message: eventInput.message,
        attributes: sanitizeTelemetryAttributes(eventInput.attributes),
        correlation,
        ...(typeof eventInput.durationMs === "number"
          ? { durationMs: eventInput.durationMs }
          : {}),
        ...(eventInput.outcome ? { outcome: eventInput.outcome } : {}),
      };

      collector.recordEvent(event);
      return event;
    },
    startStep(stepInput: ImportTelemetryStepStartInput) {
      const startedSequence = nextSequence();
      const startedAtMs = clock.nowMs();
      const startAttributes = sanitizeTelemetryAttributes(stepInput.attributes);

      return {
        end(endInput: ImportTelemetryStepEndInput) {
          const endedSequence = nextSequence();
          const endedAtMs = clock.nowMs();
          const durationMs = Math.max(0, endedAtMs - startedAtMs);
          const attributes = {
            ...startAttributes,
            ...sanitizeTelemetryAttributes(endInput.attributes),
          };
          const step: ImportTelemetryStep = {
            sequence: endedSequence,
            startedSequence,
            endedSequence,
            stepName: stepInput.stepName,
            phase: stepInput.phase,
            status: endInput.status,
            ...(includeTimestamps ? { startedAtMs, endedAtMs } : {}),
            durationMs,
            attributes,
            correlation,
            ...(endInput.error ? { error: toTelemetryError(endInput.error) } : {}),
          };

          collector.recordStep(step);
          return step;
        },
      };
    },
    summary(summaryInput: ImportTelemetrySummary) {
      const sanitizedSummary: ImportTelemetrySummary = cloneTelemetryValue({
        ...summaryInput,
        namespace: IMPORT_TELEMETRY_NAMESPACE,
        correlation,
        source: {
          sourceKind: summaryInput.source.sourceKind,
          ...(summaryInput.source.sourceLabel
            ? { sourceLabel: summaryInput.source.sourceLabel }
            : {}),
          hasExternalRefContext: summaryInput.source.hasExternalRefContext,
          metadata: sanitizeTelemetryAttributes(summaryInput.source.metadata),
        },
        counts: {
          ...summaryInput.counts,
          warningsByCategory: sanitizeNumericRecord(summaryInput.counts.warningsByCategory),
        },
      });

      collector.recordSummary(sanitizedSummary);
      return sanitizedSummary;
    },
  };
}

export type {
  BufferedImportTelemetrySnapshot,
  ImportTelemetryEventInput,
  ImportTelemetrySession,
  ImportTelemetryStepEndInput,
  ImportTelemetryStepHandle,
  ImportTelemetryStepStartInput,
};
