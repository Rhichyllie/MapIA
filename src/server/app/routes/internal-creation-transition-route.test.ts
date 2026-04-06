import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  getApiSessionIdentity: vi.fn(),
  resolveInternalObservabilityAccess: vi.fn(),
  getCreationTransitionTelemetrySnapshot: vi.fn(),
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
    getCreationTransitionTelemetrySnapshot:
      routeMocks.getCreationTransitionTelemetrySnapshot,
    evaluateCreationTransitionGateWarnings:
      routeMocks.evaluateCreationTransitionGateWarnings,
    recordCreationTransitionSnapshotAccessed:
      routeMocks.recordCreationTransitionSnapshotAccessed,
    recordCreationTransitionSnapshotAccessDenied:
      routeMocks.recordCreationTransitionSnapshotAccessDenied,
  }),
);

import { GET } from "@/app/api/internal/observability/creation-transition/route";

describe("GET /api/internal/observability/creation-transition", () => {
  const actorUserId = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.getCreationTransitionTelemetrySnapshot.mockResolvedValue({
      generatedAt: new Date().toISOString(),
    });
    routeMocks.evaluateCreationTransitionGateWarnings.mockResolvedValue(
      undefined,
    );
  });

  it("returns 401 for unauthenticated requests", async () => {
    routeMocks.getApiSessionIdentity.mockResolvedValue(null);
    const response = await GET(
      new Request(
        "http://localhost/api/internal/observability/creation-transition",
      ),
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 for non-internal identities and audits denied access", async () => {
    routeMocks.getApiSessionIdentity.mockResolvedValue({
      identity: "user@mapia.local",
      userId: actorUserId,
      actor: {
        userId: actorUserId,
        email: "user@mapia.local",
        providerId: "credentials",
        authMode: "development_credentials",
      },
      session: {
        user: {
          id: actorUserId,
          email: "user@mapia.local",
          authProvider: "credentials",
          authMode: "development_credentials",
        },
      },
    });
    routeMocks.resolveInternalObservabilityAccess.mockReturnValue({
      allowed: false,
      role: "user",
      reason: "forbidden",
    });

    const response = await GET(
      new Request(
        "http://localhost/api/internal/observability/creation-transition",
      ),
    );

    expect(response.status).toBe(403);
    expect(
      routeMocks.recordCreationTransitionSnapshotAccessDenied,
    ).toHaveBeenCalledTimes(1);
    expect(
      routeMocks.evaluateCreationTransitionGateWarnings,
    ).not.toHaveBeenCalled();
    expect(
      routeMocks.getCreationTransitionTelemetrySnapshot,
    ).not.toHaveBeenCalled();
  });

  it("returns snapshot for allowed identities and audits access", async () => {
    routeMocks.getApiSessionIdentity.mockResolvedValue({
      identity: "admin@mapia.local",
      userId: actorUserId,
      actor: {
        userId: actorUserId,
        email: "admin@mapia.local",
        providerId: "credentials",
        authMode: "development_credentials",
      },
      session: {
        user: {
          id: actorUserId,
          email: "admin@mapia.local",
          authProvider: "credentials",
          authMode: "development_credentials",
        },
      },
    });
    routeMocks.resolveInternalObservabilityAccess.mockReturnValue({
      allowed: true,
      role: "internal",
      reason: "allowlist",
    });

    const response = await GET(
      new Request(
        "http://localhost/api/internal/observability/creation-transition",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(
      routeMocks.recordCreationTransitionSnapshotAccessed,
    ).toHaveBeenCalledTimes(1);
    expect(
      routeMocks.evaluateCreationTransitionGateWarnings,
    ).not.toHaveBeenCalled();
    expect(body.data).toEqual(
      expect.objectContaining({
        generatedAt: expect.any(String),
      }),
    );
  });
});
