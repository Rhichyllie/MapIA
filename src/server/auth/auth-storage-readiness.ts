import { Prisma } from "@prisma/client";
import { AppError, isAppError } from "@/src/lib/app-error";
import { getServerEnv } from "@/src/lib/env";
import { prisma } from "@/src/server/db/client";

export const AUTH_STORAGE_REQUIRED_TABLES = [
  "app_users",
  "auth_identities",
  "workspace_memberships",
] as const;

export const AUTH_STORAGE_REQUIRED_MIGRATIONS = [
  "20260402160000_auth_access_foundation",
  "20260406190000_auth_uuid_integrity_repair",
  "20260407113000_auth_storage_rollout_guardrails",
] as const;

export type AuthStorageRequiredTable =
  (typeof AUTH_STORAGE_REQUIRED_TABLES)[number];

export type AuthStorageRequiredMigration =
  (typeof AUTH_STORAGE_REQUIRED_MIGRATIONS)[number];

export type AuthStorageReadinessState =
  | "ready"
  | "foundation_missing"
  | "foundation_partial"
  | "migration_incomplete"
  | "integrity_invalid";

export type AuthStorageMigrationHistoryStatus =
  | "ready"
  | "history_unavailable"
  | "required_missing"
  | "required_failed";

export type AuthStorageMigrationHistory = {
  tablePresent: boolean;
  status: AuthStorageMigrationHistoryStatus;
  appliedRequiredMigrations: AuthStorageRequiredMigration[];
  missingRequiredMigrations: AuthStorageRequiredMigration[];
  failedRequiredMigrations: AuthStorageRequiredMigration[];
  stateMatchesStorage: boolean;
  stateMismatchReasons: string[];
};

export type AuthStorageIntegrityIssue = {
  checkId: string;
  invalidCount: number;
};

export type AuthStorageReadinessReport = {
  ready: boolean;
  state: AuthStorageReadinessState;
  summary: string;
  schemaName: string;
  missingTables: AuthStorageRequiredTable[];
  integrityIssues: AuthStorageIntegrityIssue[];
  migrationHistory: AuthStorageMigrationHistory;
  correctiveActions: string[];
  checkedAt: string;
};

type RawQueryDelegate = Pick<typeof prisma, "$queryRaw">;

type ReadinessCacheEntry = {
  cacheKey: string;
  expiresAt: number;
  report: AuthStorageReadinessReport;
};

type InspectAuthStorageReadinessOptions = {
  rawQueryDelegate?: RawQueryDelegate;
  databaseUrl?: string;
  useCache?: boolean;
  now?: number;
};

type RawMigrationRow = {
  migrationName: string;
  finishedAt: Date | null;
  rolledBackAt: Date | null;
};

type AuthStorageInspectionBase = {
  schemaName: string;
  missingTables: AuthStorageRequiredTable[];
  integrityIssues: AuthStorageIntegrityIssue[];
  migrationHistory: Omit<
    AuthStorageMigrationHistory,
    "stateMatchesStorage" | "stateMismatchReasons"
  >;
  checkedAt: string;
};

const AUTH_STORAGE_CACHE_TTL_MS = 5_000;
const AUTH_STORAGE_MIGRATIONS_TABLE = "_prisma_migrations";
const AUTH_STORAGE_UUID_PATTERN =
  "^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$";

let readinessCache: ReadinessCacheEntry | null = null;

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

