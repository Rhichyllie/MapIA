import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertAuthStorageReady,
  inspectAuthStorageReadiness,
  normalizeAuthStorageError,
  resetAuthStorageReadinessCacheForTests,
} from "./auth-storage-readiness";

function buildRawQueryDelegate(...responses: unknown[]) {
  return {
    $queryRaw: vi.fn(async () => responses.shift()),
  } as never;
}

describe("auth storage readiness", () => {
  beforeEach(() => {
    resetAuthStorageReadinessCacheForTests();
  });

  it("reports auth storage as ready only when tables, migrations and integrity are all coherent", async () => {
    const rawQueryDelegate = buildRawQueryDelegate(
      [
        { tableName: "app_users" },
        { tableName: "auth_identities" },
        { tableName: "workspace_memberships" },
        { tableName: "_prisma_migrations" },
      ],
      [
        {
          migrationName: "20260402160000_auth_access_foundation",
          finishedAt: new Date("2026-04-02T16:00:00.000Z"),
          rolledBackAt: null,
        },
        {
          migrationName: "20260406190000_auth_uuid_integrity_repair",
          finishedAt: new Date("2026-04-06T19:00:00.000Z"),
          rolledBackAt: null,
        },
        {
          migrationName: "20260407113000_auth_storage_rollout_guardrails",
          finishedAt: new Date("2026-04-07T11:30:00.000Z"),
          rolledBackAt: null,
        },
      ],
      [],
    );

    const report = await inspectAuthStorageReadiness({
      rawQueryDelegate,
      databaseUrl: "postgresql://mapia:mapia@localhost:55432/mapia?schema=public",
      useCache: false,
    });

    expect(report).toMatchObject({
      ready: true,
      state: "ready",
      schemaName: "public",
      missingTables: [],
      integrityIssues: [],
      migrationHistory: {
        status: "ready",
        missingRequiredMigrations: [],
        failedRequiredMigrations: [],
        stateMatchesStorage: true,
        stateMismatchReasons: [],
      },
      correctiveActions: [],
    });
  });

  it("classifies a schema with no auth foundation as foundation_missing", async () => {
    const rawQueryDelegate = buildRawQueryDelegate([]);

    await expect(
      assertAuthStorageReady({
        rawQueryDelegate,
        databaseUrl:
          "postgresql://mapia:mapia@localhost:55432/mapia?schema=auth_missing",
        useCache: false,
      }),
    ).rejects.toMatchObject({
      code: "AUTH_STORAGE_NOT_READY",
      status: 503,
      details: expect.objectContaining({
        state: "foundation_missing",
        schemaName: "auth_missing",
        missingTables: ["app_users", "auth_identities", "workspace_memberships"],
        migrationHistory: expect.objectContaining({
          status: "history_unavailable",
          missingRequiredMigrations: [
            "20260402160000_auth_access_foundation",
            "20260406190000_auth_uuid_integrity_repair",
            "20260407113000_auth_storage_rollout_guardrails",
          ],
        }),
      }),
    });
  });

  it("classifies a schema with only part of the auth foundation as foundation_partial", async () => {
    const rawQueryDelegate = buildRawQueryDelegate(
      [
        { tableName: "app_users" },
        { tableName: "_prisma_migrations" },
      ],
      [
        {
          migrationName: "20260402160000_auth_access_foundation",
          finishedAt: new Date("2026-04-02T16:00:00.000Z"),
          rolledBackAt: null,
        },
      ],
    );

    const report = await inspectAuthStorageReadiness({
      rawQueryDelegate,
      databaseUrl: "postgresql://mapia:mapia@localhost:55432/mapia?schema=public",
      useCache: false,
    });

    expect(report).toMatchObject({
      ready: false,
      state: "foundation_partial",
      missingTables: ["auth_identities", "workspace_memberships"],
      migrationHistory: {
        status: "required_missing",
        missingRequiredMigrations: [
          "20260406190000_auth_uuid_integrity_repair",
          "20260407113000_auth_storage_rollout_guardrails",
        ],
      },
    });
  });

  it("detects migration rollout as incomplete even when auth tables already exist", async () => {
    const rawQueryDelegate = buildRawQueryDelegate(
      [
        { tableName: "app_users" },
        { tableName: "auth_identities" },
        { tableName: "workspace_memberships" },
        { tableName: "_prisma_migrations" },
      ],
      [
        {
          migrationName: "20260402160000_auth_access_foundation",
          finishedAt: new Date("2026-04-02T16:00:00.000Z"),
          rolledBackAt: null,
        },
      ],
      [],
    );

    await expect(
      assertAuthStorageReady({
        rawQueryDelegate,
        databaseUrl:
          "postgresql://mapia:mapia@localhost:55432/mapia?schema=public",
        useCache: false,
      }),
    ).rejects.toMatchObject({
      code: "AUTH_STORAGE_MIGRATION_INCOMPLETE",
      status: 503,
      details: expect.objectContaining({
        state: "migration_incomplete",
        migrationHistory: expect.objectContaining({
          status: "required_missing",
          missingRequiredMigrations: [
            "20260406190000_auth_uuid_integrity_repair",
            "20260407113000_auth_storage_rollout_guardrails",
          ],
        }),
      }),
    });
  });

  it("flags migration history mismatch when required migrations say ready but tables are gone", async () => {
    const rawQueryDelegate = buildRawQueryDelegate(
      [
        { tableName: "_prisma_migrations" },
      ],
      [
        {
          migrationName: "20260402160000_auth_access_foundation",
          finishedAt: new Date("2026-04-02T16:00:00.000Z"),
          rolledBackAt: null,
        },
        {
          migrationName: "20260406190000_auth_uuid_integrity_repair",
          finishedAt: new Date("2026-04-06T19:00:00.000Z"),
          rolledBackAt: null,
        },
        {
          migrationName: "20260407113000_auth_storage_rollout_guardrails",
          finishedAt: new Date("2026-04-07T11:30:00.000Z"),
          rolledBackAt: null,
        },
      ],
    );

    const report = await inspectAuthStorageReadiness({
      rawQueryDelegate,
      databaseUrl: "postgresql://mapia:mapia@localhost:55432/mapia?schema=public",
      useCache: false,
    });

    expect(report.ready).toBe(false);
    expect(report.state).toBe("foundation_missing");
    expect(report.migrationHistory.status).toBe("ready");
    expect(report.migrationHistory.stateMismatchReasons).toEqual([
      "Historico de migrations pronto, mas faltam tabelas obrigatorias: app_users, auth_identities, workspace_memberships.",
    ]);
  });

  it("fails readiness when auth storage contains legacy ids that cannot become session claims", async () => {
    const rawQueryDelegate = buildRawQueryDelegate(
      [
        { tableName: "app_users" },
        { tableName: "auth_identities" },
        { tableName: "workspace_memberships" },
        { tableName: "_prisma_migrations" },
      ],
      [
        {
          migrationName: "20260402160000_auth_access_foundation",
          finishedAt: new Date("2026-04-02T16:00:00.000Z"),
          rolledBackAt: null,
        },
        {
          migrationName: "20260406190000_auth_uuid_integrity_repair",
          finishedAt: new Date("2026-04-06T19:00:00.000Z"),
          rolledBackAt: null,
        },
        {
          migrationName: "20260407113000_auth_storage_rollout_guardrails",
          finishedAt: new Date("2026-04-07T11:30:00.000Z"),
          rolledBackAt: null,
        },
      ],
      [
        { checkId: "app_users.id", invalidCount: 1 },
        { checkId: "workspace_memberships.id", invalidCount: 1 },
      ],
    );

    await expect(
      assertAuthStorageReady({
        rawQueryDelegate,
        databaseUrl:
          "postgresql://mapia:mapia@localhost:55432/mapia?schema=public",
        useCache: false,
      }),
    ).rejects.toMatchObject({
      code: "AUTH_STORAGE_INTEGRITY_INVALID",
      details: expect.objectContaining({
        state: "integrity_invalid",
        integrityIssues: [
          { checkId: "app_users.id", invalidCount: 1 },
          { checkId: "workspace_memberships.id", invalidCount: 1 },
        ],
      }),
    });
  });

  it("normalizes raw relation-missing errors into foundation_missing auth storage errors", () => {
    const normalized = normalizeAuthStorageError(
      new Error('relation "auth_identities" does not exist'),
    );

    expect(normalized).toMatchObject({
      code: "AUTH_STORAGE_NOT_READY",
      status: 503,
      details: expect.objectContaining({
        state: "foundation_missing",
      }),
    });
  });
});
