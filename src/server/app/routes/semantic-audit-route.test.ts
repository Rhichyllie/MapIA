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

import { POST } from "@/app/api/projects/[projectId]/semantic/audit/route";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";
const actorUserId = "11111111-1111-4111-8111-111111111111";

function createContext() {
  return {
    params: Promise.resolve({ projectId }),
  };
}

function createRequest(body: unknown) {
  return new Request("http://localhost/api/projects/x/semantic/audit", {
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
      auditWorkingSnapshot: {
        execute: vi.fn().mockResolvedValue({
          policy: {
            id: "policy-1",
            projectId,
            strictEnabled: true,
            enforceOnServer: true,
            allowTechOverride: false,
            requireOverrideReason: true,
            version: 1,
            updatedAt: new Date("2026-03-09T12:00:00.000Z"),
            createdAt: new Date("2026-03-09T12:00:00.000Z"),
          },
          issues: [
            {
              id: "issue-1",
              code: "NODE_KIND_OUT_OF_PROFILE",
              severity: "error",
              message: "No fora do perfil.",
              targetType: "node",
              targetId: "node-1",
            },
          ],
          counters: {
            total: 1,
            nodes: 1,
            edges: 0,
            graph: 0,
          },
          bySeverity: {
            error: 1,
            warning: 0,
          },
          snapshotRevision: 7,
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

describe("POST /api/projects/[projectId]/semantic/audit", () => {
  it("returns audit issues and summary from server-run audit", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await POST(
      createRequest({ mode: "operational" }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(
      useCases.semantics.auditWorkingSnapshot.execute,
    ).toHaveBeenCalledWith({
      projectId,
      actorIdentity: "dev@mapia.local",
      mode: "operational",
    });
    expect(body).toMatchObject({
      data: {
        audit: {
          issues: [
            expect.objectContaining({
              code: "NODE_KIND_OUT_OF_PROFILE",
            }),
          ],
          counters: {
            total: 1,
          },
          snapshotRevision: 7,
        },
      },
    });
  });
});
