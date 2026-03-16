import { z } from "zod";
import { InitialViewSchema, LayoutChoiceSchema, ProjectProfileSchema, SourceStatusCodeSchema, StartStrategySchema } from "@/src/modules/creation-assistant/domain";

export const CREATION_TRANSITION_EVENT_NAMES = {
  CREATION_SETTINGS_ALIAS_PUT: "creation_settings_alias_put",
  CREATION_SETTINGS_ALIAS_PAYLOAD_SETTINGS: "creation_settings_alias_payload_settings",
  CREATION_LEGACY_TEMPLATE_FALLBACK: "creation_legacy_template_fallback",
  CREATION_TRANSITION_GATE_WARNING: "creation_transition_gate_warning",
  CREATION_TRANSITION_GATE_EVALUATION_TICK:
    "creation_transition_gate_evaluation_tick",
  CREATION_RECIPE_RUNTIME_FALLBACK: "creation_recipe_runtime_fallback",
  CREATION_RECIPE_RUNTIME_RESOLVED: "creation_recipe_runtime_resolved",
  CREATION_APPLY_ATTEMPTED: "creation_apply_attempted",
  CREATION_APPLY_BLOCKED_STRICT_VALIDATION:
    "creation_apply_blocked_strict_validation",
  CREATION_APPLY_SUCCEEDED: "creation_apply_succeeded",
  CREATION_SOURCE_STATUS_CHANGED: "creation_source_status_changed",
  CREATION_DRAFT_SAVED: "creation_draft_saved",
  CREATION_TRANSITION_SNAPSHOT_ACCESSED: "creation_transition_snapshot_accessed",
  CREATION_TRANSITION_SNAPSHOT_ACCESS_DENIED:
    "creation_transition_snapshot_access_denied",
} as const;

export type CreationTransitionEventName =
  (typeof CREATION_TRANSITION_EVENT_NAMES)[keyof typeof CREATION_TRANSITION_EVENT_NAMES];

const FallbackReasonSchema = z.enum([
  "missing_creation_settings",
  "missing_recipe",
  "invalid_settings",
  "migration_gap",
  "unknown",
  "none",
]);

const FallbackModeSchema = z.enum(["none", "partial", "full"]);
const RiskTierSchema = z.enum(["none", "low", "high"]);

const FieldsFromTemplateSchema = z
  .object({
    profile: z.boolean(),
    initialView: z.boolean(),
    layout: z.boolean(),
    contextDefaults: z.boolean(),
  })
  .strict();

const EffectiveResultSchema = z
  .object({
    profile: ProjectProfileSchema,
    initialView: InitialViewSchema,
    layout: LayoutChoiceSchema,
  })
  .strict();

const GatePayloadSchema = z
  .object({
    code: z.string().min(1).max(120),
    title: z.string().min(1).max(220),
    threshold: z.number().nonnegative(),
    comparator: z.enum(["gt", "gte", "lt", "lte"]),
    currentValue: z.number().nonnegative(),
    windowStart: z.string().datetime(),
    windowEnd: z.string().datetime(),
    breached: z.boolean(),
    breachSeverity: z.enum(["none", "low", "high", "critical"]),
    effectiveFrom: z.string().datetime(),
    owner: z.string().min(1).max(120),
    recommendedAction: z.string().min(1).max(500),
  })
  .strict();

