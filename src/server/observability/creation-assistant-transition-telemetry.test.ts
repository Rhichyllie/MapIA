import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trace } from "@opentelemetry/api";
import {
  __flushCreationTransitionTelemetryForTests,
  __emitCreationTransitionEventForTests,
  __resetCreationTransitionTelemetryForTests,
  __setCreationTransitionTelemetryRuntimeConfigForTests,
  __setCreationTransitionTelemetryStoreForTests,
  MemoryCreationTransitionTelemetryStore,
  evaluateCreationTransitionGateWarnings,
  getCreationTransitionTelemetrySnapshot,
  recordCreationApplyAttempted,
  recordCreationApplyBlockedStrictValidation,
  recordCreationDraftSaved,
  recordCreationLegacyTemplateFallback,
  recordCreationRecipeRuntimeResolved,
  recordCreationSettingsAliasPut,
  recordCreationTransitionSnapshotAccessDenied,
  resolveTraceIdForTelemetry,
  runCreationTelemetryFanout,
} from "./creation-assistant-transition-telemetry";
import type { CreationTransitionTelemetryStore } from "./creation-transition-store";
import type { CreationTransitionEnvelope } from "./creation-transition-contract";
import { __resetTelemetryOperationalLoggerForTests } from "./telemetry-operational-logger";

class SlowMemoryStore implements CreationTransitionTelemetryStore {
  constructor(
    private readonly delayMs: number,
    private readonly delegate = new MemoryCreationTransitionTelemetryStore(),
  ) {}

  async insert(event: CreationTransitionEnvelope) {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return this.delegate.insert(event);
  }

  countByEventName = this.delegate.countByEventName.bind(this.delegate);
  listByEventName = this.delegate.listByEventName.bind(this.delegate);
  countDistinctProjectIds = this.delegate.countDistinctProjectIds.bind(this.delegate);
  countDistinctProjectsWithTemplateDependency =
    this.delegate.countDistinctProjectsWithTemplateDependency.bind(this.delegate);
  topTemplateFallbackReasons =
    this.delegate.topTemplateFallbackReasons.bind(this.delegate);
  countTemplateInheritedFields =
    this.delegate.countTemplateInheritedFields.bind(this.delegate);
  latestIngestedAt = this.delegate.latestIngestedAt.bind(this.delegate);
}

class FailingStore implements CreationTransitionTelemetryStore {
  async insert(): Promise<{ status: "stored" } | { status: "deduped" }> {
    throw new Error("sink-down");
  }

  async countByEventName(input: {
    eventNames: Parameters<CreationTransitionTelemetryStore["countByEventName"]>[0]["eventNames"];
    windowStart: Date;
    windowEnd: Date;
  }) {
    return Object.fromEntries(input.eventNames.map((eventName) => [eventName, 0])) as Record<
      string,
      number
    >;
  }

  async listByEventName() {
    return [];
  }

  async countDistinctProjectIds() {
    return 0;
  }

  async countDistinctProjectsWithTemplateDependency() {
    return 0;
  }

  async latestIngestedAt() {
    return null;
  }

  async topTemplateFallbackReasons() {
    return [];
  }

  async countTemplateInheritedFields() {
    return {
      profile: 0,
      initialView: 0,
      layout: 0,
      contextDefaults: 0,
    };
  }
}

class InconsistentWindowStore implements CreationTransitionTelemetryStore {
  async insert() {
    return { status: "stored" as const };
  }

  async countByEventName(input: {
    eventNames: Parameters<CreationTransitionTelemetryStore["countByEventName"]>[0]["eventNames"];
    windowStart: Date;
    windowEnd: Date;
  }) {
    return Object.fromEntries(input.eventNames.map((eventName) => [eventName, 0])) as Record<
      string,
      number
    >;
  }

  async listByEventName() {
    return [];
  }

  async countDistinctProjectIds() {
    return 0;
  }

  async countDistinctProjectsWithTemplateDependency() {
    return 1;
  }

  async latestIngestedAt() {
    return null;
  }

  async topTemplateFallbackReasons() {
    return [];
  }

  async countTemplateInheritedFields() {
    return {
      profile: 0,
      initialView: 0,
      layout: 0,
      contextDefaults: 0,
    };
  }
}

class AggregatedBreakdownStore implements CreationTransitionTelemetryStore {
  async insert() {
    return { status: "stored" as const };
  }

