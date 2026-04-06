import { describe, expect, it } from "vitest";
import {
  assertWorkspaceMembershipRemovalAllowed,
  assertWorkspaceMembershipTransitionAllowed,
} from "./workspace-membership";

describe("workspace membership invariants", () => {
  it("blocks downgrading the last owner of a workspace", () => {
    try {
      assertWorkspaceMembershipTransitionAllowed({
        workspaceId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        actorUserId: "11111111-1111-4111-8111-111111111111",
        targetUserId: "11111111-1111-4111-8111-111111111111",
        currentRole: "owner",
        nextRole: "admin",
        ownerCount: 1,
      });
      throw new Error("Expected last-owner downgrade to throw.");
    } catch (error) {
      expect(error).toMatchObject({
        code: "WORKSPACE_LAST_OWNER_PROTECTED",
        status: 409,
      });
    }
  });

  it("allows self-downgrade when another owner already exists", () => {
    expect(() =>
      assertWorkspaceMembershipTransitionAllowed({
        workspaceId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        actorUserId: "11111111-1111-4111-8111-111111111111",
        targetUserId: "11111111-1111-4111-8111-111111111111",
        currentRole: "owner",
        nextRole: "admin",
        ownerCount: 2,
      }),
    ).not.toThrow();
  });

  it("allows promoting a different member to owner", () => {
    expect(() =>
      assertWorkspaceMembershipTransitionAllowed({
        workspaceId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        actorUserId: "11111111-1111-4111-8111-111111111111",
        targetUserId: "22222222-2222-4222-8222-222222222222",
        currentRole: "member",
        nextRole: "owner",
        ownerCount: 1,
      }),
    ).not.toThrow();
  });

  it("blocks removing the last owner of a workspace", () => {
    try {
      assertWorkspaceMembershipRemovalAllowed({
        workspaceId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        actorUserId: "11111111-1111-4111-8111-111111111111",
        targetUserId: "11111111-1111-4111-8111-111111111111",
        currentRole: "owner",
        ownerCount: 1,
      });
      throw new Error("Expected last-owner removal to throw.");
    } catch (error) {
      expect(error).toMatchObject({
        code: "WORKSPACE_LAST_OWNER_PROTECTED",
        status: 409,
      });
    }
  });

  it("allows self-removal when another owner already exists", () => {
    expect(() =>
      assertWorkspaceMembershipRemovalAllowed({
        workspaceId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        actorUserId: "11111111-1111-4111-8111-111111111111",
        targetUserId: "11111111-1111-4111-8111-111111111111",
        currentRole: "owner",
        ownerCount: 2,
      }),
    ).not.toThrow();
  });
});
