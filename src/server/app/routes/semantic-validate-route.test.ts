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
      getOwnedProject: {
        execute: vi.fn().mockResolvedValue({
          id: projectId,
          workspaceId: "7c96ab95-fd65-48b7-bb8d-7402c0dd92e2",
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
    session: { user: { email: "owner@mapia.local" } },
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