const PayloadSchemaByEventName = {
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_SETTINGS_ALIAS_PUT]: z
    .object({
      route: z.string().min(1).max(180),
      usedSettingsAliasPayload: z.boolean(),
    })
    .strict(),
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_SETTINGS_ALIAS_PAYLOAD_SETTINGS]: z
    .object({
      route: z.string().min(1).max(180),
    })
    .strict(),
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_LEGACY_TEMPLATE_FALLBACK]: z
    .object({
      source: z.string().min(1).max(120),
      fallbackMode: FallbackModeSchema,
      fallbackReason: FallbackReasonSchema,
      dependencyReal: z.boolean(),
      fieldsFromTemplate: FieldsFromTemplateSchema,
      riskTier: RiskTierSchema,
      effectiveResult: EffectiveResultSchema,
    })
    .strict(),
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_GATE_WARNING]: GatePayloadSchema,
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_GATE_EVALUATION_TICK]: z
    .object({
      trigger: z.enum(["auto", "manual"]),
      windowStart: z.string().datetime(),
      windowEnd: z.string().datetime(),
      leaseBucket: z.number().int().nonnegative(),
    })
    .strict(),
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_RECIPE_RUNTIME_FALLBACK]: z
    .object({
      profile: ProjectProfileSchema,
      view: InitialViewSchema,
      recipeId: z.string().min(1).max(120),
      reason: z.enum(["missing_recipe_registry", "unsupported_pair", "unknown"]),
    })
    .strict(),
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_RECIPE_RUNTIME_RESOLVED]: z
    .object({
      profile: ProjectProfileSchema,
      view: InitialViewSchema,
      recipeId: z.string().min(1).max(120),
      fallbackUsed: z.boolean(),
    })
    .strict(),
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_ATTEMPTED]: z
    .object({
      mode: z.enum(["new", "existing"]),
      createInitialMap: z.boolean(),
    })
    .strict(),
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_BLOCKED_STRICT_VALIDATION]: z
    .object({
      profile: ProjectProfileSchema,
      initialView: InitialViewSchema,
      blockingIssueCount: z.number().int().nonnegative(),
      warningCount: z.number().int().nonnegative(),
    })
    .strict(),
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_SUCCEEDED]: z
    .object({
      createInitialMap: z.boolean(),
      appliedVersion: z.number().int().positive(),
      sourceStatus: SourceStatusCodeSchema.optional(),
    })
    .strict(),
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_SOURCE_STATUS_CHANGED]: z
    .object({
      fromStatus: SourceStatusCodeSchema.optional(),
      toStatus: SourceStatusCodeSchema,
      startStrategy: StartStrategySchema,
      startSource: z.string().max(80).optional(),
      phase: z.enum(["draft", "applied"]),
    })
    .strict(),
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_DRAFT_SAVED]: z
    .object({
      route: z.string().min(1).max(180),
      viaAlias: z.boolean(),
      draftVersion: z.number().int().positive(),
    })
    .strict(),
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_SNAPSHOT_ACCESSED]: z
    .object({
      route: z.string().min(1).max(180),
      role: z.enum(["internal"]),
    })
    .strict(),
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_SNAPSHOT_ACCESS_DENIED]: z
    .object({
      route: z.string().min(1).max(180),
      reason: z.enum(["forbidden"]),
    })
    .strict(),
} as const;

export type CreationTransitionPayloadByEventName = {
  [K in keyof typeof PayloadSchemaByEventName]: z.infer<
    (typeof PayloadSchemaByEventName)[K]
  >;
};

export type CreationTelemetryClassification = "operational" | "security" | "audit";
export type CreationTelemetryPiiLevel = "none" | "indirect" | "restricted";
export type CreationTelemetryRetentionClass = "short_30d" | "standard_90d" | "long_365d";
export type CreationTelemetryDedupePolicy =
  | "dedupe_forbidden"
  | "dedupe_allowed"
  | "dedupe_alerts_only";

export type CreationTransitionEventContract = {
  eventName: CreationTransitionEventName;
  eventVersion: number;
  classification: CreationTelemetryClassification;
  piiLevel: CreationTelemetryPiiLevel;
  retentionClass: CreationTelemetryRetentionClass;
  dedupePolicy: CreationTelemetryDedupePolicy;
  payloadSchema: z.ZodTypeAny;
};

export const CREATION_TRANSITION_EVENT_CONTRACT: Record<
  CreationTransitionEventName,
  CreationTransitionEventContract
