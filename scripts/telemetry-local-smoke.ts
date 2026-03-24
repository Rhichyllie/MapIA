import {
  __emitCreationTransitionEventForTests,
  __resetCreationTransitionTelemetryForTests,
  __setCreationTransitionTelemetryRuntimeConfigForTests,
  __setCreationTransitionTelemetryStoreForTests,
} from "../src/server/observability/creation-assistant-transition-telemetry";
import type {
  CreationTransitionStoredEvent,
  CreationTransitionTelemetryStore,
  TemplateFallbackReasonCount,
  TemplateInheritedFieldsCount,
} from "../src/server/observability/creation-transition-store";
import type {
  CreationTransitionEnvelope,
  CreationTransitionEventName,
} from "../src/server/observability/creation-transition-contract";
import {
  ensureServerOpenTelemetryRuntimeStarted,
  shutdownServerOpenTelemetryRuntime,
} from "../src/server/observability/otel-runtime";

class SlowSmokeStore implements CreationTransitionTelemetryStore {
  async insert(event: CreationTransitionEnvelope): Promise<{ status: "stored" }> {
    void event;
    await new Promise((resolve) => setTimeout(resolve, 80));
    return { status: "stored" };
  }

  async countByEventName(input: {
    eventNames: CreationTransitionEventName[];
    windowStart: Date;
    windowEnd: Date;
  }): Promise<Record<CreationTransitionEventName, number>> {
    return Object.fromEntries(
      input.eventNames.map((eventName) => [eventName, 0]),
    ) as Record<CreationTransitionEventName, number>;
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

async function main() {
  const bootstrap = ensureServerOpenTelemetryRuntimeStarted();
  console.log(
    JSON.stringify(
      {
        check: "bootstrap",
        startResult: bootstrap.startResult,
        snapshot: bootstrap.runtime.debugSnapshot(),
      },
      null,
      2,
    ),
  );

  __resetCreationTransitionTelemetryForTests();
  __setCreationTransitionTelemetryRuntimeConfigForTests({
    enabled: true,
    sinkTimeoutMs: 5,
    sinkFallbackCooldownMs: 1000,
    gateEvaluationIntervalMs: 1,
    logThrottleMs: 30000,
  });
  __setCreationTransitionTelemetryStoreForTests(new SlowSmokeStore());

  const first = await __emitCreationTransitionEventForTests({
    eventName: "creation_apply_attempted",
    payload: {
      mode: "existing",
      createInitialMap: true,
    },
    context: {
      projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      actorIdentity: "owner@mapia.local",
    },
  });
  const second = await __emitCreationTransitionEventForTests({
    eventName: "creation_apply_succeeded",
    payload: {
      createInitialMap: true,
      appliedVersion: 2,
    },
    context: {
      projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      actorIdentity: "owner@mapia.local",
    },
  });

  console.log(
    JSON.stringify(
      {
        check: "sink_fallback",
        first,
        second,
      },
      null,
      2,
    ),
  );

  __resetCreationTransitionTelemetryForTests();
  await shutdownServerOpenTelemetryRuntime();
}

void main().catch(async (error) => {
  console.error(
    JSON.stringify(
      {
        check: "telemetry_local_smoke_failed",
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  __resetCreationTransitionTelemetryForTests();
  await shutdownServerOpenTelemetryRuntime();
  process.exitCode = 1;
});
