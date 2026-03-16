import { describe, expect, it } from "vitest";
import {
  assertNoSensitiveValues,
  redactAssistantCreationSettings,
  redactAssistantDraft,
  redactSensitiveStrings,
  redactSensitiveText,
  redactSourceConfig,
} from "./redact-source-config";

describe("redact-source-config", () => {
  it("redacts sensitive keys in relational source config", () => {
    const redacted = redactSourceConfig({
      kind: "postgres",
      connectionMode: "string",
      connectionString: "postgresql://user:super-secret@db.internal:5432/mapia",
      password: "super-secret",
      username: "reader",
      schema: "public",
    });

    expect(redacted).toMatchObject({
      kind: "postgres",
      connectionMode: "string",
      username: "reader",
      schema: "public",
    });
    expect(JSON.stringify(redacted)).not.toContain("connectionString");
    expect(JSON.stringify(redacted)).not.toContain("password");
  });

  it("redacts sensitive patterns inside arbitrary strings", () => {
    const redacted = redactSensitiveStrings({
      details:
        "Falha em postgresql://admin:secret@db.internal:5432/mapia com Bearer abc.def.ghi token=xyz",
      metadata: {
        notes: "url=https://user:password@api.mapia.local?apiKey=123",
      },
    });

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("abc.def.ghi");
    expect(serialized).not.toContain("apiKey=123");
    expect(serialized).toContain("***REDACTED***");
  });

  it("ensures draft/settings persist and return without raw secrets", () => {
    const draft = redactAssistantDraft({
      projectName: "Projeto seguro",
      profile: "data-model",
      startStrategy: "import",
      startSource: "postgres",
      sourceConfig: {
        kind: "postgres",
        connectionMode: "fields",
        host: "db.internal",
        port: 5432,
        database: "mapia",
        authMode: "userpass",
        sslMode: "require",
        username: "readonly",
        password: "plain-password",
      },
      initialView: "erd",
      layout: "relational",
      detailLevel: "intermediate",
      automation: {
        inferRelations: true,
        createLinkFields: true,
        applySuggestedNames: true,
        autoOrganizeOnCreate: true,
        detectInconsistenciesEarly: true,
      },
      context: {},
      lastError:
        "Falha no endpoint https://admin:top-secret@api.local/import com token=abc123",
    });

    const settings = redactAssistantCreationSettings({
      profile: "data-model",
      startStrategy: "import",
      startSource: "postgres",
      sourceConfig: draft.sourceConfig,
      initialView: "erd",
      layout: "relational",
      detailLevel: "intermediate",
      automation: draft.automation,
      context: draft.context,
      lastError: draft.lastError,
    });

    const draftSerialized = JSON.stringify(draft);
    const settingsSerialized = JSON.stringify(settings);
    expect(draftSerialized).not.toContain("plain-password");
    expect(settingsSerialized).not.toContain("plain-password");
    expect(draftSerialized).not.toContain("top-secret");
    expect(settingsSerialized).toContain("***REDACTED***");
  });

  it("throws when assert detects sensitive leak by key or content", () => {
    expect(() =>
      assertNoSensitiveValues({
        value: { sourceConfig: { password: "plain" } },
        context: "test-leak-key",
      }),
    ).toThrow(/Sensitive data leak detected/i);

    expect(() =>
      assertNoSensitiveValues({
        value: { notes: "postgresql://user:plain@db.internal/mapia" },
        context: "test-leak-content",
      }),
    ).toThrow(/Sensitive data leak detected/i);
  });

  it("redacts sensitive text patterns in lastError values", () => {
    const redacted = redactSensitiveText(
      "Falha com connectionString=postgresql://user:secret@db.internal/mapia e Bearer abc123",
    );

    expect(redacted).not.toContain("secret");
    expect(redacted).toContain("***REDACTED***");
  });
});