> = {
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_SETTINGS_ALIAS_PUT]: {
    eventName: CREATION_TRANSITION_EVENT_NAMES.CREATION_SETTINGS_ALIAS_PUT,
    eventVersion: 1,
    classification: "operational",
    piiLevel: "indirect",
    retentionClass: "standard_90d",
    dedupePolicy: "dedupe_forbidden",
    payloadSchema:
      PayloadSchemaByEventName[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_SETTINGS_ALIAS_PUT
      ],
  },
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_SETTINGS_ALIAS_PAYLOAD_SETTINGS]: {
    eventName:
      CREATION_TRANSITION_EVENT_NAMES.CREATION_SETTINGS_ALIAS_PAYLOAD_SETTINGS,
    eventVersion: 1,
    classification: "operational",
    piiLevel: "indirect",
    retentionClass: "standard_90d",
    dedupePolicy: "dedupe_forbidden",
    payloadSchema:
      PayloadSchemaByEventName[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_SETTINGS_ALIAS_PAYLOAD_SETTINGS
      ],
  },
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_LEGACY_TEMPLATE_FALLBACK]: {
    eventName:
      CREATION_TRANSITION_EVENT_NAMES.CREATION_LEGACY_TEMPLATE_FALLBACK,
    eventVersion: 1,
    classification: "operational",
    piiLevel: "indirect",
    retentionClass: "long_365d",
    dedupePolicy: "dedupe_forbidden",
    payloadSchema:
      PayloadSchemaByEventName[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_LEGACY_TEMPLATE_FALLBACK
      ],
  },
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_GATE_WARNING]: {
    eventName:
      CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_GATE_WARNING,
    eventVersion: 1,
    classification: "operational",
    piiLevel: "none",
    retentionClass: "long_365d",
    dedupePolicy: "dedupe_alerts_only",
    payloadSchema:
      PayloadSchemaByEventName[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_GATE_WARNING
      ],
  },
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_GATE_EVALUATION_TICK]: {
    eventName:
      CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_GATE_EVALUATION_TICK,
    eventVersion: 1,
    classification: "operational",
    piiLevel: "none",
    retentionClass: "short_30d",
    dedupePolicy: "dedupe_allowed",
    payloadSchema:
      PayloadSchemaByEventName[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_GATE_EVALUATION_TICK
      ],
  },
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_RECIPE_RUNTIME_FALLBACK]: {
    eventName:
      CREATION_TRANSITION_EVENT_NAMES.CREATION_RECIPE_RUNTIME_FALLBACK,
    eventVersion: 1,
    classification: "operational",
    piiLevel: "none",
    retentionClass: "standard_90d",
    dedupePolicy: "dedupe_forbidden",
    payloadSchema:
      PayloadSchemaByEventName[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_RECIPE_RUNTIME_FALLBACK
      ],
  },
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_RECIPE_RUNTIME_RESOLVED]: {
    eventName:
      CREATION_TRANSITION_EVENT_NAMES.CREATION_RECIPE_RUNTIME_RESOLVED,
    eventVersion: 1,
    classification: "operational",
    piiLevel: "none",
    retentionClass: "standard_90d",
    dedupePolicy: "dedupe_forbidden",
    payloadSchema:
      PayloadSchemaByEventName[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_RECIPE_RUNTIME_RESOLVED
      ],
  },
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_ATTEMPTED]: {
    eventName: CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_ATTEMPTED,
    eventVersion: 1,
    classification: "operational",
    piiLevel: "indirect",
    retentionClass: "standard_90d",
    dedupePolicy: "dedupe_forbidden",
    payloadSchema:
      PayloadSchemaByEventName[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_ATTEMPTED
      ],
  },
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_BLOCKED_STRICT_VALIDATION]: {
    eventName:
      CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_BLOCKED_STRICT_VALIDATION,
    eventVersion: 1,
    classification: "operational",
    piiLevel: "none",
    retentionClass: "standard_90d",
    dedupePolicy: "dedupe_forbidden",
    payloadSchema:
      PayloadSchemaByEventName[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_BLOCKED_STRICT_VALIDATION
      ],
  },
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_SUCCEEDED]: {
    eventName: CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_SUCCEEDED,
    eventVersion: 1,
    classification: "operational",
    piiLevel: "indirect",
    retentionClass: "standard_90d",
    dedupePolicy: "dedupe_forbidden",
    payloadSchema:
      PayloadSchemaByEventName[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_SUCCEEDED
      ],
  },
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_SOURCE_STATUS_CHANGED]: {
    eventName: CREATION_TRANSITION_EVENT_NAMES.CREATION_SOURCE_STATUS_CHANGED,
    eventVersion: 1,
    classification: "operational",
    piiLevel: "none",
    retentionClass: "standard_90d",
    dedupePolicy: "dedupe_forbidden",
    payloadSchema:
      PayloadSchemaByEventName[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_SOURCE_STATUS_CHANGED
      ],
  },
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_DRAFT_SAVED]: {
    eventName: CREATION_TRANSITION_EVENT_NAMES.CREATION_DRAFT_SAVED,
    eventVersion: 1,
    classification: "operational",
    piiLevel: "indirect",
    retentionClass: "short_30d",
    dedupePolicy: "dedupe_forbidden",
    payloadSchema:
      PayloadSchemaByEventName[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_DRAFT_SAVED
      ],
  },
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_SNAPSHOT_ACCESSED]: {
    eventName:
      CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_SNAPSHOT_ACCESSED,
    eventVersion: 1,
    classification: "audit",
    piiLevel: "indirect",
    retentionClass: "long_365d",
    dedupePolicy: "dedupe_forbidden",
    payloadSchema:
      PayloadSchemaByEventName[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_SNAPSHOT_ACCESSED
      ],
  },
  [CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_SNAPSHOT_ACCESS_DENIED]:
    {
      eventName:
        CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_SNAPSHOT_ACCESS_DENIED,
      eventVersion: 1,
      classification: "security",
      piiLevel: "indirect",
      retentionClass: "long_365d",
      dedupePolicy: "dedupe_forbidden",
      payloadSchema:
        PayloadSchemaByEventName[
          CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_SNAPSHOT_ACCESS_DENIED
        ],
    },
};

