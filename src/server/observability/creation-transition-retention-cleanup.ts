export type CreationTelemetryRetentionClass =
  | "short_30d"
  | "standard_90d"
  | "long_365d";

export type CreationTransitionRetentionCleanupOptions = {
  dryRun: boolean;
  retentionClasses: CreationTelemetryRetentionClass[];
  before?: Date;
  daysOverride?: number;
};

export type CreationTransitionRetentionPolicy = {
  retentionClass: CreationTelemetryRetentionClass;
  days: number;
};

export const CREATION_TRANSITION_RETENTION_POLICIES: CreationTransitionRetentionPolicy[] =
  [
    { retentionClass: "short_30d", days: 30 },
    { retentionClass: "standard_90d", days: 90 },
    { retentionClass: "long_365d", days: 365 },
  ];

type CleanupDelegate = {
  count(args: { where: { retentionClass: CreationTelemetryRetentionClass; emittedAt: { lt: Date } } }): Promise<number>;
  deleteMany(args: { where: { retentionClass: CreationTelemetryRetentionClass; emittedAt: { lt: Date } } }): Promise<{ count: number }>;
};

export type CreationTransitionRetentionCleanupResult = {
  dryRun: boolean;
  executedAt: string;
  retentionClasses: CreationTelemetryRetentionClass[];
  before?: string;
  daysOverride?: number;
  policies: Array<{
    retentionClass: CreationTelemetryRetentionClass;
    cutoffIso: string;
    affectedCount: number;
    deletedCount: number;
  }>;
  totals: {
    affectedCount: number;
    deletedCount: number;
  };
};

function parseBoolean(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Argumento invalido para --dry-run: ${value}`);
}

function parsePositiveInt(value: string, name: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Argumento invalido para ${name}: ${value}`);
  }
  return parsed;
}

function parseDateIso(value: string, name: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Argumento invalido para ${name}: ${value}`);
  }
  return parsed;
}

function parseRetentionClasses(value: string) {
  if (value === "all") {
    return CREATION_TRANSITION_RETENTION_POLICIES.map(
      (policy) => policy.retentionClass,
    );
  }
  const requested = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean) as CreationTelemetryRetentionClass[];
  const allowed = new Set(
    CREATION_TRANSITION_RETENTION_POLICIES.map((policy) => policy.retentionClass),
  );
  requested.forEach((entry) => {
    if (!allowed.has(entry)) {
      throw new Error(`Retention class invalida: ${entry}`);
    }
  });
  return [...new Set(requested)];
}

export function parseCreationTransitionRetentionCleanupArgs(
  argv: string[],
): CreationTransitionRetentionCleanupOptions {
  const dryRunArg = argv.find((arg) => arg.startsWith("--dry-run="));
  const retentionClassArg = argv.find((arg) =>
    arg.startsWith("--retention-class="),
  );
  const beforeArg = argv.find((arg) => arg.startsWith("--before="));
  const daysOverrideArg = argv.find((arg) =>
    arg.startsWith("--days-override="),
  );
  const confirmArg = argv.find((arg) => arg.startsWith("--confirm="));

  if (beforeArg && daysOverrideArg) {
    throw new Error(
      "Parametros contraditorios: use apenas um entre --before e --days-override.",
    );
  }

  const dryRun = dryRunArg ? parseBoolean(dryRunArg.split("=")[1] ?? "true") : true;
  const confirmValue = confirmArg?.split("=")[1]?.trim();

  if (!dryRun && confirmValue !== "execute") {
    throw new Error(
      "Execucao real exige confirmacao explicita: --confirm=execute.",
    );
  }

  return {
    dryRun,
    retentionClasses: retentionClassArg
      ? parseRetentionClasses(retentionClassArg.split("=")[1] ?? "all")
      : CREATION_TRANSITION_RETENTION_POLICIES.map((policy) => policy.retentionClass),
    ...(beforeArg
      ? { before: parseDateIso(beforeArg.split("=")[1] ?? "", "--before") }
      : {}),
    ...(daysOverrideArg
      ? {
          daysOverride: parsePositiveInt(
            daysOverrideArg.split("=")[1] ?? "",
            "--days-override",
          ),
        }
      : {}),
  };
}

function buildCutoffDate(input: {
  now: Date;
  policyDays: number;
  before?: Date;
  daysOverride?: number;
}) {
  if (input.before) {
    return input.before;
  }
  const days = input.daysOverride ?? input.policyDays;
  return new Date(input.now.getTime() - days * 24 * 60 * 60 * 1000);
}

export async function runCreationTransitionRetentionCleanup(
  delegate: CleanupDelegate,
  options: CreationTransitionRetentionCleanupOptions,
  now = new Date(),
): Promise<CreationTransitionRetentionCleanupResult> {
  const selectedPolicies = CREATION_TRANSITION_RETENTION_POLICIES.filter((policy) =>
    options.retentionClasses.includes(policy.retentionClass),
  );
  const policies: CreationTransitionRetentionCleanupResult["policies"] = [];

  for (const policy of selectedPolicies) {
    const cutoff = buildCutoffDate({
      now,
      policyDays: policy.days,
      before: options.before,
      daysOverride: options.daysOverride,
    });
    const where = {
      retentionClass: policy.retentionClass,
      emittedAt: {
        lt: cutoff,
      },
    } as const;

    const affectedCount = await delegate.count({ where });
    if (options.dryRun) {
      policies.push({
        retentionClass: policy.retentionClass,
        cutoffIso: cutoff.toISOString(),
        affectedCount,
        deletedCount: 0,
      });
      continue;
    }

    const deleted = await delegate.deleteMany({ where });
    policies.push({
      retentionClass: policy.retentionClass,
      cutoffIso: cutoff.toISOString(),
      affectedCount,
      deletedCount: deleted.count,
    });
  }

  return {
    dryRun: options.dryRun,
    executedAt: now.toISOString(),
    retentionClasses: options.retentionClasses,
    ...(options.before ? { before: options.before.toISOString() } : {}),
    ...(options.daysOverride ? { daysOverride: options.daysOverride } : {}),
    policies,
    totals: {
      affectedCount: policies.reduce((acc, current) => acc + current.affectedCount, 0),
      deletedCount: policies.reduce((acc, current) => acc + current.deletedCount, 0),
    },
  };
}
