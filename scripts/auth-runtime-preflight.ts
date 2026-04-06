import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getServerEnv } from "@/src/lib/env";
import { inspectAuthRuntimeReadiness } from "@/src/server/auth/auth-runtime-readiness";

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

function formatStatus(status: "pass" | "fail" | "skip") {
  return status.toUpperCase().padEnd(4, " ");
}

async function main() {
  const loadedFiles = loadRootEnv();
  const jsonMode = hasFlag("--json");
  const skipDiscovery = hasFlag("--skip-discovery");
  const env = getServerEnv();
  const report = await inspectAuthRuntimeReadiness({
    env,
    probeOidcDiscovery: !skipDiscovery,
  });

  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          ready: report.ready,
          runtime: report.runtime,
          discovery: report.discovery,
          checks: report.checks,
          loadedEnvFiles: loadedFiles,
        },
        null,
        2,
      ),
    );
  } else {
    console.log("Auth runtime preflight");
    console.log(`Ready: ${report.ready ? "yes" : "no"}`);
    console.log(`Runtime: ${report.runtime.mode}`);
    console.log(
      `Env carregado: ${loadedFiles.length > 0 ? loadedFiles.join(", ") : "nenhum arquivo (somente process.env)"}`,
    );

    for (const check of report.checks) {
      console.log(
        `${formatStatus(check.status)} [${check.severity}] ${check.id} :: ${check.message}`,
      );
    }

    console.log(
      `${formatStatus(report.discovery.status)} [required] oidc_discovery :: ${report.discovery.message}`,
    );

    if (report.discovery.url) {
      console.log(`Discovery URL: ${report.discovery.url}`);
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
