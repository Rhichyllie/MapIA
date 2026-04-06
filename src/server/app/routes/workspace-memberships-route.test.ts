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

import { GET, PUT } from "@/app/api/workspaces/[workspaceId]/memberships/route";

const workspaceId = "58f3ca26-085e-4237-80d9-adcc42f7142b";
const actorUserId = "11111111-1111-4111-8111-111111111111";

function createContext() {
  return {
    params: Promise.resolve({ workspaceId }),
  };
}

function createRequest(body: unknown) {
  return new Request("http://localhost/api/workspaces/x/memberships", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
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
            createdAt: new Date("2026-04-02T10:00:00.000Z"),
            updatedAt: new Date("2026-04-02T10:00:00.000Z"),
          },
          membership: {
            id: "22222222-2222-4222-8222-222222222222",
            workspaceId,
            userId: actorUserId,
            role: "owner",
            createdAt: new Date("2026-04-02T10:00:00.000Z"),
            updatedAt: new Date("2026-04-02T10:00:00.000Z"),
          },
        }),
      },
      listWorkspaceMemberships: {
        execute: vi.fn().mockResolvedValue([
          {
            id: "33333333-3333-4333-8333-333333333333",
            workspaceId,
            userId: actorUserId,
            role: "owner",
            userEmail: "owner@mapia.local",
            userDisplayName: "Owner",
            userActive: true,
            createdAt: new Date("2026-04-02T10:00:00.000Z"),
            updatedAt: new Date("2026-04-02T10:00:00.000Z"),
          },
        ]),
      },
      upsertWorkspaceMembership: {
        execute: vi.fn().mockResolvedValue({
          workspace: {
            id: workspaceId,
            slug: "ws-mapia",
            name: "MapIA Workspace",
            ownerIdentity: "owner@mapia.local",
            createdAt: new Date("2026-04-02T10:00:00.000Z"),
            updatedAt: new Date("2026-04-02T10:00:00.000Z"),
          },
          membership: {
            id: "44444444-4444-4444-8444-444444444444",
            workspaceId,
            userId: "55555555-5555-4555-8555-555555555555",
            role: "admin",
            createdAt: new Date("2026-04-02T10:00:00.000Z"),
            updatedAt: new Date("2026-04-02T10:00:00.000Z"),
          },
          user: {
            id: "55555555-5555-4555-8555-555555555555",
            email: "admin@cliente.com",
            emailNormalized: "admin@cliente.com",
            displayName: "Cliente Admin",
            active: true,
            createdAt: new Date("2026-04-02T10:00:00.000Z"),
            updatedAt: new Date("2026-04-02T10:00:00.000Z"),
          },
          previousMembership: null,
          changeKind: "created",
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
      expires: "2099-01-01T00:00:00.000Z",
      user: {
        id: actorUserId,
        email: "owner@mapia.local",
        authProvider: "credentials",
        authMode: "development_credentials",
      },
    },
  });
});

describe("workspace memberships route", () => {
  it("returns 401 when there is no authenticated session", async () => {
    routeMocks.getApiSessionIdentity.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("http://localhost/api/workspaces/x/memberships"),
      createContext(),
    );

    expect(response.status).toBe(401);
    expect(routeMocks.createServerUseCases).not.toHaveBeenCalled();
  });

  it("returns 200 and lists memberships for admin-capable actors", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await GET(
      new Request("http://localhost/api/workspaces/x/memberships"),
      createContext(),
    );
    const payload = (await response.json()) as {
      data?: { memberships?: Array<{ role: string; userEmail: string }> };
    };

    expect(response.status).toBe(200);
    expect(useCases.workspaces.getWorkspaceAccess.execute).toHaveBeenCalledWith(
      {
        actorUserId,
        workspaceId,
        minimumRole: "admin",
      },
    );
    expect(
      useCases.workspaces.listWorkspaceMemberships.execute,
    ).toHaveBeenCalledWith({
      actorUserId,
      workspaceId,
    });
    expect(payload.data?.memberships).toEqual([
      expect.objectContaining({
        role: "owner",
        userEmail: "owner@mapia.local",
      }),
    ]);
  });

  it("returns 403 when actor lacks owner role to change memberships", async () => {
    const useCases = createUseCasesMock();
    useCases.workspaces.getWorkspaceAccess.execute.mockRejectedValueOnce(
      new AppError("Permissao insuficiente para este workspace.", {
        code: "WORKSPACE_FORBIDDEN",
        status: 403,
      }),
    );
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await PUT(
      createRequest({
        memberEmail: "admin@cliente.com",
        role: "admin",
      }),
      createContext(),
    );

    expect(response.status).toBe(403);
    expect(
      useCases.workspaces.upsertWorkspaceMembership.execute,
    ).not.toHaveBeenCalled();
  });

  it("upserts a workspace membership and audits the change", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await PUT(
      createRequest({
        memberEmail: "admin@cliente.com",
        role: "admin",
        memberDisplayName: "Cliente Admin",
      }),
      createContext(),
    );
    const payload = (await response.json()) as {
      data?: {
        membership?: { role: string };
        member?: { email: string; displayName: string | null };
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
      useCases.workspaces.upsertWorkspaceMembership.execute,
    ).toHaveBeenCalledWith({
      actorUserId,
      workspaceId,
      memberEmail: "admin@cliente.com",
      role: "admin",
      memberDisplayName: "Cliente Admin",
    });
    expect(routeMocks.recordServerAuditEvent).toHaveBeenCalledWith({
      workspaceId,
      entityType: "workspace",
      entityId: workspaceId,
      action: "updated",
      actorUserId,
      actorIdentity: "owner@mapia.local",
      payload: {
        route: "PUT /api/workspaces/[workspaceId]/memberships",
        actorRole: "owner",
        previousRole: null,
        changeKind: "created",
        selfTarget: false,
        memberUserId: "55555555-5555-4555-8555-555555555555",
        memberEmail: "admin@cliente.com",
        assignedRole: "admin",
      },
    });
    expect(payload.data?.membership?.role).toBe("admin");
    expect(payload.data?.member).toEqual({
      email: "admin@cliente.com",
      displayName: "Cliente Admin",
      id: "55555555-5555-4555-8555-555555555555",
      active: true,
    });
  });

  it("returns 409 when the route blocks downgrading the last owner", async () => {
    const useCases = createUseCasesMock();
    useCases.workspaces.upsertWorkspaceMembership.execute.mockRejectedValueOnce(
      new AppError("Nao e permitido rebaixar o ultimo owner do workspace.", {
        code: "WORKSPACE_LAST_OWNER_PROTECTED",
        status: 409,
      }),
    );
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await PUT(
      createRequest({
        memberEmail: "owner@mapia.local",
        role: "admin",
      }),
      createContext(),
    );
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(409);
    expect(payload.code).toBe("WORKSPACE_LAST_OWNER_PROTECTED");
    expect(routeMocks.recordServerAuditEvent).not.toHaveBeenCalled();
  });
});
