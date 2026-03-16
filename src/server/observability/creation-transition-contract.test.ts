import { describe, expect, it } from "vitest";
import {
  CREATION_TRANSITION_EVENT_CONTRACT,
  CREATION_TRANSITION_EVENT_NAMES,
  parseCreationTransitionPayload,
} from "./creation-transition-contract";

describe("creation transition telemetry contract", () => {
  it("keeps required events with explicit versioned schemas", () => {
    const requiredEvents = [
      CREATION_TRANSITION_EVENT_NAMES.CREATION_SETTINGS_ALIAS_PUT,
      CREATION_TRANSITION_EVENT_NAMES.CREATION_SETTINGS_ALIAS_PAYLOAD_SETTINGS,
      CREATION_TRANSITION_EVENT_NAMES.CREATION_LEGACY_TEMPLATE_FALLBACK,
      CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_GATE_WARNING,
      CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_GATE_EVALUATION_TICK,
      CREATION_TRANSITION_EVENT_NAMES.CREATION_RECIPE_RUNTIME_FALLBACK,
      CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_BLOCKED_STRICT_VALIDATION,
      CREATION_TRANSITION_EVENT_NAMES.CREATION_SOURCE_STATUS_CHANGED,
    ];

    requiredEvents.forEach((eventName) => {
      expect(CREATION_TRANSITION_EVENT_CONTRACT[eventName]).toBeDefined();
      expect(CREATION_TRANSITION_EVENT_CONTRACT[eventName].eventVersion).toBe(1);
      expect(CREATION_TRANSITION_EVENT_CONTRACT[eventName].dedupePolicy).toBeDefined();
      expect(CREATION_TRANSITION_EVENT_CONTRACT[eventName].payloadSchema).toBeDefined();
    });
  });

  it("keeps dedupe allowed only for warning events", () => {
    expect(
      CREATION_TRANSITION_EVENT_CONTRACT[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_GATE_WARNING
      ].dedupePolicy,
    ).toBe("dedupe_alerts_only");
    expect(
      CREATION_TRANSITION_EVENT_CONTRACT[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_GATE_EVALUATION_TICK
      ].dedupePolicy,
    ).toBe("dedupe_allowed");
    expect(
      CREATION_TRANSITION_EVENT_CONTRACT[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_SETTINGS_ALIAS_PUT
      ].dedupePolicy,
    ).toBe("dedupe_forbidden");
    expect(
      CREATION_TRANSITION_EVENT_CONTRACT[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_RECIPE_RUNTIME_FALLBACK
      ].dedupePolicy,
    ).toBe("dedupe_forbidden");
    expect(
      CREATION_TRANSITION_EVENT_CONTRACT[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_DRAFT_SAVED
      ].dedupePolicy,
    ).toBe("dedupe_forbidden");
    expect(
      CREATION_TRANSITION_EVENT_CONTRACT[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_ATTEMPTED
      ].dedupePolicy,
    ).toBe("dedupe_forbidden");
    expect(
      CREATION_TRANSITION_EVENT_CONTRACT[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_BLOCKED_STRICT_VALIDATION
      ].dedupePolicy,
    ).toBe("dedupe_forbidden");
    expect(
      CREATION_TRANSITION_EVENT_CONTRACT[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_SUCCEEDED
      ].dedupePolicy,
    ).toBe("dedupe_forbidden");
    expect(
      CREATION_TRANSITION_EVENT_CONTRACT[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_SOURCE_STATUS_CHANGED
      ].dedupePolicy,
    ).toBe("dedupe_forbidden");
    expect(
      CREATION_TRANSITION_EVENT_CONTRACT[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_SNAPSHOT_ACCESS_DENIED
      ].dedupePolicy,
    ).toBe("dedupe_forbidden");
  });

  it("rejects payload outside schema and accepts compliant payload", () => {
    expect(() =>
      parseCreationTransitionPayload(
        CREATION_TRANSITION_EVENT_NAMES.CREATION_SETTINGS_ALIAS_PUT,
        {
          route: "PUT /api/projects/:id/creation-settings",
          usedSettingsAliasPayload: true,
          extra: "field-not-allowed",
        },
      ),
    ).toThrowError();

    const parsed = parseCreationTransitionPayload(
      CREATION_TRANSITION_EVENT_NAMES.CREATION_SETTINGS_ALIAS_PUT,
      {
        route: "PUT /api/projects/:id/creation-settings",
        usedSettingsAliasPayload: true,
      },
    );
    expect(parsed).toEqual({
      route: "PUT /api/projects/:id/creation-settings",
      usedSettingsAliasPayload: true,
    });
  });
});
