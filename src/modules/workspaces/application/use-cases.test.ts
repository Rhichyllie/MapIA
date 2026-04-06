import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "@/src/modules/workspaces/application";

const authUserStoreMocks = vi.hoisted(() => ({
  findAppUserById: vi.fn(),
  upsertAppUserByEmail: vi.fn(),
}));

vi.mock("@/src/server/auth/auth-user-store", () => ({
  findAppUserById: authUserStoreMocks.findAppUserById,
  upsertAppUserByEmail: authUserStoreMocks.upsertAppUserByEmail,
}));

import { RemoveWorkspaceMembershipUseCase } from "./use-cases";

const workspaceId = "58f3ca26-085e-4237-80d9-adcc42f7142b";
const actorUserId = "11111111-1111-4111-8111-111111111111";
const otherOwnerUserId = "22222222-2222-4222-8222-222222222222";

function createWorkspaceRepositoryMock(): WorkspaceRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(async () => ({
      id: workspaceId,
      slug: "ws-mapia",
      name: "MapIA Workspace",
      ownerIdentity: "owner@mapia.local",
      createdAt: new Date("2026-04-06T10:00:00.000Z"),
      updatedAt: new Date("2026-04-06T10:00:00.000Z"),
    })),
    findBySlug: vi.fn(async () => null),
    findByUserId: vi.fn(async () => []),
    findMembership: vi.fn(async (_workspaceId: string, userId: string) =>
      userId === actorUserId
        ? {
            id: "33333333-3333-4333-8333-333333333333",
            workspaceId,
            userId: actorUserId,
            role: "owner" as const,
            createdAt: new Date("2026-04-06T10:00:00.000Z"),
            updatedAt: new Date("2026-04-06T10:00:00.000Z"),
          }
        : null,
    ),
    listMemberships: vi.fn(async () => []),
    upsertMembership: vi.fn(),
    removeMembership: vi.fn(async () => ({
      id: "44444444-4444-4444-8444-444444444444",
      workspaceId,
      userId: otherOwnerUserId,
      role: "owner" as const,
      createdAt: new Date("2026-04-06T10:00:00.000Z"),
      updatedAt: new Date("2026-04-06T10:00:00.000Z"),
    })),
  };
}

describe("RemoveWorkspaceMembershipUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authUserStoreMocks.findAppUserById.mockResolvedValue({
      id: otherOwnerUserId,
      email: "other-owner@mapia.local",
      emailNormalized: "other-owner@mapia.local",
      displayName: "Other Owner",
      active: true,
      createdAt: new Date("2026-04-06T10:00:00.000Z"),
      updatedAt: new Date("2026-04-06T10:00:00.000Z"),
    });
  });

  it("revokes a membership and resolves the removed user for audit/response", async () => {
    const workspaceRepository = createWorkspaceRepositoryMock();
    const useCase = new RemoveWorkspaceMembershipUseCase({
      workspaceRepository,
    });

    const result = await useCase.execute({
      actorUserId,
      workspaceId,
      memberUserId: otherOwnerUserId,
    });

    expect(workspaceRepository.removeMembership).toHaveBeenCalledWith({
      workspaceId,
      actorUserId,
      userId: otherOwnerUserId,
    });
    expect(result.selfTarget).toBe(false);
    expect(result.removedUser).toMatchObject({
      email: "other-owner@mapia.local",
    });
  });

  it("marks self-removal explicitly when the actor revokes their own membership", async () => {
    const workspaceRepository = createWorkspaceRepositoryMock();
    workspaceRepository.removeMembership = vi.fn(async () => ({
      id: "44444444-4444-4444-8444-444444444444",
      workspaceId,
      userId: actorUserId,
      role: "owner" as const,
      createdAt: new Date("2026-04-06T10:00:00.000Z"),
      updatedAt: new Date("2026-04-06T10:00:00.000Z"),
    }));
    authUserStoreMocks.findAppUserById.mockResolvedValueOnce({
      id: actorUserId,
      email: "owner@mapia.local",
      emailNormalized: "owner@mapia.local",
      displayName: "Owner",
      active: true,
      createdAt: new Date("2026-04-06T10:00:00.000Z"),
      updatedAt: new Date("2026-04-06T10:00:00.000Z"),
    });
    const useCase = new RemoveWorkspaceMembershipUseCase({
      workspaceRepository,
    });

    const result = await useCase.execute({
      actorUserId,
      workspaceId,
      memberUserId: actorUserId,
    });

    expect(result.selfTarget).toBe(true);
  });

  it("returns 404 when the target membership does not exist", async () => {
    const workspaceRepository = createWorkspaceRepositoryMock();
    workspaceRepository.removeMembership = vi.fn(async () => null);
    const useCase = new RemoveWorkspaceMembershipUseCase({
      workspaceRepository,
    });

    await expect(
      useCase.execute({
        actorUserId,
        workspaceId,
        memberUserId: otherOwnerUserId,
      }),
    ).rejects.toMatchObject({
      code: "WORKSPACE_MEMBERSHIP_NOT_FOUND",
      status: 404,
    });
  });

  it("requires owner role to revoke memberships", async () => {
    const workspaceRepository = createWorkspaceRepositoryMock();
    workspaceRepository.findMembership = vi.fn(async () => ({
      id: "33333333-3333-4333-8333-333333333333",
      workspaceId,
      userId: actorUserId,
      role: "admin" as const,
      createdAt: new Date("2026-04-06T10:00:00.000Z"),
      updatedAt: new Date("2026-04-06T10:00:00.000Z"),
    }));
    const useCase = new RemoveWorkspaceMembershipUseCase({
      workspaceRepository,
    });

    await expect(
      useCase.execute({
        actorUserId,
        workspaceId,
        memberUserId: otherOwnerUserId,
      }),
    ).rejects.toMatchObject({
      code: "WORKSPACE_FORBIDDEN",
      status: 403,
    });
  });
});