export const CreationTransitionEnvelopeSchema = z
  .object({
    eventId: z.string().uuid(),
    eventName: z.nativeEnum(CREATION_TRANSITION_EVENT_NAMES),
    eventVersion: z.number().int().positive(),
    emittedAt: z.string().datetime(),
    environment: z.string().min(1).max(40),
    releaseVersion: z.string().min(1).max(80),
    serviceName: z.string().min(1).max(80),
    requestId: z.string().min(1).max(120),
    traceId: z.string().min(1).max(120),
    correlationId: z.string().min(1).max(120),
    causationId: z.string().min(1).max(120).optional(),
    actorType: z.enum(["user", "service", "system"]),
    actorIdentityHash: z.string().min(8).max(128).optional(),
    projectId: z.string().uuid().optional(),
    classification: z.enum(["operational", "security", "audit"]),
    piiLevel: z.enum(["none", "indirect", "restricted"]),
    retentionClass: z.enum(["short_30d", "standard_90d", "long_365d"]),
    payload: z.unknown(),
    dedupeKey: z.string().min(1).max(180).optional(),
  })
  .strict();

export type CreationTransitionEnvelope = z.infer<
  typeof CreationTransitionEnvelopeSchema
>;

export function parseCreationTransitionPayload<TEventName extends CreationTransitionEventName>(
  eventName: TEventName,
  payload: unknown,
): CreationTransitionPayloadByEventName[TEventName] {
  const contract = CREATION_TRANSITION_EVENT_CONTRACT[eventName];
  return contract.payloadSchema.parse(
    payload,
  ) as CreationTransitionPayloadByEventName[TEventName];
}