  async countByEventName(input: {
    eventNames: Parameters<CreationTransitionTelemetryStore["countByEventName"]>[0]["eventNames"];
    windowStart: Date;
    windowEnd: Date;
  }) {
    return Object.fromEntries(input.eventNames.map((eventName) => [eventName, 0])) as Record<
      string,
      number
    >;
  }

  async listByEventName(): Promise<[]> {
    throw new Error("listByEventName should not be used for snapshot breakdowns");
  }

  async countDistinctProjectIds() {
    return 2;
  }

  async countDistinctProjectsWithTemplateDependency() {
    return 1;
  }

  async topTemplateFallbackReasons() {
    return [{ reason: "migration_gap", count: 3 }];
  }

  async countTemplateInheritedFields() {
    return {
      profile: 2,
      initialView: 1,
      layout: 0,
      contextDefaults: 1,
    };
  }

  async latestIngestedAt() {
    return new Date("2026-08-01T12:00:00.000Z");
  }
}

describe("creation transition telemetry enterprise hardening", () => {
  beforeEach(() => {
    __resetCreationTransitionTelemetryForTests();
    __resetTelemetryOperationalLoggerForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T12:00:00.000Z"));
    __setCreationTransitionTelemetryStoreForTests(
      new MemoryCreationTransitionTelemetryStore(),
    );
    __setCreationTransitionTelemetryRuntimeConfigForTests({
      enabled: true,
      sinkTimeoutMs: 120,
      gateEvaluationIntervalMs: 1,
      logThrottleMs: 60000,
    });
  });

  afterEach(async () => {
    await __flushCreationTransitionTelemetryForTests();
    __resetCreationTransitionTelemetryForTests();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not subcount alias writes and runtime fallback by aggressive dedupe", async () => {
    await recordCreationDraftSaved({
      projectId: "f6ab8a41-5d65-47d9-bdb5-753e8ec7c915",
      ownerIdentity: "admin@mapia.local",
      route: "PUT /api/projects/:id/creation-draft",
      viaAlias: false,
      draftVersion: 1,
    });

    await recordCreationSettingsAliasPut({
      projectId: "f6ab8a41-5d65-47d9-bdb5-753e8ec7c915",
      ownerIdentity: "admin@mapia.local",
      route: "PUT /api/projects/:id/creation-settings",
      usedSettingsAliasPayload: true,
    });
    await recordCreationSettingsAliasPut({
      projectId: "f6ab8a41-5d65-47d9-bdb5-753e8ec7c915",
      ownerIdentity: "admin@mapia.local",
      route: "PUT /api/projects/:id/creation-settings",
      usedSettingsAliasPayload: true,
    });

    await recordCreationRecipeRuntimeResolved({
      projectId: "f6ab8a41-5d65-47d9-bdb5-753e8ec7c915",
      ownerIdentity: "admin@mapia.local",
      profile: "blank",
      view: "timeline",
      recipeId: "blank:timeline",
      fallbackUsed: true,
    });
    await recordCreationRecipeRuntimeResolved({
      projectId: "f6ab8a41-5d65-47d9-bdb5-753e8ec7c915",
      ownerIdentity: "admin@mapia.local",
      profile: "blank",
      view: "timeline",
      recipeId: "blank:timeline",
      fallbackUsed: true,
    });

    const snapshot = await getCreationTransitionTelemetrySnapshot();
    expect(snapshot.operationalSummary.counters.creation_settings_alias_put).toBe(2);
    expect(
      snapshot.operationalSummary.counters.creation_recipe_runtime_fallback,
    ).toBe(2);
  });

  it("calculates template dependency rate using unique projects in numerator and denominator", async () => {
    const dependentProject = "11111111-1111-4111-8111-111111111111";
    const nonDependentProject = "22222222-2222-4222-8222-222222222222";

    await recordCreationDraftSaved({
      projectId: nonDependentProject,
      ownerIdentity: "owner@mapia.local",
      route: "PUT /api/projects/:id/creation-draft",
      viaAlias: false,
      draftVersion: 1,
    });

    await recordCreationLegacyTemplateFallback({
      projectId: dependentProject,
      ownerIdentity: "owner@mapia.local",
      source: "editor",
      fallbackMode: "partial",
      fallbackReason: "invalid_settings",
      fieldsFromTemplate: {
        profile: true,
        initialView: false,
        layout: false,
        contextDefaults: false,
      },
      riskTier: "low",
      effectiveResult: {
        profile: "data-model",
        initialView: "erd",
        layout: "relational",
      },
    });
    await recordCreationLegacyTemplateFallback({
      projectId: dependentProject,
      ownerIdentity: "owner@mapia.local",
      source: "create",
      fallbackMode: "partial",
      fallbackReason: "migration_gap",
      fieldsFromTemplate: {
        profile: true,
        initialView: true,
        layout: false,
        contextDefaults: false,
      },
      riskTier: "high",
      effectiveResult: {
        profile: "data-model",
        initialView: "erd",
        layout: "relational",
      },
    });

    const snapshot = await getCreationTransitionTelemetrySnapshot();
    expect(snapshot.executiveSummary.templateDependencyRatePercent).toBe(50);
  });

  it("emits gate warning independently of snapshot GET and dedupes warning itself", async () => {
    vi.setSystemTime(new Date("2026-08-01T12:00:00.000Z"));
    const sharedStore = new MemoryCreationTransitionTelemetryStore();
    __setCreationTransitionTelemetryStoreForTests(sharedStore);

    await recordCreationDraftSaved({
      projectId: "33333333-3333-4333-8333-333333333333",
      ownerIdentity: "ops@mapia.local",
      route: "PUT /api/projects/:id/creation-draft",
      viaAlias: false,
      draftVersion: 1,
    });
    vi.setSystemTime(new Date("2026-08-01T12:00:00.100Z"));
    await recordCreationSettingsAliasPut({
      projectId: "33333333-3333-4333-8333-333333333333",
      ownerIdentity: "ops@mapia.local",
      route: "PUT /api/projects/:id/creation-settings",
      usedSettingsAliasPayload: true,
    });

    await __flushCreationTransitionTelemetryForTests();
    const warningsAfterAuto = await sharedStore.listByEventName({
      eventName: "creation_transition_gate_warning",
      windowStart: new Date("2026-07-01T00:00:00.000Z"),
      windowEnd: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(warningsAfterAuto.length).toBeGreaterThan(0);

    await evaluateCreationTransitionGateWarnings();
    const warningsAfterManual = await sharedStore.listByEventName({
      eventName: "creation_transition_gate_warning",
      windowStart: new Date("2026-07-01T00:00:00.000Z"),
      windowEnd: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(warningsAfterManual.length).toBe(warningsAfterAuto.length);

    const leaseTicks = await sharedStore.listByEventName({
      eventName: "creation_transition_gate_evaluation_tick",
      windowStart: new Date("2026-07-01T00:00:00.000Z"),
      windowEnd: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(leaseTicks.length).toBeGreaterThanOrEqual(1);
  });

  it("does not block product flow when sink is slow or failing", async () => {
    vi.useRealTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    __setCreationTransitionTelemetryRuntimeConfigForTests({
      sinkTimeoutMs: 10,
      gateEvaluationIntervalMs: 1,
    });

    const slowStore = new SlowMemoryStore(100);
    __setCreationTransitionTelemetryStoreForTests(slowStore);
    const startedAt = Date.now();
    await recordCreationDraftSaved({
      projectId: "44444444-4444-4444-8444-444444444444",
      ownerIdentity: "owner@mapia.local",
      route: "PUT /api/projects/:id/creation-draft",
      viaAlias: false,
      draftVersion: 1,
    });
    const elapsedSlow = Date.now() - startedAt;
    expect(elapsedSlow).toBeLessThan(250);

    __setCreationTransitionTelemetryStoreForTests(new FailingStore());
    await expect(
      recordCreationApplyAttempted({
        projectId: "55555555-5555-4555-8555-555555555555",
        ownerIdentity: "owner@mapia.local",
        mode: "existing",
        createInitialMap: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("executes telemetry fan-out in bounded parallel mode", async () => {
    vi.useRealTimers();
    __setCreationTransitionTelemetryRuntimeConfigForTests({
      sinkTimeoutMs: 30,
      gateEvaluationIntervalMs: 1,
    });
    __setCreationTransitionTelemetryStoreForTests(new SlowMemoryStore(200));

    const startedAt = Date.now();
    await runCreationTelemetryFanout([
      () =>
        recordCreationDraftSaved({
          projectId: "88888888-8888-4888-8888-888888888888",
          ownerIdentity: "owner@mapia.local",
          route: "PUT /api/projects/:id/creation-draft",
          viaAlias: false,
          draftVersion: 1,
        }),
      () =>
        recordCreationApplyAttempted({
          projectId: "88888888-8888-4888-8888-888888888888",
          ownerIdentity: "owner@mapia.local",
          mode: "existing",
          createInitialMap: true,
        }),
      () =>
        recordCreationSettingsAliasPut({
          projectId: "88888888-8888-4888-8888-888888888888",
          ownerIdentity: "owner@mapia.local",
          route: "PUT /api/projects/:id/creation-settings",
          usedSettingsAliasPayload: true,
        }),
    ]);
    const elapsed = Date.now() - startedAt;
    expect(elapsed).toBeLessThan(110);
  });

  it("exposes emitter result semantics: stored, deduped, timeout and error", async () => {
    vi.useRealTimers();
    const sharedStore = new MemoryCreationTransitionTelemetryStore();
    __setCreationTransitionTelemetryStoreForTests(sharedStore);
    __setCreationTransitionTelemetryRuntimeConfigForTests({
      sinkTimeoutMs: 120,
      gateEvaluationIntervalMs: 1,
    });

    const stored = await __emitCreationTransitionEventForTests({
      eventName: "creation_draft_saved",
      payload: {
        route: "PUT /api/projects/:id/creation-draft",
        viaAlias: false,
        draftVersion: 1,
      },
      context: {
        projectId: "10101010-1010-4010-8010-101010101010",
        actorIdentity: "owner@mapia.local",
      },
    });
    expect(stored).toBe("stored");

    const firstTick = await __emitCreationTransitionEventForTests({
      eventName: "creation_transition_gate_evaluation_tick",
      payload: {
        trigger: "manual",
        windowStart: "2026-07-01T00:00:00.000Z",
        windowEnd: "2026-07-15T00:00:00.000Z",
        leaseBucket: 123,
      },
      context: {
        dedupeKey: "lease:123",
      },
    });
    const secondTick = await __emitCreationTransitionEventForTests({
      eventName: "creation_transition_gate_evaluation_tick",
      payload: {
        trigger: "manual",
        windowStart: "2026-07-01T00:00:00.000Z",
        windowEnd: "2026-07-15T00:00:00.000Z",
        leaseBucket: 123,
      },
      context: {
        dedupeKey: "lease:123",
      },
    });
    expect(firstTick).toBe("stored");
    expect(secondTick).toBe("deduped");

    __setCreationTransitionTelemetryRuntimeConfigForTests({
      sinkTimeoutMs: 5,
      gateEvaluationIntervalMs: 1,
    });
    __setCreationTransitionTelemetryStoreForTests(new SlowMemoryStore(80));
    const timeout = await __emitCreationTransitionEventForTests({
      eventName: "creation_apply_attempted",
      payload: {
        mode: "existing",
        createInitialMap: true,
      },
      context: {
        projectId: "20202020-2020-4020-8020-202020202020",
        actorIdentity: "owner@mapia.local",
      },
    });
    expect(timeout).toBe("timeout");

    __resetCreationTransitionTelemetryForTests();
    __resetTelemetryOperationalLoggerForTests();
    __setCreationTransitionTelemetryRuntimeConfigForTests({
      enabled: true,
      sinkTimeoutMs: 120,
      sinkFallbackCooldownMs: 30000,
      gateEvaluationIntervalMs: 1,
      logThrottleMs: 60000,
    });
    __setCreationTransitionTelemetryStoreForTests(new FailingStore());
    const error = await __emitCreationTransitionEventForTests({
      eventName: "creation_apply_succeeded",
      payload: {
        createInitialMap: true,
        appliedVersion: 2,
        sourceStatus: "imported",
      },
      context: {
        projectId: "30303030-3030-4030-8030-303030303030",
        actorIdentity: "owner@mapia.local",
      },
    });
    expect(error).toBe("error");
  });

  it("entra em fallback no-op apos timeout e passa a pular export sem bloquear o caminho seguinte", async () => {
    vi.useRealTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    __setCreationTransitionTelemetryRuntimeConfigForTests({
      enabled: true,
      sinkTimeoutMs: 5,
      sinkFallbackCooldownMs: 1000,
      gateEvaluationIntervalMs: 1,
      logThrottleMs: 30000,
    });
    const insertSpy = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      return { status: "stored" as const };
    });
    __setCreationTransitionTelemetryStoreForTests({
      insert: insertSpy,
      async countByEventName(input) {
        return Object.fromEntries(
          input.eventNames.map((eventName) => [eventName, 0]),
        ) as Record<string, number>;
      },
      async listByEventName() {
        return [];
      },
      async countDistinctProjectIds() {
        return 0;
      },
      async countDistinctProjectsWithTemplateDependency() {
        return 0;
      },
      async topTemplateFallbackReasons() {
        return [];
      },
      async countTemplateInheritedFields() {
        return {
          profile: 0,
          initialView: 0,
          layout: 0,
          contextDefaults: 0,
        };
      },
      async latestIngestedAt() {
        return null;
      },
    });

    const first = await __emitCreationTransitionEventForTests({
      eventName: "creation_apply_attempted",
      payload: {
        mode: "existing",
        createInitialMap: true,
      },
      context: {
        projectId: "21212121-2121-4121-8121-212121212121",
        actorIdentity: "owner@mapia.local",
      },
    });
    expect(first).toBe("timeout");
    expect(insertSpy).toHaveBeenCalledTimes(1);

    const second = await __emitCreationTransitionEventForTests({
      eventName: "creation_apply_succeeded",
      payload: {
        createInitialMap: true,
        appliedVersion: 3,
      },
      context: {
        projectId: "21212121-2121-4121-8121-212121212121",
        actorIdentity: "owner@mapia.local",
      },
    });

    expect(second).toBe("skipped");
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it("emite logs operacionais estruturados para timeout, fallback ativo e export skipped", async () => {
    vi.useRealTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    __setCreationTransitionTelemetryRuntimeConfigForTests({
      enabled: true,
      sinkTimeoutMs: 5,
      sinkFallbackCooldownMs: 1000,
      gateEvaluationIntervalMs: 1,
      logThrottleMs: 30000,
    });
    __setCreationTransitionTelemetryStoreForTests(new SlowMemoryStore(80));

    await __emitCreationTransitionEventForTests({
      eventName: "creation_apply_attempted",
      payload: {
        mode: "existing",
        createInitialMap: true,
      },
      context: {
        projectId: "31313131-3131-4131-8131-313131313131",
        actorIdentity: "owner@mapia.local",
      },
    });
    await __emitCreationTransitionEventForTests({
      eventName: "creation_apply_succeeded",
      payload: {
        createInitialMap: true,
        appliedVersion: 4,
      },
      context: {
        projectId: "31313131-3131-4131-8131-313131313131",
        actorIdentity: "owner@mapia.local",
      },
    });

    const combinedOutput = warnSpy.mock.calls
      .flat()
      .map((value) => String(value))
      .join(" ");

    expect(combinedOutput).toContain("telemetry_sink_timeout");
    expect(combinedOutput).toContain("telemetry_sink_fallback_active");
    expect(combinedOutput).toContain("telemetry_export_skipped");
  });

  it("skips persistence entirely when creation telemetry is disabled by configuration", async () => {
    const sharedStore = new MemoryCreationTransitionTelemetryStore();
    __setCreationTransitionTelemetryStoreForTests(sharedStore);
    __setCreationTransitionTelemetryRuntimeConfigForTests({
      enabled: false,
      sinkTimeoutMs: 120,
      gateEvaluationIntervalMs: 1,
      logThrottleMs: 60000,
    });

    const result = await __emitCreationTransitionEventForTests({
      eventName: "creation_draft_saved",
      payload: {
        route: "PUT /api/projects/:id/creation-draft",
        viaAlias: false,
        draftVersion: 1,
      },
      context: {
        projectId: "40404040-4040-4040-8040-404040404040",
        actorIdentity: "owner@mapia.local",
      },
    });
    const counts = await sharedStore.countByEventName({
      eventNames: ["creation_draft_saved"],
      windowStart: new Date("2026-07-01T00:00:00.000Z"),
      windowEnd: new Date("2026-09-01T00:00:00.000Z"),
    });

    expect(result).toBe("disabled");
    expect(counts.creation_draft_saved).toBe(0);
  });

  it("throttles repeated sink error logs for the same event signature", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    __setCreationTransitionTelemetryStoreForTests(new FailingStore());
    __setCreationTransitionTelemetryRuntimeConfigForTests({
      enabled: true,
      sinkTimeoutMs: 120,
      gateEvaluationIntervalMs: 1,
      logThrottleMs: 30000,
    });

    await __emitCreationTransitionEventForTests({
      eventName: "creation_apply_succeeded",
      payload: {
        createInitialMap: true,
        appliedVersion: 2,
        sourceStatus: "imported",
      },
      context: {
        projectId: "50505050-5050-4050-8050-505050505050",
        actorIdentity: "owner@mapia.local",
      },
    });
    await __emitCreationTransitionEventForTests({
      eventName: "creation_apply_succeeded",
      payload: {
        createInitialMap: true,
        appliedVersion: 2,
        sourceStatus: "imported",
      },
      context: {
        projectId: "50505050-5050-4050-8050-505050505050",
        actorIdentity: "owner@mapia.local",
      },
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30001);

    await __emitCreationTransitionEventForTests({
      eventName: "creation_apply_succeeded",
      payload: {
        createInitialMap: true,
        appliedVersion: 2,
        sourceStatus: "imported",
      },
      context: {
        projectId: "50505050-5050-4050-8050-505050505050",
        actorIdentity: "owner@mapia.local",
      },
    });

    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it("runs each fan-out operation exactly once without hidden retries", async () => {
    const success = vi.fn().mockResolvedValue(undefined);
    const failure = vi.fn().mockRejectedValue(new Error("fanout-op-failed"));

    await runCreationTelemetryFanout([success, failure]);
    await __flushCreationTransitionTelemetryForTests();

    expect(success).toHaveBeenCalledTimes(1);
    expect(failure).toHaveBeenCalledTimes(1);
  });

  it("resolves traceId from valid x-trace-id, traceparent and fallbacks", () => {
    expect(
      resolveTraceIdForTelemetry({
        traceId: "0123456789abcdef0123456789abcdef",
      }),
    ).toBe("0123456789abcdef0123456789abcdef");
    expect(
      resolveTraceIdForTelemetry({
        traceparent:
          "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
      }),
    ).toBe("0123456789abcdef0123456789abcdef");
    expect(
      resolveTraceIdForTelemetry({
        traceparent: "bad-traceparent",
      }),
    ).toBe("unknown");
  });

  it("uses active span traceId when header trace data is absent", () => {
    const activeSpanSpy = vi.spyOn(trace, "getActiveSpan").mockReturnValue({
      spanContext: () => ({
        traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        spanId: "bbbbbbbbbbbbbbbb",
        traceFlags: 1,
      }),
    } as never);

    expect(resolveTraceIdForTelemetry({})).toBe(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    activeSpanSpy.mockRestore();
  });

  it("keeps strict block rate calculation stable under multi-write", async () => {
    const sharedStore = new MemoryCreationTransitionTelemetryStore();
    __setCreationTransitionTelemetryStoreForTests(sharedStore);

    await Promise.all(
      Array.from({ length: 10 }).map((_, index) =>
        recordCreationApplyAttempted({
          projectId: "66666666-6666-4666-8666-666666666666",
          ownerIdentity: `user${index}@mapia.local`,
          mode: "existing",
          createInitialMap: true,
        }),
      ),
    );
    await Promise.all(
      Array.from({ length: 2 }).map(() =>
        recordCreationApplyBlockedStrictValidation({
          projectId: "66666666-6666-4666-8666-666666666666",
          ownerIdentity: "owner@mapia.local",
          profile: "process",
          initialView: "flow",
          blockingIssueCount: 2,
          warningCount: 0,
        }),
      ),
    );

    const snapshot = await getCreationTransitionTelemetrySnapshot();
    expect(snapshot.executiveSummary.strictBlockRatePercent).toBe(20);
  });

  it("does not dedupe repeated denied access events", async () => {
    const sharedStore = new MemoryCreationTransitionTelemetryStore();
    __setCreationTransitionTelemetryStoreForTests(sharedStore);

    await recordCreationTransitionSnapshotAccessDenied({
      ownerIdentity: "blocked@mapia.local",
    });
    await recordCreationTransitionSnapshotAccessDenied({
      ownerIdentity: "blocked@mapia.local",
    });

    const deniedEvents = await sharedStore.listByEventName({
      eventName: "creation_transition_snapshot_access_denied",
      windowStart: new Date("2026-07-01T00:00:00.000Z"),
      windowEnd: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(deniedEvents.length).toBe(2);
  });

  it("keeps snapshot read-only and does not emit gate warning on GET path", async () => {
    const sharedStore = new MemoryCreationTransitionTelemetryStore();
    __setCreationTransitionTelemetryStoreForTests(sharedStore);
    __setCreationTransitionTelemetryRuntimeConfigForTests({
      sinkTimeoutMs: 120,
      gateEvaluationIntervalMs: Number.MAX_SAFE_INTEGER,
    });

    await recordCreationDraftSaved({
      projectId: "77777777-7777-4777-8777-777777777777",
      ownerIdentity: "ops@mapia.local",
      route: "PUT /api/projects/:id/creation-draft",
      viaAlias: false,
      draftVersion: 1,
    });
    await recordCreationSettingsAliasPut({
      projectId: "77777777-7777-4777-8777-777777777777",
      ownerIdentity: "ops@mapia.local",
      route: "PUT /api/projects/:id/creation-settings",
      usedSettingsAliasPayload: true,
    });

    const before = await sharedStore.listByEventName({
      eventName: "creation_transition_gate_warning",
      windowStart: new Date("2026-07-01T00:00:00.000Z"),
      windowEnd: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(before.length).toBe(0);

    await getCreationTransitionTelemetrySnapshot();

    const after = await sharedStore.listByEventName({
      eventName: "creation_transition_gate_warning",
      windowStart: new Date("2026-07-01T00:00:00.000Z"),
      windowEnd: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(after.length).toBe(0);
  });

  it("keeps observational runtime telemetry from auto-triggering gate evaluation", async () => {
    const sharedStore = new MemoryCreationTransitionTelemetryStore();
    __setCreationTransitionTelemetryStoreForTests(sharedStore);
    __setCreationTransitionTelemetryRuntimeConfigForTests({
      sinkTimeoutMs: 120,
      gateEvaluationIntervalMs: 1,
    });

    await recordCreationLegacyTemplateFallback({
      projectId: "78787878-7878-4878-8878-787878787878",
      ownerIdentity: "ops@mapia.local",
      source: "create-page",
      fallbackMode: "partial",
      fallbackReason: "migration_gap",
      fieldsFromTemplate: {
        profile: true,
        initialView: true,
        layout: false,
        contextDefaults: false,
      },
      riskTier: "high",
      effectiveResult: {
        profile: "data-model",
        initialView: "erd",
        layout: "relational",
      },
    });
    await recordCreationRecipeRuntimeResolved({
      projectId: "78787878-7878-4878-8878-787878787878",
      ownerIdentity: "ops@mapia.local",
      profile: "data-model",
      view: "erd",
      recipeId: "data-model:erd",
      fallbackUsed: false,
    });
    await __flushCreationTransitionTelemetryForTests();

    const ticks = await sharedStore.listByEventName({
      eventName: "creation_transition_gate_evaluation_tick",
      windowStart: new Date("2026-07-01T00:00:00.000Z"),
      windowEnd: new Date("2026-09-01T00:00:00.000Z"),
    });
    const warnings = await sharedStore.listByEventName({
      eventName: "creation_transition_gate_warning",
      windowStart: new Date("2026-07-01T00:00:00.000Z"),
      windowEnd: new Date("2026-09-01T00:00:00.000Z"),
    });

    expect(ticks.length).toBe(0);
    expect(warnings.length).toBe(0);
  });

  it("keeps evaluator idempotent under burst calls", async () => {
    const sharedStore = new MemoryCreationTransitionTelemetryStore();
    __setCreationTransitionTelemetryStoreForTests(sharedStore);
    __setCreationTransitionTelemetryRuntimeConfigForTests({
      sinkTimeoutMs: 120,
      gateEvaluationIntervalMs: 30000,
    });

    await recordCreationDraftSaved({
      projectId: "99999999-9999-4999-8999-999999999999",
      ownerIdentity: "ops@mapia.local",
      route: "PUT /api/projects/:id/creation-draft",
      viaAlias: false,
      draftVersion: 1,
    });
    vi.setSystemTime(new Date("2026-08-01T12:00:01.000Z"));
    await recordCreationSettingsAliasPut({
      projectId: "99999999-9999-4999-8999-999999999999",
      ownerIdentity: "ops@mapia.local",
      route: "PUT /api/projects/:id/creation-settings",
      usedSettingsAliasPayload: true,
    });

    await Promise.all(
      Array.from({ length: 10 }).map(() =>
        evaluateCreationTransitionGateWarnings("manual"),
      ),
    );

    const warnings = await sharedStore.listByEventName({
      eventName: "creation_transition_gate_warning",
      windowStart: new Date("2026-07-01T00:00:00.000Z"),
      windowEnd: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(warnings.length).toBe(1);
  });

  it("records evaluation tick even when no gate is breached", async () => {
    const sharedStore = new MemoryCreationTransitionTelemetryStore();
    __setCreationTransitionTelemetryStoreForTests(sharedStore);

    await evaluateCreationTransitionGateWarnings("manual");

    const ticks = await sharedStore.listByEventName({
      eventName: "creation_transition_gate_evaluation_tick",
      windowStart: new Date("2026-07-01T00:00:00.000Z"),
      windowEnd: new Date("2026-09-01T00:00:00.000Z"),
    });
    const warnings = await sharedStore.listByEventName({
      eventName: "creation_transition_gate_warning",
      windowStart: new Date("2026-07-01T00:00:00.000Z"),
      windowEnd: new Date("2026-09-01T00:00:00.000Z"),
    });

    expect(ticks.length).toBe(1);
    expect(warnings.length).toBe(0);
  });

  it("returns zero template dependency rate on empty window", async () => {
    const snapshot = await getCreationTransitionTelemetrySnapshot();
    expect(snapshot.executiveSummary.templateDependencyRatePercent).toBe(0);
  });

  it("does not explode when dependent projects is greater than observed projects", async () => {
    __setCreationTransitionTelemetryStoreForTests(new InconsistentWindowStore());
    const snapshot = await getCreationTransitionTelemetrySnapshot();
    expect(snapshot.executiveSummary.templateDependencyRatePercent).toBe(0);
  });

  it("uses aggregated breakdown queries without scanning fallback events list", async () => {
    __setCreationTransitionTelemetryStoreForTests(new AggregatedBreakdownStore());
    const snapshot = await getCreationTransitionTelemetrySnapshot();

    expect(snapshot.operationalSummary.topFallbackReasons).toEqual([
      { reason: "migration_gap", count: 3 },
    ]);
    expect(snapshot.operationalSummary.inheritedTemplateFields).toEqual(
      expect.arrayContaining([
        { field: "profile", count: 2 },
        { field: "initialView", count: 1 },
        { field: "contextDefaults", count: 1 },
        { field: "layout", count: 0 },
      ]),
    );
  });

  it("keeps snapshot rates coherent without artificial inflation", async () => {
    const mainProject = "12121212-1212-4212-8212-121212121212";
    const dependentProject = "34343434-3434-4434-8434-343434343434";

    await recordCreationDraftSaved({
      projectId: mainProject,
      ownerIdentity: "owner@mapia.local",
      route: "PUT /api/projects/:id/creation-draft",
      viaAlias: false,
      draftVersion: 1,
    });
    await recordCreationSettingsAliasPut({
      projectId: mainProject,
      ownerIdentity: "owner@mapia.local",
      route: "PUT /api/projects/:id/creation-settings",
      usedSettingsAliasPayload: false,
    });
    await recordCreationApplyAttempted({
      projectId: mainProject,
      ownerIdentity: "owner@mapia.local",
      mode: "existing",
      createInitialMap: true,
    });
    await recordCreationApplyBlockedStrictValidation({
      projectId: mainProject,
      ownerIdentity: "owner@mapia.local",
      profile: "process",
      initialView: "flow",
      blockingIssueCount: 1,
      warningCount: 0,
    });
    await recordCreationRecipeRuntimeResolved({
      projectId: mainProject,
      ownerIdentity: "owner@mapia.local",
      profile: "blank",
      view: "free",
      recipeId: "blank:free",
      fallbackUsed: false,
    });
    await recordCreationRecipeRuntimeResolved({
      projectId: mainProject,
      ownerIdentity: "owner@mapia.local",
      profile: "blank",
      view: "timeline",
      recipeId: "blank:timeline",
      fallbackUsed: true,
    });
    await recordCreationLegacyTemplateFallback({
      projectId: dependentProject,
      ownerIdentity: "owner@mapia.local",
      source: "editor",
      fallbackMode: "partial",
      fallbackReason: "migration_gap",
      fieldsFromTemplate: {
        profile: true,
        initialView: false,
        layout: false,
        contextDefaults: false,
      },
      riskTier: "low",
      effectiveResult: {
        profile: "data-model",
        initialView: "erd",
        layout: "relational",
      },
    });

    const snapshot = await getCreationTransitionTelemetrySnapshot();
    expect(snapshot.executiveSummary.aliasWriteRatePercent).toBe(100);
    expect(snapshot.executiveSummary.strictBlockRatePercent).toBe(100);
    expect(snapshot.executiveSummary.runtimeFallbackRatePercent).toBe(50);
    expect(snapshot.executiveSummary.templateDependencyRatePercent).toBe(50);
  });
});
