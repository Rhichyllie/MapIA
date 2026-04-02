import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("internal observability access", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv(
      "INTERNAL_OBSERVABILITY_ALLOWED_IDENTITIES",
      "ops@mapia.local,internal@mapia.local",
    );
    vi.stubEnv("DEV_LOGIN_EMAIL", "admin@mapia.local");
    vi.resetModules();
  });

  it("allows identities configured in allowlist", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { canAccessInternalObservability } =
      await import("./internal-observability-access");
    expect(canAccessInternalObservability("ops@mapia.local")).toBe(true);
    expect(canAccessInternalObservability("internal@mapia.local")).toBe(true);
  });

  it("allows dev admin bypass only in non-production environments", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { canAccessInternalObservability } =
      await import("./internal-observability-access");
    expect(canAccessInternalObservability("admin@mapia.local")).toBe(true);

    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const { canAccessInternalObservability: inProd } =
      await import("./internal-observability-access");
    expect(inProd("admin@mapia.local")).toBe(false);
  });

  it("allows controlled dev admin bypass in test environment", async () => {
    vi.stubEnv("INTERNAL_OBSERVABILITY_ALLOWED_IDENTITIES", "");
    vi.stubEnv("NODE_ENV", "test");
    const { canAccessInternalObservability } =
      await import("./internal-observability-access");
    expect(canAccessInternalObservability("admin@mapia.local")).toBe(true);
  });

  it("denies identities outside allowlist", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { canAccessInternalObservability } =
      await import("./internal-observability-access");
    expect(canAccessInternalObservability("user@mapia.local")).toBe(false);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });
});
