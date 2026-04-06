import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/src/lib/app-error";

const routeMocks = vi.hoisted(() => ({
  getApiSessionIdentity: vi.fn(),
  createServerUseCases: vi.fn(),
  recordServerAuditEvent: vi.fn(),
}));

vi.mock("@/src/server/auth/api-session", () => ({
  getApiSessionIdentity: routeMocks.getApiSessionIdentity,
}));

vi.mock("@/src/server/app/container", () => ({
  createServerUseCases: routeMocks.createServerUseCases,
}));

vi.mock("@/src/server/audit/server-audit", () => ({
  recordServerAuditEvent: routeMocks.recordServerAuditEvent,
}));

import { DELETE } from "@/app/api/workspaces/[workspaceId]/memberships/[memberUserId]/route";

const workspaceId = "58f3ca26-085e-4237-80d9-adcc42f7142b";
const actorUserId = "11111111-1111-4111-8111-111111111111";
const memberUserId = "55555555-5555-4555-8555-555555555555";

function createContext() {
  return {
    params: Promise.resolve({ workspaceId, memberUserId }),
  };
}

function createUseCasesMock() {
  return {
    workspaces: {
      getWorkspaceAccess: {
        execute: vi.fn().mockResolvedValue({
          workspace: {
            id: workspaceId,
            slug: "ws-mapia",
            name: "MapIA Workspace",
            ownerIdentity: "owner@mapia.local",
            createdAt: new Date("2026-04-06T10:00:00.000Z"),
            updatedAt: new Date("2026-04-06T10:00:00.000Z"),
          },
          membership: {
            id: "22222222-2222-4222-8222-222222222222",
            workspaceId,
            userId: actorUserId,
            role: "owner",
            createdAt: new Date("2026-04-06T10:00:00.000Z"),
            updatedAt: new Date("2026-04-06T10:00:00.000Z"),
          },
        }),
      },
      removeWorkspaceMembership: {
        execute: vi.fn().mockResolvedValue({
          workspace: {
            id: workspaceId,
            slug: "ws-mapia",
            name: "MapIA Workspace",
            ownerIdentity: "owner@mapia.local",
            createdAt: new Date("2026-04-06T10:00:00.000Z"),
            updatedAt: new Date("2026-04-06T10:00:00.000Z"),
          },
          removedMembership: {
            id: "44444444-4444-4444-8444-444444444444",
            workspaceId,
            userId: memberUserId,
            role: "admin",
            createdAt: new Date("2026-04-06T10:00:00.000Z"),
            updatedAt: new Date("2026-04-06T10:00:00.000Z"),
          },
          removedUser: {
            id: memberUserId,
            email: "admin@cliente.com",
            emailNormalized: "admin@cliente.com",
            displayName: "Cliente Admin",
            active: true,
            createdAt: new Date("2026-04-06T10:00:00.000Z"),
            updatedAt: new Date("2026-04-06T10:00:00.000Z"),
          },
          actorMembership: {
            id: "22222222-2222-4222-8222-222222222222",
            workspaceId,
            userId: actorUserId,
            role: "owner",
            createdAt: new Date("2026-04-06T10:00:00.000Z"),
            updatedAt: new Date("2026-04-06T10:00:00.000Z"),
          },
          selfTarget: false,
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
      providerId: "oidc",
      authMode: "oidc",
    },
    session: {
      expires: "2099-01-01T00:00:00.000Z",
      user: {
        id: actorUserId,
        email: "owner@mapia.local",
        authProvider: "oidc",
        authMode: "oidc",
      },
    },
  });
});

describe("workspace membership delete route", () => {
  it("returns 401 when there is no authenticated session", async () => {
    routeMocks.getApiSessionIdentity.mockResolvedValueOnce(null);

    const response = await DELETE(
      new Request("http://localhost/api/workspaces/x/memberships/y", {
        method: "DELETE",
      }),
      createContext(),
    );

    expect(response.status).toBe(401);
    expect(routeMocks.createServerUseCases).not.toHaveBeenCalled();
  });

  it("returns 403 when actor lacks owner role to revoke memberships", async () => {
    const useCases = createUseCasesMock();
    useCases.workspaces.getWorkspaceAccess.execute.mockRejectedValueOnce(
      new AppError("Permissao insuficiente para este workspace.", {
        code: "WORKSPACE_FORBIDDEN",
        status: 403,
      }),
    );
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await DELETE(
      new Request("http://localhost/api/workspaces/x/memberships/y", {
        method: "DELETE",
      }),
      createContext(),
    );

    expect(response.status).toBe(403);
    expect(
      useCases.workspaces.removeWorkspaceMembership.execute,
    ).not.toHaveBeenCalled();
  });

  it("returns 404 when the target membership does not exist", async () => {
    const useCases = createUseCasesMock();
    useCases.workspaces.removeWorkspaceMembership.execute.mockRejectedValueOnce(
      new AppError("Membership nao encontrado para este workspace.", {
        code: "WORKSPACE_MEMBERSHIP_NOT_FOUND",
        status: 404,
      }),
    );
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await DELETE(
      new Request("http://localhost/api/workspaces/x/memberships/y", {
        method: "DELETE",
      }),
      createContext(),
    );
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(404);
    expect(payload.code).toBe("WORKSPACE_MEMBERSHIP_NOT_FOUND");
    expect(routeMocks.recordServerAuditEvent).not.toHaveBeenCalled();
  });

  it("returns 409 when the route blocks removal of the last owner", async () => {
    const useCases = createUseCasesMock();
    useCases.workspaces.removeWorkspaceMembership.execute.mockRejectedValueOnce(
      new AppError("Nao e permitido remover o ultimo owner do workspace.", {
        code: "WORKSPACE_LAST_OWNER_PROTECTED",
        status: 409,
      }),
    );
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await DELETE(
      new Request("http://localhost/api/workspaces/x/memberships/y", {
        method: "DELETE",
      }),
      createContext(),
    );
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(409);
    expect(payload.code).toBe("WORKSPACE_LAST_OWNER_PROTECTED");
    expect(routeMocks.recordServerAuditEvent).not.toHaveBeenCalled();
  });

  it("revokes a membership and audits the change", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await DELETE(
      new Request("http://localhost/api/workspaces/x/memberships/y", {
        method: "DELETE",
      }),
      createContext(),
    );
    const payload = (await response.json()) as {
      data?: {
        removedMembership?: { role: string };
        removedMember?: { email: string; displayName: string | null };
      };
    };

    expect(response.status).toBe(200);
    expect(useCases.workspaces.getWorkspaceAccess.execute).toHaveBeenCalledWith(
      {
        actorUserId,
        workspaceId,
        minimumRole: "owner",
      },
    );
    expect(
      useCases.workspaces.removeWorkspaceMembership.execute,
    ).toHaveBeenCalledWith({
      actorUserId,
      workspaceId,
      memberUserId,
    });
    expect(routeMocks.recordServerAuditEvent).toHaveBeenCalledWith({
      workspaceId,
      entityType: "workspace",
      entityId: workspaceId,
      action: "updated",
      actorUserId,
      actorIdentity: "owner@mapia.local",
      payload: {
        route:
          "DELETE /api/workspaces/[workspaceId]/memberships/[memberUserId]",
        actorRole: "owner",
        changeKind: "revoked",
        selfTarget: false,
        removedUserId: memberUserId,
        removedUserEmail: "admin@cliente.com",
        removedRole: "admin",
      },
    });
    expect(payload.data?.removedMembership?.role).toBe("admin");
    expect(payload.data?.removedMember).toEqual({
      id: memberUserId,
      email: "admin@cliente.com",
      displayName: "Cliente Admin",
      active: true,
    });
  });
});
