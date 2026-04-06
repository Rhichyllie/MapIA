import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  getApiSessionIdentity: vi.fn(),
  createServerUseCases: vi.fn(),
}));

vi.mock("@/src/server/auth/api-session", () => ({
  getApiSessionIdentity: routeMocks.getApiSessionIdentity,
}));

vi.mock("@/src/server/app/container", () => ({
  createServerUseCases: routeMocks.createServerUseCases,
}));

import { POST } from "@/app/api/projects/[projectId]/semantic/validate/route";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";
const actorUserId = "11111111-1111-4111-8111-111111111111";

function createContext() {
  return {
    params: Promise.resolve({ projectId }),
  };
}

function createRequest(body: unknown) {
  return new Request("http://localhost/api/projects/x/semantic/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
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
            role: "viewer",
            createdAt: new Date("2026-04-02T10:00:00.000Z"),
            updatedAt: new Date("2026-04-02T10:00:00.000Z"),
          },
        }),
      },
    },
    semantics: {
      validateDraft: {
        execute: vi.fn().mockResolvedValue({
          issues: [],
          counters: {
            total: 0,
            nodes: 0,
            edges: 0,
            graph: 0,
          },
          bySeverity: {
            error: 0,
            warning: 0,
          },
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
});

describe("POST /api/projects/[projectId]/semantic/validate", () => {
  it("returns 400 with standardized validation code for invalid payload", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await POST(
      createRequest({ snapshot: {} }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: "VALIDATION_ERROR",
      code: "VALIDATION_ERROR",
    });
    expect(useCases.semantics.validateDraft.execute).not.toHaveBeenCalled();
  });

  it("returns the semantic validation envelope on success", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await POST(
      createRequest({
        mode: "operational",
        snapshot: {
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(useCases.semantics.validateDraft.execute).toHaveBeenCalledWith({
      projectId,
      actorIdentity: "owner@mapia.local",
      mode: "operational",
      snapshot: {
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    });
    expect(body).toMatchObject({
      data: {
        validation: {
          counters: {
            total: 0,
          },
        },
      },
    });
  });
});
