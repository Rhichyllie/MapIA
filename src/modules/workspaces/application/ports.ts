import type { Workspace } from "@/src/modules/workspaces/domain";

export type CreateWorkspaceRecord = {
  slug: string;
  name: string;
  ownerIdentity?: string;
};

export interface WorkspaceRepository {
  create(input: CreateWorkspaceRecord): Promise<Workspace>;
  findById(id: string): Promise<Workspace | null>;
  findByOwnerIdentity(ownerIdentity: string): Promise<Workspace[]>;
}
