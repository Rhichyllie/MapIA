import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  CreationTransitionEnvelope,
  CreationTransitionEventName,
} from "./creation-transition-contract";
import { CREATION_TRANSITION_EVENT_NAMES } from "./creation-transition-contract";

export type CreationTelemetrySinkSkipReason =
  | "disabled"
  | "sink_unavailable";

export type CreationTelemetrySinkInsertResult =
  | { status: "stored" }
  | { status: "deduped" }
  | { status: "skipped"; reason: CreationTelemetrySinkSkipReason };

export type CreationTransitionStoredEvent = {
  eventName: CreationTransitionEventName;
  emittedAt: Date;
  payload: unknown;
  projectId?: string;
};

export type TemplateFallbackReasonCount = {
  reason: string;
  count: number;
};

export type TemplateInheritedFieldsCount = {
  profile: number;
  initialView: number;
  layout: number;
  contextDefaults: number;
};

export interface CreationTransitionTelemetryStore {
  insert(event: CreationTransitionEnvelope): Promise<CreationTelemetrySinkInsertResult>;
  countByEventName(input: {
    eventNames: CreationTransitionEventName[];
    windowStart: Date;
    windowEnd: Date;
  }): Promise<Record<CreationTransitionEventName, number>>;
  listByEventName(input: {
    eventName: CreationTransitionEventName;
    windowStart: Date;
    windowEnd: Date;
  }): Promise<CreationTransitionStoredEvent[]>;
  countDistinctProjectIds(input: {
    windowStart: Date;
    windowEnd: Date;
    eventNames?: CreationTransitionEventName[];
  }): Promise<number>;
  countDistinctProjectsWithTemplateDependency(input: {
    windowStart: Date;
    windowEnd: Date;
  }): Promise<number>;
  topTemplateFallbackReasons(input: {
    windowStart: Date;
    windowEnd: Date;
    limit: number;
  }): Promise<TemplateFallbackReasonCount[]>;
  countTemplateInheritedFields(input: {
    windowStart: Date;
    windowEnd: Date;
  }): Promise<TemplateInheritedFieldsCount>;
  latestIngestedAt(): Promise<Date | null>;
}

