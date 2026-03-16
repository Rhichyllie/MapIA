import { describe, expect, it, vi } from "vitest";
import type { CreationTransitionEnvelope } from "./creation-transition-contract";
import {
  MemoryCreationTransitionTelemetryStore,
  NoopCreationTransitionTelemetryStore,
  ResilientCreationTransitionTelemetryStore,
  type CreationTransitionTelemetryStoreDegradedState,
} from "./creation-transition-store";

function buildEvent(): CreationTransitionEnvelope {
  return {
    eventId: "evt-123",
    eventName: "creation_draft_saved",
    eventVersion: 1,
    emittedAt: "2026-08-01T12:00:00.000Z",
    environment: "test",
    releaseVersion: "test",
    serviceName: "mapia-web",
    requestId: "req-123",
    traceId: "0123456789abcdef0123456789abcdef",
    correlationId: "corr-123",
    actorType: "system",
    classification: "operational",
    piiLevel: "indirect",
    retentionClass: "standard_90d",
    payload: {
      route: "PUT /api/projects/:id/creation-draft",
      viaAlias: false,
      draftVersion: 1,
    },
  };
}

describe("ResilientCreationTransitionTelemetryStore", () => {
  it("stores through the primary sink when the telemetry table is ready", async () => {
    const primary = new MemoryCreationTransitionTelemetryStore();
    const store = new ResilientCreationTransitionTelemetryStore({
      primary,
      probePrimaryReadiness: vi.fn().mockResolvedValue(true),
    });

    const result = await store.insert(buildEvent());
    const counts = await store.countByEventName({
      eventNames: ["creation_draft_saved"],
      windowStart: new Date("2026-07-01T00:00:00.000Z"),
      windowEnd: new Date("2026-09-01T00:00:00.000Z"),
    });

    expect(result).toEqual({ status: "stored" });
    expect(counts.creation_draft_saved).toBe(1);
    expect(store.getDegradedState()).toBeNull();
  });

  it("degrades to noop without calling the primary sink when the readiness probe reports a missing table", async () => {
    const primary = new MemoryCreationTransitionTelemetryStore();
    const primaryInsertSpy = vi.spyOn(primary, "insert");
    const degradedStates: CreationTransitionTelemetryStoreDegradedState[] = [];
    const store = new ResilientCreationTransitionTelemetryStore({
      primary,
      fallback: new NoopCreationTransitionTelemetryStore("sink_unavailable"),
      probePrimaryReadiness: vi.fn().mockResolvedValue(false),
      onDegraded: (state) => {
        degradedStates.push(state);
      },
    });

    const first = await store.insert(buildEvent());
    const second = await store.insert(buildEvent());
    const counts = await store.countByEventName({
      eventNames: ["creation_draft_saved"],
      windowStart: new Date("2026-07-01T00:00:00.000Z"),
      windowEnd: new Date("2026-09-01T00:00:00.000Z"),
    });

    expect(first).toEqual({
      status: "skipped",
      reason: "sink_unavailable",
    });
    expect(second).toEqual({
      status: "skipped",
      reason: "sink_unavailable",
    });
    expect(primaryInsertSpy).not.toHaveBeenCalled();
    expect(degradedStates).toHaveLength(1);
    expect(degradedStates[0]?.reason).toBe("missing_table");
    expect(counts.creation_draft_saved).toBe(0);
  });

  it("degrades permanently after the first missing-table failure from the primary sink", async () => {
    const fallback = new NoopCreationTransitionTelemetryStore("sink_unavailable");
    const degradedStates: CreationTransitionTelemetryStoreDegradedState[] = [];
    const primary = {
      insert: vi
        .fn()
        .mockRejectedValue(
          new Error(
            "The table `public.creation_telemetry_events` does not exist in the current database.",
          ),
        ),
      countByEventName: vi.fn().mockResolvedValue({
        creation_draft_saved: 0,
      }),
      listByEventName: vi.fn().mockResolvedValue([]),
      countDistinctProjectIds: vi.fn().mockResolvedValue(0),
      countDistinctProjectsWithTemplateDependency: vi.fn().mockResolvedValue(0),
      topTemplateFallbackReasons: vi.fn().mockResolvedValue([]),
      countTemplateInheritedFields: vi.fn().mockResolvedValue({
        profile: 0,
        initialView: 0,
        layout: 0,
        contextDefaults: 0,
      }),
      latestIngestedAt: vi.fn().mockResolvedValue(null),
    };
    const store = new ResilientCreationTransitionTelemetryStore({
      primary,
      fallback,
      probePrimaryReadiness: vi.fn().mockResolvedValue(true),
      onDegraded: (state) => {
        degradedStates.push(state);
      },
    });

    const first = await store.insert(buildEvent());
    const second = await store.insert(buildEvent());

    expect(first).toEqual({
      status: "skipped",
      reason: "sink_unavailable",
    });
    expect(second).toEqual({
      status: "skipped",
      reason: "sink_unavailable",
    });
    expect(primary.insert).toHaveBeenCalledTimes(1);
    expect(degradedStates).toHaveLength(1);
    expect(store.getDegradedState()?.tableName).toBe(
      "public.creation_telemetry_events",
    );
  });
});
