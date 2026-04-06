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

import { PUT } from "@/app/api/projects/[projectId]/nodes/[nodeId]/route";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";
const nodeId = "2749f7f9-dab9-4ae9-8f97-95c06f5e4468";
const actorUserId = "11111111-1111-4111-8111-111111111111";

function createContext() {
  return {
    params: Promise.resolve({ projectId, nodeId }),
  };
}

function createRequest(body: unknown) {
  return new Request("http://localhost/api/projects/x/nodes/y", {
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
            role: "member",
            createdAt: new Date("2026-04-02T10:00:00.000Z"),
            updatedAt: new Date("2026-04-02T10:00:00.000Z"),
          },
        }),
      },
    },
    editor: {
      applyCommand: {
        execute: vi.fn().mockResolvedValue({
          projectId,
          revision: 2,
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
    userId: actorUserId,
    actor: {
      userId: actorUserId,
      email: "dev@mapia.local",
      providerId: "credentials",
      authMode: "development_credentials",
    },
    session: {
      user: {
        id: actorUserId,
        email: "dev@mapia.local",
        authProvider: "credentials",
        authMode: "development_credentials",
      },
    },
  });
});

describe("PUT /api/projects/[projectId]/nodes/[nodeId]", () => {
  it("returns 409 repair required with plan and violations", async () => {
    const useCases = createUseCasesMock();
    useCases.editor.applyCommand.execute.mockRejectedValueOnce(
      new AppError("Alteracao exige reparo semantico antes de aplicar.", {
        code: "REPAIR_REQUIRED",
        status: 409,
        details: {
          repairPlan: {
            summary: "Plano de reparo: 1 relacao(oes) removida(s).",
            actions: [
              {
                type: "removeEdge",
                edgeId: "2b0939fb-29e8-4334-a986-f5b848ef6034",
              },
            ],
          },
          violations: [
            {
              code: "EDGE_INVALID_AFTER_NODE_KIND_CHANGE",
              severity: "error",
              message: "A relacao ficaria invalida.",
            },
          ],
        },
      }),
    );
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await PUT(
      createRequest({
        patch: {
          kind: "entity",
        },
      }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      error: "REPAIR_REQUIRED",
      code: "REPAIR_REQUIRED",
      repairPlan: expect.objectContaining({
        actions: [
          expect.objectContaining({
            type: "removeEdge",
          }),
        ],
      }),
      violations: [
        expect.objectContaining({
          code: "EDGE_INVALID_AFTER_NODE_KIND_CHANGE",
        }),
      ],
    });
  });
});
