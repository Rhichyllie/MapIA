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

import { POST } from "@/app/api/projects/[projectId]/edges/route";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";
const actorUserId = "11111111-1111-4111-8111-111111111111";

function createContext() {
  return {
    params: Promise.resolve({ projectId }),
  };
}

function createRequest(body: unknown) {
  return new Request("http://localhost/api/projects/x/edges", {
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

describe("POST /api/projects/[projectId]/edges", () => {
  it("returns 422 semantic violation with allowed/recommended edge kinds", async () => {
    const useCases = createUseCasesMock();
    useCases.editor.applyCommand.execute.mockRejectedValueOnce(
      new AppError("Relacao invalida para o diagrama atual.", {
        code: "SEMANTIC_VIOLATION",
        status: 422,
        details: {
          allowedEdgeKinds: ["depends-on"],
          recommendedEdgeKind: "depends-on",
          violations: [
            {
              code: "EDGE_KIND_NOT_ALLOWED",
              severity: "error",
              message: "Relacao nao permitida.",
            },
          ],
        },
      }),
    );
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await POST(
      createRequest({
        edge: {
          id: "d56ab4f1-67a4-49d9-996f-2957ecf67f07",
          sourceNodeId: "f4a2e869-b413-4f51-b9f7-0544f13c3a56",
          targetNodeId: "67f4ad44-6ec5-412d-b88a-5118f91ed2f2",
          kind: "contains",
          data: {},
        },
      }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      error: "SEMANTIC_VIOLATION",
      code: "SEMANTIC_VIOLATION",
      allowedEdgeKinds: ["depends-on"],
      recommendedEdgeKind: "depends-on",
      violations: [
        expect.objectContaining({
          code: "EDGE_KIND_NOT_ALLOWED",
        }),
      ],
    });
  });
});
