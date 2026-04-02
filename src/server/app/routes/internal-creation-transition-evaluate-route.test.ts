import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  getApiSessionIdentity: vi.fn(),
  resolveInternalObservabilityAccess: vi.fn(),
  evaluateCreationTransitionGateWarnings: vi.fn(),
  recordCreationTransitionSnapshotAccessed: vi.fn(),
  recordCreationTransitionSnapshotAccessDenied: vi.fn(),
}));

vi.mock("@/src/server/auth/api-session", () => ({
  getApiSessionIdentity: routeMocks.getApiSessionIdentity,
}));

vi.mock("@/src/server/auth/internal-observability-access", () => ({
  resolveInternalObservabilityAccess:
    routeMocks.resolveInternalObservabilityAccess,
}));

vi.mock(
  "@/src/server/observability/creation-assistant-transition-telemetry",
  () => ({
    buildCreationTelemetryContextFromRequest: vi.fn().mockReturnValue({}),
    evaluateCreationTransitionGateWarnings:
      routeMocks.evaluateCreationTransitionGateWarnings,
    recordCreationTransitionSnapshotAccessed:
      routeMocks.recordCreationTransitionSnapshotAccessed,
    recordCreationTransitionSnapshotAccessDenied:
      routeMocks.recordCreationTransitionSnapshotAccessDenied,
  }),
);

import { POST } from "@/app/api/internal/observability/creation-transition/evaluate/route";

describe("POST /api/internal/observability/creation-transition/evaluate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.evaluateCreationTransitionGateWarnings.mockResolvedValue(
      undefined,
    );
  });

  it("returns 401 for unauthenticated requests", async () => {
    routeMocks.getApiSessionIdentity.mockResolvedValue(null);
    const response = await POST(
      new Request(
        "http://localhost/api/internal/observability/creation-transition/evaluate",
        { method: "POST" },
      ),
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 for non-internal identities and audits denied access", async () => {
    routeMocks.getApiSessionIdentity.mockResolvedValue({
      identity: "user@mapia.local",
      session: { user: { email: "user@mapia.local" } },
    });
    routeMocks.resolveInternalObservabilityAccess.mockReturnValue({
      allowed: false,
      role: "user",
      reason: "forbidden",
    });

    const response = await POST(
      new Request(
        "http://localhost/api/internal/observability/creation-transition/evaluate",
        { method: "POST" },
      ),
    );

    expect(response.status).toBe(403);
    expect(
      routeMocks.evaluateCreationTransitionGateWarnings,
    ).not.toHaveBeenCalled();
    expect(
      routeMocks.recordCreationTransitionSnapshotAccessDenied,
    ).toHaveBeenCalledTimes(1);
  });

  it("evaluates gates for internal identities", async () => {
    routeMocks.getApiSessionIdentity.mockResolvedValue({
      identity: "ops@mapia.local",
      session: { user: { email: "ops@mapia.local" } },
    });
    routeMocks.resolveInternalObservabilityAccess.mockReturnValue({
      allowed: true,
      role: "internal",
      reason: "allowlist",
    });

    const response = await POST(
      new Request(
        "http://localhost/api/internal/observability/creation-transition/evaluate",
        { method: "POST" },
      ),
    );
    const payload = (await response.json()) as {
      data?: { evaluatedAt?: string };
    };

    expect(response.status).toBe(200);
    expect(
      routeMocks.evaluateCreationTransitionGateWarnings,
    ).toHaveBeenCalledTimes(1);
    expect(
      routeMocks.recordCreationTransitionSnapshotAccessed,
    ).toHaveBeenCalledTimes(1);
    expect(payload.data?.evaluatedAt).toEqual(expect.any(String));
  });
});