function resolveDatabaseSchema(databaseUrl = getServerEnv().DATABASE_URL) {
  if (!databaseUrl?.trim()) {
    return "public";
  }

  try {
    const parsedUrl = new URL(databaseUrl);
    const schema = parsedUrl.searchParams.get("schema")?.trim();
    return schema || "public";
  } catch {
    return "public";
  }
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function buildMigrationTableReference(schemaName: string) {
  return Prisma.raw(
    `${quoteIdentifier(schemaName)}.${quoteIdentifier(
      AUTH_STORAGE_MIGRATIONS_TABLE,
    )}`,
  );
}

function normalizeMissingTables(
  presentTables: Set<AuthStorageRequiredTable>,
): AuthStorageRequiredTable[] {
  return AUTH_STORAGE_REQUIRED_TABLES.filter(
    (tableName) => !presentTables.has(tableName),
  );
}

function buildMigrationHistoryMismatchReasons(input: {
  status: AuthStorageMigrationHistoryStatus;
  missingTables: AuthStorageRequiredTable[];
  integrityIssues: AuthStorageIntegrityIssue[];
}) {
  const reasons: string[] = [];

  if (input.status === "ready" && input.missingTables.length > 0) {
    reasons.push(
      `Historico de migrations pronto, mas faltam tabelas obrigatorias: ${input.missingTables.join(", ")}.`,
    );
  }

  if (input.status === "ready" && input.integrityIssues.length > 0) {
    reasons.push(
      `Historico de migrations pronto, mas a integridade dos IDs continua invalida: ${input.integrityIssues
        .map((issue) => `${issue.checkId}=${issue.invalidCount}`)
        .join(", ")}.`,
    );
  }

  if (input.status === "history_unavailable") {
    reasons.push(
      "Nao foi possivel provar o rollout via _prisma_migrations neste schema.",
    );
  }

  return reasons;
}

function resolveReadinessState(input: {
  missingTables: AuthStorageRequiredTable[];
  integrityIssues: AuthStorageIntegrityIssue[];
  migrationHistoryStatus: AuthStorageMigrationHistoryStatus;
}): AuthStorageReadinessState {
  if (input.missingTables.length === AUTH_STORAGE_REQUIRED_TABLES.length) {
    return "foundation_missing";
  }

  if (input.missingTables.length > 0) {
    return "foundation_partial";
  }

  if (input.migrationHistoryStatus !== "ready") {
    return "migration_incomplete";
  }

  if (input.integrityIssues.length > 0) {
    return "integrity_invalid";
  }

  return "ready";
}

function buildReadinessSummary(input: {
  state: AuthStorageReadinessState;
  missingTables: AuthStorageRequiredTable[];
  integrityIssues: AuthStorageIntegrityIssue[];
  migrationHistory: AuthStorageMigrationHistory;
}) {
  switch (input.state) {
    case "ready":
      return "Storage de autenticacao pronto: fundacao, historico de migrations e integridade de IDs estao coerentes.";
    case "foundation_missing":
      return input.migrationHistory.status === "ready"
        ? "As migrations obrigatorias da auth constam como aplicadas, mas a fundacao do schema nao existe neste ambiente. Trate como drift ou rollout corrompido."
        : "A fundacao da auth ainda nao existe neste schema. Login e leitura de sessao devem permanecer bloqueados."
      ;
    case "foundation_partial":
      return input.migrationHistory.status === "ready"
        ? `As migrations obrigatorias da auth constam como aplicadas, mas o schema ficou parcial. Tabelas faltando: ${input.missingTables.join(", ")}.`
        : `A fundacao da auth esta parcial. Tabelas faltando: ${input.missingTables.join(", ")}.`
      ;
    case "migration_incomplete":
      switch (input.migrationHistory.status) {
        case "history_unavailable":
          return "As tabelas de auth existem, mas o historico _prisma_migrations nao esta disponivel para provar rollout confiavel deste schema.";
        case "required_failed":
          return `Uma ou mais migrations obrigatorias da auth falharam ou ficaram incompletas: ${input.migrationHistory.failedRequiredMigrations.join(", ")}.`;
        case "required_missing":
          return `O schema tem fundacao de auth, mas faltam migrations obrigatorias no historico: ${input.migrationHistory.missingRequiredMigrations.join(", ")}.`;
        default:
          return "O rollout de migrations da auth esta incompleto para este ambiente.";
      }
    case "integrity_invalid":
      return `A fundacao da auth existe, mas os IDs persistidos ainda violam o contrato exigido por JWT/session: ${input.integrityIssues
        .map((issue) => `${issue.checkId}=${issue.invalidCount}`)
        .join(", ")}.`;
  }
}

function buildCorrectiveActions(input: {
  state: AuthStorageReadinessState;
  migrationHistory: AuthStorageMigrationHistory;
}) {
  const actions: string[] = [];

  switch (input.state) {
    case "foundation_missing":
    case "foundation_partial":
      actions.push("Rode `pnpm prisma:migrate:deploy` neste ambiente.");
      if (input.migrationHistory.status === "ready") {
        actions.push(
          "Se o historico de migrations ja aparece como aplicado, trate o schema como divergente/corrompido e reprovisione ou restaure o banco antes de liberar login.",
        );
      }
      break;
    case "migration_incomplete":
      actions.push("Rode `pnpm prisma:migrate:deploy` neste ambiente.");
      if (input.migrationHistory.status === "required_failed") {
        actions.push(
          "Inspecione `_prisma_migrations.logs` e a migration que falhou antes de tentar login novamente.",
        );
      }
      if (input.migrationHistory.status === "history_unavailable") {
        actions.push(
          "Nao aceite este schema como pronto sem `_prisma_migrations`; recupere um banco provisionado por migrations versionadas.",
        );
      }
      break;
    case "integrity_invalid":
      actions.push(
        "Rode `pnpm prisma:migrate:deploy` para garantir aplicacao do reparo/guardrail de integridade da auth.",
      );
      actions.push(
        "Rode `pnpm auth:storage:check` novamente; se os residuos invalidos persistirem, trate o ambiente como corrompido e nao libere login.",
      );
      break;
    case "ready":
      return actions;
  }

  actions.push("Rode `pnpm auth:storage:check` e confirme estado `ready`.");
  actions.push(
    "Se o objetivo for login local por `development_credentials`, rode `pnpm db:seed` depois das migrations.",
  );

  return actions;
}

function finalizeAuthStorageReadinessReport(
  input: AuthStorageInspectionBase,
): AuthStorageReadinessReport {
  const state = resolveReadinessState({
    missingTables: input.missingTables,
    integrityIssues: input.integrityIssues,
    migrationHistoryStatus: input.migrationHistory.status,
  });
  const stateMismatchReasons = buildMigrationHistoryMismatchReasons({
    status: input.migrationHistory.status,
    missingTables: input.missingTables,
    integrityIssues: input.integrityIssues,
  });
  const migrationHistory: AuthStorageMigrationHistory = {
    ...input.migrationHistory,
    stateMatchesStorage:
      input.migrationHistory.status === "ready" &&
      input.missingTables.length === 0 &&
      input.integrityIssues.length === 0,
    stateMismatchReasons,
  };

  return {
    ready: state === "ready",
    state,
    summary: buildReadinessSummary({
      state,
      missingTables: input.missingTables,
      integrityIssues: input.integrityIssues,
      migrationHistory,
    }),
    schemaName: input.schemaName,
    missingTables: input.missingTables,
    integrityIssues: input.integrityIssues,
    migrationHistory,
    correctiveActions: buildCorrectiveActions({
      state,
      migrationHistory,
    }),
    checkedAt: input.checkedAt,
  };
}

async function inspectMigrationHistory(input: {
  rawQueryDelegate: RawQueryDelegate;
  schemaName: string;
  migrationTablePresent: boolean;
}) {
  if (!input.migrationTablePresent) {
    return {
      tablePresent: false,
      status: "history_unavailable",
      appliedRequiredMigrations: [],
      missingRequiredMigrations: [...AUTH_STORAGE_REQUIRED_MIGRATIONS],
      failedRequiredMigrations: [],
    } satisfies AuthStorageInspectionBase["migrationHistory"];
  }

  const migrationRows = await input.rawQueryDelegate.$queryRaw<RawMigrationRow[]>(
    Prisma.sql`
      SELECT
        "migration_name" AS "migrationName",
        "finished_at" AS "finishedAt",
        "rolled_back_at" AS "rolledBackAt"
      FROM ${buildMigrationTableReference(input.schemaName)}
      WHERE "migration_name" IN (${Prisma.join(AUTH_STORAGE_REQUIRED_MIGRATIONS)})
    `,
  );

  const finishedMigrationNames = new Set(
    migrationRows
      .filter((row) => row.finishedAt && !row.rolledBackAt)
      .map((row) => row.migrationName),
  );
  const failedMigrationNames = new Set(
    migrationRows
      .filter((row) => !row.finishedAt || row.rolledBackAt)
      .map((row) => row.migrationName),
  );
  const appliedRequiredMigrations = AUTH_STORAGE_REQUIRED_MIGRATIONS.filter(
    (migrationName) => finishedMigrationNames.has(migrationName),
  );
  const failedRequiredMigrations = AUTH_STORAGE_REQUIRED_MIGRATIONS.filter(
    (migrationName) => failedMigrationNames.has(migrationName),
  );
  const missingRequiredMigrations = AUTH_STORAGE_REQUIRED_MIGRATIONS.filter(
    (migrationName) =>
      !finishedMigrationNames.has(migrationName) &&
      !failedMigrationNames.has(migrationName),
  );
  const status: AuthStorageMigrationHistoryStatus =
    failedRequiredMigrations.length > 0
      ? "required_failed"
      : missingRequiredMigrations.length > 0
        ? "required_missing"
        : "ready";

  return {
    tablePresent: true,
    status,
    appliedRequiredMigrations,
    missingRequiredMigrations,
    failedRequiredMigrations,
  } satisfies AuthStorageInspectionBase["migrationHistory"];
}

export function buildAuthStorageReadinessError(
  report: AuthStorageReadinessReport,
) {
  let code = "AUTH_STORAGE_NOT_READY";
  let message =
    "Storage de autenticacao do MapIA nao esta pronto para operar. Aplique as migrations de auth antes de executar login ou validar sessao.";

  if (report.state === "migration_incomplete") {
    code = "AUTH_STORAGE_MIGRATION_INCOMPLETE";
    message =
      "O rollout de migrations obrigatorias da auth esta incompleto neste ambiente. Corrija o historico de migrations antes de executar login ou validar sessao.";
  }

  if (report.state === "integrity_invalid") {
    code = "AUTH_STORAGE_INTEGRITY_INVALID";
    message =
      "A integridade do storage de autenticacao do MapIA esta invalida neste ambiente. Repare os IDs persistidos antes de executar login ou validar sessao.";
  }

  return new AppError(message, {
    code,
    status: 503,
    details: {
      state: report.state,
      summary: report.summary,
      schemaName: report.schemaName,
      missingTables: report.missingTables,
      integrityIssues: report.integrityIssues,
      migrationHistory: report.migrationHistory,
      correctiveActions: report.correctiveActions,
      checkedAt: report.checkedAt,
    },
  });
}

export function isAuthStorageMissingTableError(error: unknown): boolean {
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
  return AUTH_STORAGE_REQUIRED_TABLES.some((tableName) => {
    return (
      message.includes(tableName) &&
      (message.includes("does not exist") || message.includes("doesn't exist"))
    );
  });
}

export function normalizeAuthStorageError(error: unknown) {
  if (isAppError(error)) {
    return error;
  }

  if (!isAuthStorageMissingTableError(error)) {
    return error;
  }

  return buildAuthStorageReadinessError(
    finalizeAuthStorageReadinessReport({
      schemaName: resolveDatabaseSchema(),
      missingTables: [...AUTH_STORAGE_REQUIRED_TABLES],
      integrityIssues: [],
      migrationHistory: {
        tablePresent: false,
        status: "history_unavailable",
        appliedRequiredMigrations: [],
        missingRequiredMigrations: [...AUTH_STORAGE_REQUIRED_MIGRATIONS],
        failedRequiredMigrations: [],
      },
      checkedAt: new Date().toISOString(),
    }),
  );
}

export async function inspectAuthStorageReadiness(
  options: InspectAuthStorageReadinessOptions = {},
): Promise<AuthStorageReadinessReport> {
  const databaseUrl = options.databaseUrl ?? getServerEnv().DATABASE_URL;
  const schemaName = resolveDatabaseSchema(databaseUrl);
  const cacheKey = databaseUrl ?? `schema:${schemaName}`;
  const now = options.now ?? Date.now();
  const useCache = options.useCache ?? true;

  if (
    useCache &&
    readinessCache &&
    readinessCache.cacheKey === cacheKey &&
    readinessCache.expiresAt > now
  ) {
    return readinessCache.report;
  }

  const rawQueryDelegate = options.rawQueryDelegate ?? prisma;
  const tableRows = await rawQueryDelegate.$queryRaw<Array<{ tableName: string }>>(
    Prisma.sql`
      SELECT "table_name" AS "tableName"
      FROM information_schema.tables
      WHERE table_schema = ${schemaName}
        AND table_name IN (${Prisma.join([
          ...AUTH_STORAGE_REQUIRED_TABLES,
          AUTH_STORAGE_MIGRATIONS_TABLE,
        ])})
    `,
  );

  const presentTables = new Set(
    tableRows
      .map((row) => row.tableName)
      .filter((tableName): tableName is AuthStorageRequiredTable =>
        AUTH_STORAGE_REQUIRED_TABLES.includes(
          tableName as AuthStorageRequiredTable,
        ),
      ),
  );
  const missingTables = normalizeMissingTables(presentTables);
  const migrationHistory = await inspectMigrationHistory({
    rawQueryDelegate,
    schemaName,
    migrationTablePresent: tableRows.some(
      (row) => row.tableName === AUTH_STORAGE_MIGRATIONS_TABLE,
    ),
  });
  let integrityIssues: AuthStorageIntegrityIssue[] = [];

  if (missingTables.length === 0) {
    const integrityRows = await rawQueryDelegate.$queryRaw<
      Array<{ checkId: string; invalidCount: number }>
    >(
      Prisma.sql`
        SELECT *
        FROM (
          SELECT
            'app_users.id' AS "checkId",
            COUNT(*)::int AS "invalidCount"
          FROM "app_users"
          WHERE "id"::text !~* ${AUTH_STORAGE_UUID_PATTERN}
          UNION ALL
          SELECT
            'auth_identities.id' AS "checkId",
            COUNT(*)::int AS "invalidCount"
          FROM "auth_identities"
          WHERE "id"::text !~* ${AUTH_STORAGE_UUID_PATTERN}
          UNION ALL
          SELECT
            'auth_identities.userId' AS "checkId",
            COUNT(*)::int AS "invalidCount"
          FROM "auth_identities"
          WHERE "userId"::text !~* ${AUTH_STORAGE_UUID_PATTERN}
          UNION ALL
          SELECT
            'workspace_memberships.id' AS "checkId",
            COUNT(*)::int AS "invalidCount"
          FROM "workspace_memberships"
          WHERE "id"::text !~* ${AUTH_STORAGE_UUID_PATTERN}
          UNION ALL
          SELECT
            'workspace_memberships.userId' AS "checkId",
            COUNT(*)::int AS "invalidCount"
          FROM "workspace_memberships"
          WHERE "userId"::text !~* ${AUTH_STORAGE_UUID_PATTERN}
        ) AS "integrity"
        WHERE "invalidCount" > 0
      `,
    );

    integrityIssues = integrityRows.map((row) => ({
      checkId: row.checkId,
      invalidCount: Number(row.invalidCount),
    }));
  }

  const report = finalizeAuthStorageReadinessReport({
    schemaName,
    missingTables,
    integrityIssues,
    migrationHistory,
    checkedAt: new Date(now).toISOString(),
  });

  if (useCache) {
    readinessCache = {
      cacheKey,
      expiresAt: now + AUTH_STORAGE_CACHE_TTL_MS,
      report,
    };
  }

  return report;
}

export async function assertAuthStorageReady(
  options: InspectAuthStorageReadinessOptions = {},
) {
  try {
    const report = await inspectAuthStorageReadiness(options);

    if (!report.ready) {
      throw buildAuthStorageReadinessError(report);
    }

    return report;
  } catch (error) {
    throw normalizeAuthStorageError(error);
  }
}

export function resetAuthStorageReadinessCacheForTests() {
  readinessCache = null;
}
