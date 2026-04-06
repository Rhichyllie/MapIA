import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError } from "@/src/lib/app-error";
import type { ServerUseCases } from "@/src/server/app/container";

const mocks = vi.hoisted(() => ({
  getApiSessionIdentity: vi.fn(),
  recordServerAuditEvent: vi.fn(),
}));

vi.mock("@/src/server/auth/api-session", () => ({
  getApiSessionIdentity: mocks.getApiSessionIdentity,
}));

vi.mock("@/src/server/audit/server-audit", () => ({
  recordServerAuditEvent: mocks.recordServerAuditEvent,
}));

import {
  requireAuthenticatedApiRequest,
  requireProjectAccessForApi,
  requireProjectRouteContext,
  requireWorkspaceAccessForApi,
} from "@/src/server/app/api-route-guards";

describe("api-route-guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws standardized unauthorized error when api session is missing", async () => {
    mocks.getApiSessionIdentity.mockResolvedValue(null);

    await expect(requireAuthenticatedApiRequest()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
  });

  it("returns the authenticated api session when present", async () => {
    mocks.getApiSessionIdentity.mockResolvedValue({
      identity: "owner@mapia.local",
      userId: "11111111-1111-4111-8111-111111111111",
      actor: {
        userId: "11111111-1111-4111-8111-111111111111",
        email: "owner@mapia.local",
        providerId: "credentials",
        authMode: "development_credentials",
      },
      session: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          email: "owner@mapia.local",
          authProvider: "credentials",
          authMode: "development_credentials",
        },
      },
    });

    await expect(requireAuthenticatedApiRequest()).resolves.toMatchObject({
      identity: "owner@mapia.local",
    });
  });

  it("rejects authenticated sessions without internal userId claims", async () => {
    mocks.getApiSessionIdentity.mockResolvedValue({
      identity: "owner@mapia.local",
      actor: {
        userId: "",
        email: "owner@mapia.local",
        providerId: "credentials",
        authMode: "development_credentials",
      },
      session: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          id: "",
          email: "owner@mapia.local",
          authProvider: "credentials",
          authMode: "development_credentials",
        },
      },
    });

    await expect(requireAuthenticatedApiRequest()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
      message: "Sessao autenticada sem claims utilizaveis.",
    });
  });

  it("records denied audit on project access failure", async () => {
    const useCases = {
      projects: {
        getProjectAccess: {
          execute: vi.fn().mockRejectedValue(
            new AppError("Projeto nao encontrado.", {
              code: "PROJECT_NOT_FOUND",
              status: 404,
            }),
          ),
        },
      },
    } as unknown as Pick<ServerUseCases, "projects">;

    await expect(
      requireProjectAccessForApi({
        route: "GET /api/projects/[projectId]/editor-snapshot",
        projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        minimumRole: "viewer",
        auth: {
          identity: "owner@mapia.local",
          userId: "11111111-1111-4111-8111-111111111111",
          actor: {
            userId: "11111111-1111-4111-8111-111111111111",
            email: "owner@mapia.local",
            providerId: "credentials",
            authMode: "development_credentials",
          },
          session: {
            expires: "2099-01-01T00:00:00.000Z",
            user: {
              id: "11111111-1111-4111-8111-111111111111",
              email: "owner@mapia.local",
              authProvider: "credentials",
              authMode: "development_credentials",
            },
          },
        },
        useCases,
      }),
    ).rejects.toMatchObject({
      code: "PROJECT_NOT_FOUND",
      status: 404,
    });

    expect(mocks.recordServerAuditEvent).toHaveBeenCalledWith({
      projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
      entityType: "project",
      entityId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
      action: "denied",
      actorUserId: "11111111-1111-4111-8111-111111111111",
      actorIdentity: "owner@mapia.local",
      payload: {
        route: "GET /api/projects/[projectId]/editor-snapshot",
        reason: "PROJECT_NOT_FOUND",
        requiredRole: "viewer",
      },
    });
  });

  it("resolves workspace access without depending on legacy ownerIdentity", async () => {
    const useCases = {
      workspaces: {
        getWorkspaceAccess: {
          execute: vi.fn().mockResolvedValue({
            workspace: {
              id: "7c96ab95-fd65-48b7-bb8d-7402c0dd92e2",
              slug: "ws-mapia",
              name: "MapIA Workspace",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            membership: {
              id: "22222222-2222-4222-8222-222222222222",
              workspaceId: "7c96ab95-fd65-48b7-bb8d-7402c0dd92e2",
              userId: "11111111-1111-4111-8111-111111111111",
              role: "owner",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          }),
        },
      },
    } as unknown as Pick<ServerUseCases, "workspaces">;

    const result = await requireWorkspaceAccessForApi({
      route: "GET /api/workspaces/[workspaceId]/memberships",
      workspaceId: "7c96ab95-fd65-48b7-bb8d-7402c0dd92e2",
      minimumRole: "admin",
      auth: {
        identity: "owner@mapia.local",
        userId: "11111111-1111-4111-8111-111111111111",
        actor: {
          userId: "11111111-1111-4111-8111-111111111111",
          email: "owner@mapia.local",
          providerId: "oidc",
          authMode: "oidc",
        },
        session: {
          expires: "2099-01-01T00:00:00.000Z",
          user: {
            id: "11111111-1111-4111-8111-111111111111",
            email: "owner@mapia.local",
            authProvider: "oidc",
            authMode: "oidc",
          },
        },
      },
      useCases,
    });

    expect(result.workspace).toMatchObject({
      id: "7c96ab95-fd65-48b7-bb8d-7402c0dd92e2",
      name: "MapIA Workspace",
    });
    expect(result.workspace.ownerIdentity).toBeUndefined();
    expect(mocks.recordServerAuditEvent).not.toHaveBeenCalled();
  });

  it("resolves auth, params and project in one step for project routes", async () => {
    mocks.getApiSessionIdentity.mockResolvedValue({
      identity: "owner@mapia.local",
      userId: "11111111-1111-4111-8111-111111111111",
      actor: {
        userId: "11111111-1111-4111-8111-111111111111",
        email: "owner@mapia.local",
        providerId: "credentials",
        authMode: "development_credentials",
      },
      session: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          email: "owner@mapia.local",
          authProvider: "credentials",
          authMode: "development_credentials",
        },
      },
    });
    const project = {
      id: "58f3ca26-085e-4237-80d9-adcc42f7142b",
      workspaceId: "7c96ab95-fd65-48b7-bb8d-7402c0dd92e2",
    };
    const useCases = {
      projects: {
        getProjectAccess: {
          execute: vi.fn().mockResolvedValue({
            project,
            membership: {
              id: "22222222-2222-4222-8222-222222222222",
              workspaceId: "7c96ab95-fd65-48b7-bb8d-7402c0dd92e2",
              userId: "11111111-1111-4111-8111-111111111111",
              role: "member",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          }),
        },
      },
    } as unknown as Pick<ServerUseCases, "projects">;

    const result = await requireProjectRouteContext({
      route: "GET /api/projects/[projectId]/editor-snapshot",
      params: Promise.resolve({ projectId: project.id }),
      paramsSchema: z.object({
        projectId: z.string().uuid(),
      }),
      minimumRole: "viewer",
      useCases,
    });

    expect(result).toMatchObject({
      auth: {
        identity: "owner@mapia.local",
        userId: "11111111-1111-4111-8111-111111111111",
      },
      params: { projectId: project.id },
      project,
      membership: { role: "member" },
    });
  });

  it("fails closed when protected project routes are wired without getProjectAccess", async () => {
    mocks.getApiSessionIdentity.mockResolvedValue({
      identity: "owner@mapia.local",
      userId: "11111111-1111-4111-8111-111111111111",
      actor: {
        userId: "11111111-1111-4111-8111-111111111111",
        email: "owner@mapia.local",
        providerId: "credentials",
        authMode: "development_credentials",
      },
      session: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          email: "owner@mapia.local",
          authProvider: "credentials",
          authMode: "development_credentials",
        },
      },
    });

    await expect(
      requireProjectAccessForApi({
        route: "GET /api/projects/[projectId]/editor-snapshot",
        projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        minimumRole: "viewer",
        auth: {
          identity: "owner@mapia.local",
          userId: "11111111-1111-4111-8111-111111111111",
          actor: {
            userId: "11111111-1111-4111-8111-111111111111",
            email: "owner@mapia.local",
            providerId: "credentials",
            authMode: "development_credentials",
          },
          session: {
            expires: "2099-01-01T00:00:00.000Z",
            user: {
              id: "11111111-1111-4111-8111-111111111111",
              email: "owner@mapia.local",
              authProvider: "credentials",
              authMode: "development_credentials",
            },
          },
        },
        useCases: {
          projects: {},
        } as unknown as Pick<ServerUseCases, "projects">,
      }),
    ).rejects.toMatchObject({
      code: "PROJECT_ACCESS_GUARD_MISSING",
      status: 500,
    });
  });
});
