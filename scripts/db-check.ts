import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { PrismaClient } from "@prisma/client";

type DbTarget = {
  protocol: string;
  host: string;
  port: number;
  databasePath: string;
};

type CheckFailure = {
  ok?: false;
  stage: "env" | "tcp" | "prisma";
  message: string;
  details?: string[];
};

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

  // Prioridade local para refletir melhor o runtime do app em dev.
  for (const fileName of [".env.local", ".env"]) {
    if (loadRootEnvFile(fileName)) {
      loadedFiles.push(fileName);
    }
  }

  return loadedFiles;
}

function parseWaitMs() {
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--wait=")) {
      continue;
    }

    const value = Number(arg.slice("--wait=".length));

    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Valor invalido para --wait: ${arg}`);
    }

    return Math.trunc(value);
  }

  return 0;
}

function parseDatabaseTarget(databaseUrl: string): DbTarget {
  const parsedUrl = new URL(databaseUrl);
  const protocol = parsedUrl.protocol.replace(/:$/, "");

  if (!["postgresql", "postgres"].includes(protocol)) {
    throw new Error(
      `DATABASE_URL com protocolo inesperado (${protocol}). Esperado: postgres/postgresql.`,
    );
  }

  return {
    protocol,
    host: parsedUrl.hostname,
    port: parsedUrl.port ? Number(parsedUrl.port) : 5432,
    databasePath: parsedUrl.pathname || "/",
  };
}

function describeTarget(target: DbTarget) {
  return `${target.host}:${target.port}${target.databasePath}`;
}

async function probeTcp(host: string, port: number, timeoutMs: number) {
  return await new Promise<{ ok: true } | { ok: false; reason: string }>((resolveProbe) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (result: { ok: true } | { ok: false; reason: string }) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolveProbe(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ ok: true }));
    socket.once("timeout", () => finish({ ok: false, reason: `TIMEOUT (${timeoutMs}ms)` }));
    socket.once("error", (error) => {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : "SOCKET_ERROR";
      finish({ ok: false, reason: code });
    });
  });
}

async function probeTcpWithLocalhostFallback(target: DbTarget) {
  const firstAttempt = await probeTcp(target.host, target.port, 1_500);

  if (firstAttempt.ok || target.host !== "localhost") {
    return firstAttempt;
  }

  const fallbackAttempt = await probeTcp("127.0.0.1", target.port, 1_500);

  if (fallbackAttempt.ok) {
    return fallbackAttempt;
  }

  return {
    ok: false as const,
    reason: `${firstAttempt.reason}; fallback 127.0.0.1 -> ${fallbackAttempt.reason}`,
  };
}

function inspectDockerStatus() {
  const result = spawnSync("docker", ["ps", "--format", "{{.Names}}"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 4_000,
  });

  if (result.error) {
    return `Docker CLI indisponivel (${result.error.message})`;
  }

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    return stderr ? `Docker indisponivel (${stderr})` : "Docker indisponivel (exit != 0)";
  }

  const runningContainers = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return runningContainers.includes("mapia-postgres")
    ? "Container mapia-postgres em execucao"
    : "Container mapia-postgres nao esta em execucao";
}

function formatFailureOutput(
  failure: CheckFailure,
  target: DbTarget | null,
  loadedEnvFiles: string[],
  waitMs: number,
) {
  const lines: string[] = [];

  lines.push("Prisma db:check falhou.");

  if (target) {
    lines.push(`Target: ${describeTarget(target)} (${target.protocol})`);
  }

  lines.push(
    `Env carregado: ${loadedEnvFiles.length > 0 ? loadedEnvFiles.join(", ") : "nenhum arquivo (somente process.env)"}`,
  );

  if (waitMs > 0) {
    lines.push(`Modo wait: ${waitMs}ms`);
  }

  lines.push(`Etapa: ${failure.stage}`);
  lines.push(`Motivo: ${failure.message}`);

  for (const detail of failure.details ?? []) {
    lines.push(`Detalhe: ${detail}`);
  }

  if (failure.stage === "tcp") {
    lines.push(`Docker: ${inspectDockerStatus()}`);
  }

  lines.push("Acoes sugeridas (PowerShell):");
  lines.push("  1. Abra o Docker Desktop e aguarde o engine iniciar");
  lines.push("  2. pnpm db:up");
  lines.push("  3. pnpm prisma migrate deploy");
  lines.push("  4. pnpm db:check");

  return lines.join("\n");
}

async function runPrismaSelectOne() {
  const prisma = new PrismaClient();

  try {
    const result = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
    return result[0]?.ok ?? null;
  } finally {
    await prisma.$disconnect();
  }
}

async function runCheckOnce(
  target: DbTarget,
): Promise<{ ok: true; select1: number | null } | (CheckFailure & { ok: false })> {
  const tcp = await probeTcpWithLocalhostFallback(target);

  if (!tcp.ok) {
    return {
      ok: false,
      stage: "tcp",
      message: `Nao foi possivel abrir conexao TCP para ${target.host}:${target.port}`,
      details: [`probe=${tcp.reason}`],
    };
  }

  try {
    const select1 = await runPrismaSelectOne();
    return { ok: true, select1 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      stage: "prisma",
      message: "Prisma nao conseguiu executar SELECT 1",
      details: [message.split("\n").find(Boolean) ?? message],
    };
  }
}

async function main() {
  const waitMs = parseWaitMs();
  const loadedEnvFiles = loadRootEnv();

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      formatFailureOutput(
        {
          stage: "env",
          message: "DATABASE_URL nao encontrada (.env/.env.local/process.env).",
        },
        null,
        loadedEnvFiles,
        waitMs,
      ),
    );
  }

  let target: DbTarget;

  try {
    target = parseDatabaseTarget(databaseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      formatFailureOutput(
        {
          stage: "env",
          message: "DATABASE_URL invalida para o fluxo local/E2E",
          details: [message],
        },
        null,
        loadedEnvFiles,
        waitMs,
      ),
    );
  }

  const startedAt = Date.now();
  let attempts = 0;
  let lastFailure: CheckFailure | null = null;

  while (true) {
    attempts += 1;

    const result = await runCheckOnce(target);

    if (result.ok) {
      const elapsedMs = Date.now() - startedAt;
      console.log(
        `Prisma db:check OK -> ${describeTarget(target)} (SELECT 1 = ${result.select1 ?? "?"}; attempts=${attempts}; elapsed=${elapsedMs}ms)`,
      );
      return;
    }

    lastFailure = result;

    if (waitMs <= 0) {
      break;
    }

    const elapsedMs = Date.now() - startedAt;

    if (elapsedMs >= waitMs) {
      break;
    }

    if (attempts === 1) {
      console.log(
        `Prisma db:check aguardando DB ficar disponivel (${describeTarget(target)}; wait=${waitMs}ms)...`,
      );
    }

    await delay(1_000);
  }

  throw new Error(
    formatFailureOutput(
      lastFailure ?? { stage: "tcp", message: "Falha desconhecida" },
      target,
      loadedEnvFiles,
      waitMs,
    ),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
