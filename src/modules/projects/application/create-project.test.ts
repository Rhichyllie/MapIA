import { describe, expect, it, vi } from "vitest";
import type { ProjectRepository } from "@/src/modules/projects/application";
import type { WorkspaceRepository } from "@/src/modules/workspaces/application";
import { CreateProjectUseCase } from "./use-cases";

const ACTOR_USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "58f3ca26-085e-4237-80d9-adcc42f7142b";

function buildWorkspaceRepositoryMock(): WorkspaceRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(async (id: string) => ({
      id,
      slug: "ws-owner",
      name: "Workspace owner",
      ownerIdentity: "admin@mapia.local",
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    findBySlug: vi.fn(async () => null),
    findByUserId: vi.fn(async (userId: string) =>
      userId === ACTOR_USER_ID
        ? [
            {
              id: WORKSPACE_ID,
              slug: "ws-owner",
              name: "Workspace owner",
              ownerIdentity: "admin@mapia.local",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]
        : [],
    ),
    findMembership: vi.fn(async (workspaceId: string, userId: string) =>
      workspaceId === WORKSPACE_ID && userId === ACTOR_USER_ID
        ? {
            id: "22222222-2222-4222-8222-222222222222",
            workspaceId,
            userId,
            role: "owner" as const,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        : null,
    ),
    listMemberships: vi.fn(async () => []),
    upsertMembership: vi.fn(),
    removeMembership: vi.fn(),
  };
}

function buildProjectRepositoryMock(): ProjectRepository {
  const createdProjects: Array<{ slug: string }> = [];

  return {
    create: vi.fn(async (input) => {
      createdProjects.push({ slug: input.slug });
      return {
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        slug: input.slug,
        name: input.name,
        description: input.description,
        template: input.template,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),
    findById: vi.fn(async () => null),
    findByWorkspaceIdAndSlug: vi.fn(async (_workspaceId, slug) => {
      if (slug === "mapa-onboarding") {
        return {
          id: crypto.randomUUID(),
          workspaceId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          slug,
          name: "Existing",
          description: undefined,
          template: "graph" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }

      return null;
    }),
    listByWorkspaceId: vi.fn(async () => []),
    updateMetadata: vi.fn(),
  };
}

describe("CreateProjectUseCase", () => {
  it("creates a project and resolves slug collision", async () => {
    const workspaceRepository = buildWorkspaceRepositoryMock();
    const projectRepository = buildProjectRepositoryMock();
    const useCase = new CreateProjectUseCase({
      projectRepository,
      workspaceRepository,
    });

    const project = await useCase.execute({
      actorUserId: ACTOR_USER_ID,
      workspaceId: WORKSPACE_ID,
      name: "Mapa Onboarding",
      template: "graph",
      description: "Fluxo inicial",
      slug: "mapa-onboarding",
    });

    expect(project.slug).toBe("mapa-onboarding-2");
    expect(project.name).toBe("Mapa Onboarding");
  });
});
