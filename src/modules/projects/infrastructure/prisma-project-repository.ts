import type { PrismaClient } from "@prisma/client";
import type { ProjectRepository } from "@/src/modules/projects/application";
import { ProjectSchema, type Project } from "@/src/modules/projects/domain";

type PrismaProjectDelegate = PrismaClient["project"];

function parseProjectRow<T extends { description: string | null }>(row: T): Project {
  // Mantemos `description` nullable no banco e normalizamos no boundary de leitura.
  return ProjectSchema.parse({
    ...row,
    description: row.description ?? "",
  });
}

export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly delegate: PrismaProjectDelegate) {}

  async create(input: {
    workspaceId: string;
    slug: string;
    name: string;
    description?: string;
    template: Project["template"];
  }): Promise<Project> {
    const created = await this.delegate.create({
      data: {
        workspaceId: input.workspaceId,
        slug: input.slug,
        name: input.name,
        description: input.description,
        template: input.template,
      },
    });

    return parseProjectRow(created);
  }

  async findById(id: string): Promise<Project | null> {
    const project = await this.delegate.findUnique({ where: { id } });
    return project ? parseProjectRow(project) : null;
  }

  async findByWorkspaceIdAndSlug(
    workspaceId: string,
    slug: string,
  ): Promise<Project | null> {
    const project = await this.delegate.findUnique({
      where: {
        workspaceId_slug: {
          workspaceId,
          slug,
        },
      },
    });

    return project ? parseProjectRow(project) : null;
  }

  async listByWorkspaceId(workspaceId: string): Promise<Project[]> {
    const projects = await this.delegate.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });

    return projects.map(parseProjectRow);
  }

  async updateMetadata(input: {
    projectId: string;
    name?: string;
    description?: string;
    template?: Project["template"];
  }): Promise<Project> {
    const updated = await this.delegate.update({
      where: { id: input.projectId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.template !== undefined ? { template: input.template } : {}),
      },
    });

    return parseProjectRow(updated);
  }
}
