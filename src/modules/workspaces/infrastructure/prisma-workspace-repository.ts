import type { PrismaClient } from "@prisma/client";
import type { WorkspaceRepository } from "@/src/modules/workspaces/application";
import {
  WorkspaceSchema,
  type Workspace,
} from "@/src/modules/workspaces/domain";

type PrismaWorkspaceDelegate = PrismaClient["workspace"];

export class PrismaWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly delegate: PrismaWorkspaceDelegate) {}

  async create(input: {
    slug: string;
    name: string;
    ownerIdentity?: string;
  }): Promise<Workspace> {
    const created = await this.delegate.create({
      data: {
        slug: input.slug,
        name: input.name,
        ownerIdentity: input.ownerIdentity,
      },
    });

    return WorkspaceSchema.parse(created);
  }

  async findById(id: string): Promise<Workspace | null> {
    const workspace = await this.delegate.findUnique({
      where: { id },
    });

    return workspace ? WorkspaceSchema.parse(workspace) : null;
  }

  async findByOwnerIdentity(ownerIdentity: string): Promise<Workspace[]> {
    const workspaces = await this.delegate.findMany({
      where: { ownerIdentity },
      orderBy: { createdAt: "asc" },
    });

    return workspaces.map((workspace) => WorkspaceSchema.parse(workspace));
  }
}
