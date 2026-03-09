import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/src/lib/app-error";

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

import { PUT } from "@/app/api/projects/[projectId]/working-snapshot/route";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";

function createContext() {
  return {
    params: Promise.resolve({ projectId }),
  };
}

function createRequest(body: unknown) {
  return new Request("http://localhost/api/projects/x/working-snapshot", {
    method: "PUT",
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
        execute: vi.fn().mockResolvedValue(undefined),
      },
    },
    editor: {
      saveFullSnapshot: {
        execute: vi.fn().mockResolvedValue({
          projectId,
          revision: 3,
          snapshot: {
            nodes: [],
            edges: [],
            viewport: { x: 0, y: 0, zoom: 1 },
          },
        }),
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  routeMocks.getApiSessionIdentity.mockResolvedValue({
    identity: "dev@mapia.local",
    session: { user: { email: "dev@mapia.local" } },
  });
});

describe("PUT /api/projects/[projectId]/working-snapshot", () => {
  it("returns 409 conflict with current/expected revision payload", async () => {
    const useCases = createUseCasesMock();
    useCases.editor.saveFullSnapshot.execute.mockRejectedValueOnce(
      new AppError("Conflito de revisao: snapshot atual diferente da revisao esperada.", {
        code: "CONFLICT",
        status: 409,
        details: {
          currentRevision: 12,
          expectedRevision: 11,
        },
      }),
    );
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await PUT(
      createRequest({
        expectedRevision: 11,
        snapshot: {
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      error: "CONFLICT",
      code: "CONFLICT",
      currentRevision: 12,
      expectedRevision: 11,
    });
  });
});

