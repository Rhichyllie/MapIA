import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("creation transition telemetry sanitizer", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXTAUTH_SECRET", "nextauth-secret-for-tests");
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
  });

  it("redacts sensitive keys and inline sensitive strings", async () => {
    const { sanitizeTelemetryValue } = await import(
      "./creation-transition-sanitizer"
    );
    const sanitized = sanitizeTelemetryValue({
      password: "super-secret",
      details:
        "postgresql://admin:admin123@localhost:5432/mapia?token=abc&api_key=123",
      nested: {
        authorization: "Bearer raw-token",
      },
    }) as Record<string, unknown>;

    expect(JSON.stringify(sanitized)).not.toContain("super-secret");
    expect(JSON.stringify(sanitized)).not.toContain("raw-token");
    expect(JSON.stringify(sanitized)).not.toContain("admin123");
    expect(JSON.stringify(sanitized)).toContain("***REDACTED***");
  });

  it("hashes actor identity with dedicated telemetry salt when available", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TELEMETRY_HASH_SALT", "telemetry-salt-12345");
    vi.resetModules();
    const { hashActorIdentity } = await import(
      "./creation-transition-sanitizer"
    );
    const first = hashActorIdentity("admin@mapia.local");
    const second = hashActorIdentity("admin@mapia.local");
    expect(first).toBe(second);
    expect(first).toBeDefined();
    expect(first).not.toContain("admin@mapia.local");
  });

  it("falls back only in non-production when telemetry salt is missing", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXTAUTH_SECRET", "nextauth-secret-for-tests");
    vi.resetModules();
    const { hashActorIdentity } = await import(
      "./creation-transition-sanitizer"
    );

    const fallbackHash = hashActorIdentity("admin@mapia.local");
    expect(fallbackHash).toBeDefined();

    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { hashActorIdentity: hashInProd } = await import(
      "./creation-transition-sanitizer"
    );
    expect(hashInProd("admin@mapia.local")).toBeUndefined();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });
});
