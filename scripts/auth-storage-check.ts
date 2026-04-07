import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getServerEnv } from "@/src/lib/env";
import {
  AUTH_STORAGE_REQUIRED_MIGRATIONS,
  AUTH_STORAGE_REQUIRED_TABLES,
  inspectAuthStorageReadiness,
} from "@/src/server/auth/auth-storage-readiness";
import { resolveAuthRuntimeConfig } from "@/src/server/auth/auth-runtime";

function loadRootEnvFile(fileName: string) {
  const envPath = resolve(process.cwd(), fileName);

  if (!existsSync(envPath)) {
    return false;
  }

  const content = readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }

  return true;
}

function loadRootEnv() {
  const loadedFiles: string[] = [];

  for (const fileName of [".env.local", ".env"]) {
    if (loadRootEnvFile(fileName)) {
      loadedFiles.push(fileName);
    }
  }

  return loadedFiles;
}

function hasFlag(flag: string) {
  return process.argv.slice(2).includes(flag);
}

async function main() {
  const loadedFiles = loadRootEnv();
  const jsonMode = hasFlag("--json");
  const env = getServerEnv();
  const runtime = resolveAuthRuntimeConfig(env);
  const report = await inspectAuthStorageReadiness({
    databaseUrl: env.DATABASE_URL,
  });

  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          ready: report.ready,
          state: report.state,
          summary: report.summary,
          runtimeMode: runtime.mode,
          schemaName: report.schemaName,
          missingTables: report.missingTables,
          integrityIssues: report.integrityIssues,
          migrationHistory: report.migrationHistory,
          correctiveActions: report.correctiveActions,
          requiredTables: AUTH_STORAGE_REQUIRED_TABLES,
          requiredMigrations: AUTH_STORAGE_REQUIRED_MIGRATIONS,
          loadedEnvFiles: loadedFiles,
        },
        null,
        2,
      ),
    );
  } else {
    console.log("Auth storage check");
    console.log(`Ready: ${report.ready ? "yes" : "no"}`);
    console.log(`State: ${report.state}`);
    console.log(`Summary: ${report.summary}`);
    console.log(`Runtime: ${runtime.mode}`);
    console.log(`Schema: ${report.schemaName}`);
    console.log(
      `Env carregado: ${loadedFiles.length > 0 ? loadedFiles.join(", ") : "nenhum arquivo (somente process.env)"}`,
    );
    console.log(`Required tables: ${AUTH_STORAGE_REQUIRED_TABLES.join(", ")}`);
    console.log(
      `Required migrations: ${AUTH_STORAGE_REQUIRED_MIGRATIONS.join(", ")}`,
    );
    console.log(
      `Missing tables: ${report.missingTables.length > 0 ? report.missingTables.join(", ") : "none"}`,
    );
    console.log(
      `Integrity issues: ${report.integrityIssues.length > 0 ? report.integrityIssues.map((issue) => `${issue.checkId}=${issue.invalidCount}`).join(", ") : "none"}`,
    );
    console.log(`Migration history: ${report.migrationHistory.status}`);
    console.log(
      `Applied required migrations: ${report.migrationHistory.appliedRequiredMigrations.length > 0 ? report.migrationHistory.appliedRequiredMigrations.join(", ") : "none"}`,
    );
    console.log(
      `Missing required migrations: ${report.migrationHistory.missingRequiredMigrations.length > 0 ? report.migrationHistory.missingRequiredMigrations.join(", ") : "none"}`,
    );
    console.log(
      `Failed required migrations: ${report.migrationHistory.failedRequiredMigrations.length > 0 ? report.migrationHistory.failedRequiredMigrations.join(", ") : "none"}`,
    );
    console.log(
      `Migration/storage mismatch: ${report.migrationHistory.stateMismatchReasons.length > 0 ? report.migrationHistory.stateMismatchReasons.join(" | ") : "none"}`,
    );

    if (!report.ready) {
      console.log("Acoes corretivas sugeridas (PowerShell):");
      report.correctiveActions.forEach((action, index) => {
        console.log(`  ${index + 1}. ${action}`);
      });
      console.log(
        `  ${report.correctiveActions.length + 1}. Se o ambiente local estiver descartavel: pnpm db:reset-local`,
      );
    }
  }

  if (!report.ready) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
