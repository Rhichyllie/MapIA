import type {
  Workspace,
  WorkspaceMembership,
  WorkspaceMembershipWithUser,
  WorkspaceRole,
} from "@/src/modules/workspaces/domain";

export type CreateWorkspaceRecord = {
  slug: string;
  name: string;
  ownerUserId: string;
  legacyOwnerIdentity?: string;
};

export type UpsertWorkspaceMembershipRecord = {
  workspaceId: string;
  actorUserId: string;
  userId: string;
  role: WorkspaceRole;
};

export type RemoveWorkspaceMembershipRecord = {
  workspaceId: string;
  actorUserId: string;
  userId: string;
};

export type UpsertWorkspaceMembershipResult = {
  membership: WorkspaceMembership;
  previousMembership: WorkspaceMembership | null;
};

export interface WorkspaceRepository {
  create(input: CreateWorkspaceRecord): Promise<Workspace>;
  findById(id: string): Promise<Workspace | null>;
  findBySlug(slug: string): Promise<Workspace | null>;
  findByUserId(userId: string): Promise<Workspace[]>;
  findMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMembership | null>;
  listMemberships(workspaceId: string): Promise<WorkspaceMembershipWithUser[]>;
  upsertMembership(
    input: UpsertWorkspaceMembershipRecord,
  ): Promise<UpsertWorkspaceMembershipResult>;
  removeMembership(
    input: RemoveWorkspaceMembershipRecord,
  ): Promise<WorkspaceMembership | null>;
}
