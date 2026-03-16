import { describe, expect, it } from "vitest";
import { AssistantDraftSchema, type AssistantDraft } from "@/src/modules/creation-assistant/domain";
import { resolveSourceStatusState } from "./use-source-status";

function buildDraft(partial: Partial<AssistantDraft>): AssistantDraft {
  return AssistantDraftSchema.parse({
    projectName: "Projeto de teste",
    profile: "data-model",
    startStrategy: "manual",
    initialView: "erd",
    layout: "auto",
    detailLevel: "intermediate",
    automation: {
      inferRelations: true,
      createLinkFields: true,
      applySuggestedNames: true,
      autoOrganizeOnCreate: true,
      detectInconsistenciesEarly: true,
    },
    context: {},
    ...partial,
  });
}

describe("useSourceStatus helpers", () => {
  it("keeps relational DB as ready_to_attempt_import until a real import mark happens", () => {
    const draft = buildDraft({
      startStrategy: "import",
      startSource: "postgres",
      sourceConfig: {
        kind: "postgres",
        connectionMode: "fields",
        host: "localhost",
        port: 5432,
        database: "mapia",
        schema: "public",
        authMode: "userpass",
        sslMode: "require",
        username: "mapia",
      },
    });

    const status = resolveSourceStatusState(draft);
    expect(status.sourceLifecycle.sourceStatus).toBe("ready_to_attempt_import");
    expect(status.sourceStatusLabel).toContain("tentar importar");
    expect(status.sourceLifecycle.sourceStatus).not.toBe("imported");
  });

  it("only promotes to ready_to_attempt_import when capability supports import attempt and precheck is ready", () => {
    const openApiDraft = buildDraft({
      profile: "system-architecture",
      startStrategy: "import",
      startSource: "openapi",
      initialView: "graph",
      sourceConfig: {
        kind: "openapi",
        inputMode: "paste",
        specText: '{"openapi":"3.0.0","info":{"title":"x","version":"1.0.0"},"paths":{}}',
      },
    });

    const openApiStatus = resolveSourceStatusState(openApiDraft);
    expect(openApiStatus.sourceLifecycle.sourceStatus).toBe("precheck_ok");
    expect(openApiStatus.sourceStatusLabel).toContain("Pre-verificacao");
  });

  it("returns coherent human copy and connect-later indicator", () => {
    const pendingDraft = buildDraft({
      profile: "process",
      startStrategy: "hybrid",
      startSource: "csv",
      initialView: "flow",
      sourceConfig: undefined,
    });

    const status = resolveSourceStatusState(pendingDraft);
    expect(status.isConnectLaterSelected).toBe(true);
    expect(status.sourceStatusSummary).toContain("nao configurada");
  });
});
