import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/src/lib/app-error";

const routeMocks = vi.hoisted(() => ({
  getApiSessionIdentity: vi.fn(),
  createServerUseCases: vi.fn(),
  withServerTelemetrySpan: vi.fn(),
}));

vi.mock("@/src/server/auth/api-session", () => ({
  getApiSessionIdentity: routeMocks.getApiSessionIdentity,
}));

vi.mock("@/src/server/app/container", () => ({
  createServerUseCases: routeMocks.createServerUseCases,
}));

vi.mock("@/src/server/observability/server-telemetry", () => ({
  withServerTelemetrySpan: routeMocks.withServerTelemetrySpan,
}));

import { GET, PUT } from "@/app/api/projects/[projectId]/semantic/policy/route";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";
const actorUserId = "11111111-1111-4111-8111-111111111111";

function createContext() {
  return {
    params: Promise.resolve({ projectId }),
  };
}

function createRequest(body?: unknown) {
  return new Request("http://localhost/api/projects/x/semantic/policy", {
    method: body ? "PUT" : "GET",
    headers: body
      ? {
          "content-type": "application/json",
        }
      : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function createUseCasesMock() {
  return {
    projects: {
      getProjectAccess: {
        execute: vi.fn().mockResolvedValue({
          project: {
            id: projectId,
            workspaceId: "7c96ab95-fd65-48b7-bb8d-7402c0dd92e2",
          },
          membership: {
            id: "22222222-2222-4222-8222-222222222222",
            workspaceId: "7c96ab95-fd65-48b7-bb8d-7402c0dd92e2",
            userId: actorUserId,
            role: "admin",
            createdAt: new Date("2026-04-02T10:00:00.000Z"),
            updatedAt: new Date("2026-04-02T10:00:00.000Z"),
          },
        }),
      },
    },
    semantics: {
      getOrCreatePolicy: {
        execute: vi.fn().mockResolvedValue({
          id: "policy-1",
          projectId,
          diagramType: "erd",
          strictEnabled: true,
          enforceOnServer: true,
          allowTechOverride: false,
          requireOverrideReason: true,
          version: 1,
        }),
      },
      updatePolicy: {
        execute: vi.fn().mockResolvedValue({
          id: "policy-1",
          projectId,
          diagramType: "erd",
          strictEnabled: false,
          enforceOnServer: true,
          allowTechOverride: true,
          requireOverrideReason: true,
          version: 2,
        }),
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  routeMocks.getApiSessionIdentity.mockResolvedValue({
    identity: "owner@mapia.local",
    userId: actorUserId,
    actor: {
      userId: actorUserId,
      email: "owner@mapia.local",
      providerId: "credentials",
      authMode: "development_credentials",
    },
    session: {
      user: {
        id: actorUserId,
        email: "owner@mapia.local",
        authProvider: "credentials",
        authMode: "development_credentials",
      },
    },
  });
  routeMocks.withServerTelemetrySpan.mockImplementation(
    async (
      _name: string,
      _options: unknown,
      callback: (span: { setAttribute: ReturnType<typeof vi.fn> }) => unknown,
    ) => callback({ setAttribute: vi.fn() }),
  );
});

describe("semantic policy routes", () => {
  it("returns 401 with standardized code when there is no authenticated session", async () => {
    routeMocks.getApiSessionIdentity.mockResolvedValueOnce(null);

    const response = await GET(createRequest(), createContext());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      error: "UNAUTHORIZED",
      code: "UNAUTHORIZED",
    });
  });

  it("returns ownership failure before updating policy", async () => {
    const useCases = createUseCasesMock();
    useCases.projects.getProjectAccess.execute.mockRejectedValueOnce(
      new AppError("Projeto nao encontrado.", {
        code: "PROJECT_NOT_FOUND",
        status: 404,
      }),
    );
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await PUT(
      createRequest({
        strictEnabled: false,
      }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      error: "PROJECT_NOT_FOUND",
      code: "PROJECT_NOT_FOUND",
    });
    expect(useCases.semantics.updatePolicy.execute).not.toHaveBeenCalled();
  });

  it("returns the current semantic policy envelope", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await GET(createRequest(), createContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(useCases.semantics.getOrCreatePolicy.execute).toHaveBeenCalledWith({
      projectId,
      actorIdentity: "owner@mapia.local",
    });
    expect(body).toMatchObject({
      data: {
        policy: {
          id: "policy-1",
          strictEnabled: true,
        },
      },
    });
  });
});
