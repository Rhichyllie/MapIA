import { describe, expect, it, vi } from "vitest";
import {
  parseCreationTransitionRetentionCleanupArgs,
  runCreationTransitionRetentionCleanup,
} from "./creation-transition-retention-cleanup";

describe("creation transition retention cleanup", () => {
  it("parses args with dry-run, retention class filter and before override", () => {
    const parsed = parseCreationTransitionRetentionCleanupArgs([
      "--dry-run=true",
      "--retention-class=short_30d,long_365d",
      "--before=2026-08-01T00:00:00.000Z",
    ]);

    expect(parsed.dryRun).toBe(true);
    expect(parsed.retentionClasses).toEqual(["short_30d", "long_365d"]);
    expect(parsed.before?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("requires explicit confirmation token for execute mode", () => {
    expect(() =>
      parseCreationTransitionRetentionCleanupArgs([
        "--dry-run=false",
        "--retention-class=standard_90d",
      ]),
    ).toThrow("Execucao real exige confirmacao explicita");

    const parsed = parseCreationTransitionRetentionCleanupArgs([
      "--dry-run=false",
      "--confirm=execute",
      "--retention-class=standard_90d",
    ]);
    expect(parsed.dryRun).toBe(false);
  });

  it("rejects contradictory before and days-override arguments", () => {
    expect(() =>
      parseCreationTransitionRetentionCleanupArgs([
        "--before=2026-08-01T00:00:00.000Z",
        "--days-override=45",
      ]),
    ).toThrow("Parametros contraditorios");
  });

  it("runs dry-run without deleting rows and emits structured totals", async () => {
    const delegate = {
      count: vi.fn().mockResolvedValue(10),
      deleteMany: vi.fn().mockResolvedValue({ count: 10 }),
    };
    const result = await runCreationTransitionRetentionCleanup(
      delegate,
      {
        dryRun: true,
        retentionClasses: ["short_30d", "standard_90d"],
      },
      new Date("2026-09-01T00:00:00.000Z"),
    );

    expect(delegate.count).toHaveBeenCalledTimes(2);
    expect(delegate.deleteMany).not.toHaveBeenCalled();
    expect(result.totals.affectedCount).toBe(20);
    expect(result.totals.deletedCount).toBe(0);
  });

  it("runs execute mode and deletes candidates for selected classes only", async () => {
    const delegate = {
      count: vi.fn().mockResolvedValue(7),
      deleteMany: vi.fn().mockResolvedValue({ count: 7 }),
    };
    const result = await runCreationTransitionRetentionCleanup(
      delegate,
      {
        dryRun: false,
        retentionClasses: ["long_365d"],
      },
      new Date("2026-09-01T00:00:00.000Z"),
    );

    expect(delegate.count).toHaveBeenCalledTimes(1);
    expect(delegate.deleteMany).toHaveBeenCalledTimes(1);
    expect(result.policies).toHaveLength(1);
    expect(result.policies[0]?.retentionClass).toBe("long_365d");
    expect(result.totals.deletedCount).toBe(7);
  });
});