type PrismaCreationTelemetryEventDelegate = PrismaClient["creationTelemetryEvent"];
type PrismaRawQueryDelegate = Pick<PrismaClient, "$queryRaw">;

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function buildZeroCounts(
  eventNames: CreationTransitionEventName[],
): Record<CreationTransitionEventName, number> {
  return Object.fromEntries(
    eventNames.map((eventName) => [eventName, 0]),
  ) as Record<CreationTransitionEventName, number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function hasPrismaKnownRequestCode(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

export function isCreationTelemetryTableMissingError(error: unknown): boolean {
  if (hasPrismaKnownRequestCode(error, "P2021")) {
    return true;
  }

  if (hasPrismaKnownRequestCode(error, "P2010")) {
    const meta = isRecord(error.meta) ? error.meta : undefined;
    if (meta?.code === "42P01") {
      return true;
    }
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("creation_telemetry_events") &&
    (message.includes("does not exist") || message.includes("doesn't exist"))
  );
}

export type CreationTransitionTelemetryStoreDegradedState = {
  reason: "missing_table";
  fallbackMode: "noop";
  tableName: "public.creation_telemetry_events";
  detectedAt: string;
};

type CreationTransitionTelemetryStoreProbe = () => Promise<boolean>;

type ResilientCreationTransitionTelemetryStoreOptions = {
  primary: CreationTransitionTelemetryStore;
  fallback?: CreationTransitionTelemetryStore;
  probePrimaryReadiness?: CreationTransitionTelemetryStoreProbe;
  onDegraded?: (
    state: CreationTransitionTelemetryStoreDegradedState,
  ) => void;
};

export function createCreationTelemetryTableReadinessProbe(
  rawQueryDelegate: PrismaRawQueryDelegate,
): CreationTransitionTelemetryStoreProbe {
  return async () => {
    const rows = await rawQueryDelegate.$queryRaw<Array<{ exists: boolean }>>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'creation_telemetry_events'
        ) AS "exists"
      `,
    );

    return rows[0]?.exists === true;
  };
}

export class NoopCreationTransitionTelemetryStore
  implements CreationTransitionTelemetryStore
{
  constructor(
    private readonly reason: CreationTelemetrySinkSkipReason = "disabled",
  ) {}

  async insert(): Promise<CreationTelemetrySinkInsertResult> {
    return {
      status: "skipped",
      reason: this.reason,
    };
  }

  async countByEventName(input: {
    eventNames: CreationTransitionEventName[];
    windowStart: Date;
    windowEnd: Date;
  }): Promise<Record<CreationTransitionEventName, number>> {
    return buildZeroCounts(input.eventNames);
  }

  async listByEventName(): Promise<CreationTransitionStoredEvent[]> {
    return [];
  }

  async countDistinctProjectIds(): Promise<number> {
    return 0;
  }

  async countDistinctProjectsWithTemplateDependency(): Promise<number> {
    return 0;
  }

  async topTemplateFallbackReasons(): Promise<TemplateFallbackReasonCount[]> {
    return [];
  }

  async countTemplateInheritedFields(): Promise<TemplateInheritedFieldsCount> {
    return {
      profile: 0,
      initialView: 0,
      layout: 0,
      contextDefaults: 0,
    };
  }

  async latestIngestedAt(): Promise<Date | null> {
    return null;
  }
}

export class ResilientCreationTransitionTelemetryStore
  implements CreationTransitionTelemetryStore
{
  private readonly fallback: CreationTransitionTelemetryStore;
  private degradedState: CreationTransitionTelemetryStoreDegradedState | null =
    null;
  private readinessCheckPromise: Promise<boolean> | null = null;

  constructor(
    private readonly options: ResilientCreationTransitionTelemetryStoreOptions,
  ) {
    this.fallback =
      options.fallback ??
      new NoopCreationTransitionTelemetryStore("sink_unavailable");
  }

  getDegradedState(): CreationTransitionTelemetryStoreDegradedState | null {
    return this.degradedState;
  }

  async insert(
    event: CreationTransitionEnvelope,
  ): Promise<CreationTelemetrySinkInsertResult> {
    return this.withFallback((store) => store.insert(event));
  }

  async countByEventName(input: {
    eventNames: CreationTransitionEventName[];
    windowStart: Date;
    windowEnd: Date;
  }): Promise<Record<CreationTransitionEventName, number>> {
    return this.withFallback((store) => store.countByEventName(input));
  }

  async listByEventName(input: {
    eventName: CreationTransitionEventName;
    windowStart: Date;
    windowEnd: Date;
  }): Promise<CreationTransitionStoredEvent[]> {
    return this.withFallback((store) => store.listByEventName(input));
  }

  async countDistinctProjectIds(input: {
    windowStart: Date;
    windowEnd: Date;
    eventNames?: CreationTransitionEventName[];
  }): Promise<number> {
    return this.withFallback((store) => store.countDistinctProjectIds(input));
  }

  async countDistinctProjectsWithTemplateDependency(input: {
    windowStart: Date;
    windowEnd: Date;
  }): Promise<number> {
    return this.withFallback((store) =>
      store.countDistinctProjectsWithTemplateDependency(input),
    );
  }

  async topTemplateFallbackReasons(input: {
    windowStart: Date;
    windowEnd: Date;
    limit: number;
  }): Promise<TemplateFallbackReasonCount[]> {
    return this.withFallback((store) => store.topTemplateFallbackReasons(input));
  }

  async countTemplateInheritedFields(input: {
    windowStart: Date;
    windowEnd: Date;
  }): Promise<TemplateInheritedFieldsCount> {
    return this.withFallback((store) => store.countTemplateInheritedFields(input));
  }

  async latestIngestedAt(): Promise<Date | null> {
    return this.withFallback((store) => store.latestIngestedAt());
  }

  private async withFallback<T>(
    operation: (store: CreationTransitionTelemetryStore) => Promise<T>,
  ): Promise<T> {
    if (!(await this.shouldUsePrimaryStore())) {
      return operation(this.fallback);
    }

    try {
      return await operation(this.options.primary);
    } catch (error) {
      if (!isCreationTelemetryTableMissingError(error)) {
        throw error;
      }

      this.degradeToFallback();
      return operation(this.fallback);
    }
  }

  private async shouldUsePrimaryStore(): Promise<boolean> {
    if (this.degradedState) {
      return false;
    }

    if (!this.options.probePrimaryReadiness) {
      return true;
    }

    if (!this.readinessCheckPromise) {
      this.readinessCheckPromise = this.options
        .probePrimaryReadiness()
        .then((ready) => {
          if (!ready) {
            this.degradeToFallback();
          }
          return ready;
        })
        .catch(() => {
          this.readinessCheckPromise = null;
          return true;
        });
    }

    return this.readinessCheckPromise;
  }

  private degradeToFallback() {
    if (this.degradedState) {
      return;
    }

    this.degradedState = {
      reason: "missing_table",
      fallbackMode: "noop",
      tableName: "public.creation_telemetry_events",
      detectedAt: new Date().toISOString(),
    };
    this.options.onDegraded?.(this.degradedState);
  }
}

export class PrismaCreationTransitionTelemetryStore
  implements CreationTransitionTelemetryStore
{
  constructor(
    private readonly delegate: PrismaCreationTelemetryEventDelegate,
    private readonly rawQueryDelegate?: PrismaRawQueryDelegate,
  ) {}

  async insert(
    event: CreationTransitionEnvelope,
  ): Promise<CreationTelemetrySinkInsertResult> {
    try {
      await this.delegate.create({
        data: {
          eventName: event.eventName,
          eventVersion: event.eventVersion,
          eventId: event.eventId,
          dedupeKey: event.dedupeKey ?? null,
          emittedAt: new Date(event.emittedAt),
          environment: event.environment,
          releaseVersion: event.releaseVersion,
          serviceName: event.serviceName,
          requestId: event.requestId,
          traceId: event.traceId,
          correlationId: event.correlationId,
          causationId: event.causationId ?? null,
          actorType: event.actorType,
          actorIdentityHash: event.actorIdentityHash ?? null,
          projectId: event.projectId ?? null,
          classification: event.classification,
          piiLevel: event.piiLevel,
          retentionClass: event.retentionClass,
          payload: toJsonValue(event.payload),
        },
      });
      return { status: "stored" };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        event.dedupeKey
      ) {
        return { status: "deduped" };
      }
      throw error;
    }
  }

  async countByEventName(input: {
    eventNames: CreationTransitionEventName[];
    windowStart: Date;
    windowEnd: Date;
  }): Promise<Record<CreationTransitionEventName, number>> {
    const grouped = await this.delegate.groupBy({
      by: ["eventName"],
      where: {
        eventName: {
          in: input.eventNames,
        },
        emittedAt: {
          gte: input.windowStart,
          lte: input.windowEnd,
        },
      },
      _count: {
        _all: true,
      },
    });

    const counts = buildZeroCounts(input.eventNames);

    grouped.forEach((row) => {
      const eventName = row.eventName as CreationTransitionEventName;
      counts[eventName] = row._count._all;
    });

    return counts;
  }

  async listByEventName(input: {
    eventName: CreationTransitionEventName;
    windowStart: Date;
    windowEnd: Date;
  }): Promise<CreationTransitionStoredEvent[]> {
    const rows = await this.delegate.findMany({
      where: {
        eventName: input.eventName,
        emittedAt: {
          gte: input.windowStart,
          lte: input.windowEnd,
        },
      },
      select: {
        eventName: true,
        emittedAt: true,
        payload: true,
        projectId: true,
      },
    });

    return rows.map((row) => ({
      eventName: row.eventName as CreationTransitionEventName,
      emittedAt: row.emittedAt,
      payload: row.payload,
      ...(row.projectId ? { projectId: row.projectId } : {}),
    }));
  }

  async countDistinctProjectIds(input: {
    windowStart: Date;
    windowEnd: Date;
    eventNames?: CreationTransitionEventName[];
  }): Promise<number> {
    const rows = await this.delegate.groupBy({
      by: ["projectId"],
      where: {
        projectId: {
          not: null,
        },
        emittedAt: {
          gte: input.windowStart,
          lte: input.windowEnd,
        },
        ...(input.eventNames && input.eventNames.length > 0
          ? {
              eventName: {
                in: input.eventNames,
              },
            }
          : {}),
      },
      _count: {
        _all: true,
      },
    });

    return rows.length;
  }

  async countDistinctProjectsWithTemplateDependency(input: {
    windowStart: Date;
    windowEnd: Date;
  }): Promise<number> {
    const rows = await this.delegate.groupBy({
      by: ["projectId"],
      where: {
        eventName:
          CREATION_TRANSITION_EVENT_NAMES.CREATION_LEGACY_TEMPLATE_FALLBACK,
        projectId: {
          not: null,
        },
        emittedAt: {
          gte: input.windowStart,
          lte: input.windowEnd,
        },
        payload: {
          path: ["dependencyReal"],
          equals: true,
        },
      },
      _count: {
        _all: true,
      },
    });

    return rows.length;
  }

  async topTemplateFallbackReasons(input: {
    windowStart: Date;
    windowEnd: Date;
    limit: number;
  }): Promise<TemplateFallbackReasonCount[]> {
    if (this.rawQueryDelegate) {
      const rows = await this.rawQueryDelegate.$queryRaw<
        Array<{ reason: string | null; count: number | bigint }>
      >(Prisma.sql`
        SELECT
          COALESCE("payload"->>'fallbackReason', 'unknown') AS "reason",
          COUNT(*)::int AS "count"
        FROM "creation_telemetry_events"
        WHERE "eventName" = ${CREATION_TRANSITION_EVENT_NAMES.CREATION_LEGACY_TEMPLATE_FALLBACK}
          AND "emittedAt" >= ${input.windowStart}
          AND "emittedAt" <= ${input.windowEnd}
          AND ("payload"->>'dependencyReal') = 'true'
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT ${Math.max(1, input.limit)}
      `);

      return rows.map((row) => ({
        reason: row.reason ?? "unknown",
        count: Number(row.count),
      }));
    }

    const fallbackEvents = await this.listByEventName({
      eventName:
        CREATION_TRANSITION_EVENT_NAMES.CREATION_LEGACY_TEMPLATE_FALLBACK,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
    });

    return [...fallbackEvents.reduce((accumulator, event) => {
      const payload = event.payload as
        | { fallbackReason?: string; dependencyReal?: boolean }
        | null;
      if (!payload?.dependencyReal) {
        return accumulator;
      }

      const reason = payload.fallbackReason ?? "unknown";
      accumulator.set(reason, (accumulator.get(reason) ?? 0) + 1);
      return accumulator;
    }, new Map<string, number>()).entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, input.limit)
      .map(([reason, count]) => ({ reason, count }));
  }

  async countTemplateInheritedFields(input: {
    windowStart: Date;
    windowEnd: Date;
  }): Promise<TemplateInheritedFieldsCount> {
    if (this.rawQueryDelegate) {
      const rows = await this.rawQueryDelegate.$queryRaw<
        Array<{
          profile: number | bigint;
          initialView: number | bigint;
          layout: number | bigint;
          contextDefaults: number | bigint;
        }>
      >(Prisma.sql`
        SELECT
          COALESCE(SUM(CASE WHEN ("payload"->'fieldsFromTemplate'->>'profile') = 'true' THEN 1 ELSE 0 END), 0)::int AS "profile",
          COALESCE(SUM(CASE WHEN ("payload"->'fieldsFromTemplate'->>'initialView') = 'true' THEN 1 ELSE 0 END), 0)::int AS "initialView",
          COALESCE(SUM(CASE WHEN ("payload"->'fieldsFromTemplate'->>'layout') = 'true' THEN 1 ELSE 0 END), 0)::int AS "layout",
          COALESCE(SUM(CASE WHEN ("payload"->'fieldsFromTemplate'->>'contextDefaults') = 'true' THEN 1 ELSE 0 END), 0)::int AS "contextDefaults"
        FROM "creation_telemetry_events"
        WHERE "eventName" = ${CREATION_TRANSITION_EVENT_NAMES.CREATION_LEGACY_TEMPLATE_FALLBACK}
          AND "emittedAt" >= ${input.windowStart}
          AND "emittedAt" <= ${input.windowEnd}
          AND ("payload"->>'dependencyReal') = 'true'
      `);

      const row = rows[0] ?? {
        profile: 0,
        initialView: 0,
        layout: 0,
        contextDefaults: 0,
      };
      return {
        profile: Number(row.profile),
        initialView: Number(row.initialView),
        layout: Number(row.layout),
        contextDefaults: Number(row.contextDefaults),
      };
    }

    const fallbackEvents = await this.listByEventName({
      eventName:
        CREATION_TRANSITION_EVENT_NAMES.CREATION_LEGACY_TEMPLATE_FALLBACK,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
    });

    const inherited = {
      profile: 0,
      initialView: 0,
      layout: 0,
      contextDefaults: 0,
    };

    fallbackEvents.forEach((event) => {
      const payload = event.payload as
        | {
            dependencyReal?: boolean;
            fieldsFromTemplate?: {
              profile?: boolean;
              initialView?: boolean;
              layout?: boolean;
              contextDefaults?: boolean;
            };
          }
        | null;
      if (!payload?.dependencyReal) {
        return;
      }

      if (payload.fieldsFromTemplate?.profile) inherited.profile += 1;
      if (payload.fieldsFromTemplate?.initialView) inherited.initialView += 1;
      if (payload.fieldsFromTemplate?.layout) inherited.layout += 1;
      if (payload.fieldsFromTemplate?.contextDefaults) inherited.contextDefaults += 1;
    });

    return inherited;
  }

  async latestIngestedAt(): Promise<Date | null> {
    const latest = await this.delegate.findFirst({
      orderBy: {
        ingestedAt: "desc",
      },
      select: {
        ingestedAt: true,
      },
    });
    return latest?.ingestedAt ?? null;
  }
}

export class MemoryCreationTransitionTelemetryStore
  implements CreationTransitionTelemetryStore
{
  private readonly events: Array<
    CreationTransitionEnvelope & { ingestedAt: Date }
  > = [];

  async insert(
    event: CreationTransitionEnvelope,
  ): Promise<CreationTelemetrySinkInsertResult> {
    if (event.dedupeKey) {
      const duplicate = this.events.some(
        (stored) =>
          stored.eventName === event.eventName &&
          stored.eventVersion === event.eventVersion &&
          stored.dedupeKey === event.dedupeKey,
      );
      if (duplicate) {
        return { status: "deduped" };
      }
    }

    this.events.push({
      ...event,
      ingestedAt: new Date(),
    });
    return { status: "stored" };
  }

  async countByEventName(input: {
    eventNames: CreationTransitionEventName[];
    windowStart: Date;
    windowEnd: Date;
  }): Promise<Record<CreationTransitionEventName, number>> {
    const counts = buildZeroCounts(input.eventNames);

    this.events.forEach((event) => {
      const emittedAt = new Date(event.emittedAt);
      if (
        emittedAt >= input.windowStart &&
        emittedAt <= input.windowEnd &&
        input.eventNames.includes(event.eventName)
      ) {
        counts[event.eventName] += 1;
      }
    });

    return counts;
  }

  async listByEventName(input: {
    eventName: CreationTransitionEventName;
    windowStart: Date;
    windowEnd: Date;
  }): Promise<CreationTransitionStoredEvent[]> {
    return this.events
      .filter((event) => event.eventName === input.eventName)
      .filter((event) => {
        const emittedAt = new Date(event.emittedAt);
        return emittedAt >= input.windowStart && emittedAt <= input.windowEnd;
      })
      .map((event) => ({
        eventName: event.eventName,
        emittedAt: new Date(event.emittedAt),
        payload: event.payload,
        ...(event.projectId ? { projectId: event.projectId } : {}),
      }));
  }

  async countDistinctProjectIds(input: {
    windowStart: Date;
    windowEnd: Date;
    eventNames?: CreationTransitionEventName[];
  }): Promise<number> {
    return new Set(
      this.events
        .filter((event) => {
          const emittedAt = new Date(event.emittedAt);
          const inWindow =
            emittedAt >= input.windowStart && emittedAt <= input.windowEnd;
          if (!inWindow || !event.projectId) return false;
          if (!input.eventNames || input.eventNames.length === 0) return true;
          return input.eventNames.includes(event.eventName);
        })
        .map((event) => event.projectId as string),
    ).size;
  }

  async countDistinctProjectsWithTemplateDependency(input: {
    windowStart: Date;
    windowEnd: Date;
  }): Promise<number> {
    return new Set(
      this.events
        .filter((event) => {
          const emittedAt = new Date(event.emittedAt);
          const inWindow =
            emittedAt >= input.windowStart && emittedAt <= input.windowEnd;
          if (!inWindow || !event.projectId) return false;
          if (
            event.eventName !==
            CREATION_TRANSITION_EVENT_NAMES.CREATION_LEGACY_TEMPLATE_FALLBACK
          ) {
            return false;
          }

          const payload = event.payload as Record<string, unknown> | null;
          return payload?.dependencyReal === true;
        })
        .map((event) => event.projectId as string),
    ).size;
  }

  async topTemplateFallbackReasons(input: {
    windowStart: Date;
    windowEnd: Date;
    limit: number;
  }): Promise<TemplateFallbackReasonCount[]> {
    return [...this.events
      .filter((event) => {
        const emittedAt = new Date(event.emittedAt);
        const inWindow =
          emittedAt >= input.windowStart && emittedAt <= input.windowEnd;
        if (!inWindow) return false;
        if (
          event.eventName !==
          CREATION_TRANSITION_EVENT_NAMES.CREATION_LEGACY_TEMPLATE_FALLBACK
        ) {
          return false;
        }

        const payload = event.payload as Record<string, unknown> | null;
        return payload?.dependencyReal === true;
      })
      .reduce((accumulator, event) => {
        const payload = event.payload as Record<string, unknown> | null;
        const reason =
          typeof payload?.fallbackReason === "string"
            ? payload.fallbackReason
            : "unknown";
        accumulator.set(reason, (accumulator.get(reason) ?? 0) + 1);
        return accumulator;
      }, new Map<string, number>()).entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, input.limit)
      .map(([reason, count]) => ({ reason, count }));
  }

  async countTemplateInheritedFields(input: {
    windowStart: Date;
    windowEnd: Date;
  }): Promise<TemplateInheritedFieldsCount> {
    const inherited = {
      profile: 0,
      initialView: 0,
      layout: 0,
      contextDefaults: 0,
    };

    this.events
      .filter((event) => {
        const emittedAt = new Date(event.emittedAt);
        const inWindow =
          emittedAt >= input.windowStart && emittedAt <= input.windowEnd;
        if (!inWindow) return false;
        if (
          event.eventName !==
          CREATION_TRANSITION_EVENT_NAMES.CREATION_LEGACY_TEMPLATE_FALLBACK
        ) {
          return false;
        }

        const payload = event.payload as Record<string, unknown> | null;
        return payload?.dependencyReal === true;
      })
      .forEach((event) => {
        const payload = event.payload as
          | {
              fieldsFromTemplate?: {
                profile?: boolean;
                initialView?: boolean;
                layout?: boolean;
                contextDefaults?: boolean;
              };
            }
          | null;

        if (payload?.fieldsFromTemplate?.profile) inherited.profile += 1;
        if (payload?.fieldsFromTemplate?.initialView) inherited.initialView += 1;
        if (payload?.fieldsFromTemplate?.layout) inherited.layout += 1;
        if (payload?.fieldsFromTemplate?.contextDefaults) {
          inherited.contextDefaults += 1;
        }
      });

    return inherited;
  }

  async latestIngestedAt(): Promise<Date | null> {
    const latest = this.events
      .map((event) => event.ingestedAt)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return latest ?? null;
  }
}
