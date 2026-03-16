import { describe, expect, it, vi } from "vitest";
import { PrismaProjectRepository } from "./prisma-project-repository";

function createProjectRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "8f0f4805-5f98-471c-a074-67c196419b15",
    workspaceId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
    slug: "mapa-onboarding",
    name: "Mapa Onboarding",
    description: null,
    template: "graph",
    createdAt: new Date("2026-02-23T00:00:00.000Z"),
    updatedAt: new Date("2026-02-23T00:00:00.000Z"),
    ...overrides,
  };
}

describe("PrismaProjectRepository", () => {
  it("normalizes nullable description from Prisma when listing projects", async () => {
    const delegate = {
      findMany: vi.fn(async () => [createProjectRow()]),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    } as const;

    const repository = new PrismaProjectRepository(delegate as never);

    const projects = await repository.listByWorkspaceId(
      "58f3ca26-085e-4237-80d9-adcc42f7142b",
    );

    expect(projects).toHaveLength(1);
    expect(projects[0].description).toBe("");
    expect(delegate.findMany).toHaveBeenCalled();
  });

  it("applies the same normalization in other methods that return Project", async () => {
    const created = createProjectRow({
      id: "64c948e5-da1a-4c7f-9351-678f013720f9",
      slug: "novo-projeto",
    });
    const updated = createProjectRow({
      id: "0dc56b95-fd65-48b7-bb8d-7402c0dd92e2",
      slug: "projeto-atualizado",
    });
    const found = createProjectRow({
      id: "3e520cc0-bf6d-4fc2-9bfc-b3e9ba19c311",
      slug: "projeto-encontrado",
    });

    const delegate = {
      findMany: vi.fn(),
      findUnique: vi.fn(async () => found),
      create: vi.fn(async () => created),
      update: vi.fn(async () => updated),
    } as const;

    const repository = new PrismaProjectRepository(delegate as never);

    const createdProject = await repository.create({
      workspaceId: created.workspaceId,
      slug: "novo-projeto",
      name: "Novo Projeto",
      template: "graph",
      description: undefined,
    });
    const foundById = await repository.findById(found.id);
    const foundBySlug = await repository.findByWorkspaceIdAndSlug(
      found.workspaceId,
      found.slug,
    );
    const updatedProject = await repository.updateMetadata({
      projectId: updated.id,
      name: "Projeto Atualizado",
    });

    expect(createdProject.description).toBe("");
    expect(foundById?.description).toBe("");
    expect(foundBySlug?.description).toBe("");
    expect(updatedProject.description).toBe("");
  });
});
