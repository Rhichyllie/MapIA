import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/src/lib/app-error";

const routeMocks = vi.hoisted(() => ({
  getApiSessionIdentity: vi.fn(),
  createServerUseCases: vi.fn(),
}));

vi.mock("@/src/server/auth/api-session", () => ({
  getApiSessionIdentity: routeMocks.getApiSessionIdentity,
}));

vi.mock("@/src/server/app/container", () => ({
  createServerUseCases: routeMocks.createServerUseCases,
}));

import { POST } from "@/app/api/projects/route";

const workspaceId = "58f3ca26-085e-4237-80d9-adcc42f7142b";
const projectId = "7c96ab95-fd65-48b7-bb8d-7402c0dd92e2";
const actorUserId = "11111111-1111-4111-8111-111111111111";

function createRequest(body: unknown) {
  return new Request("http://localhost/api/projects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function createUseCasesMock() {
  return {
    projects: {
      createProject: {
        execute: vi.fn().mockResolvedValue({
          id: projectId,
          workspaceId,
          name: "Projeto Alpha",
          description: "Mapa principal",
          template: "graph",
          slug: "projeto-alpha",
          createdAt: "2026-04-02T10:00:00.000Z",
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
      user: {
        id: actorUserId,
        email: "owner@mapia.local",
        authProvider: "credentials",
        authMode: "development_credentials",
      },
    },
  });
});

describe("POST /api/projects", () => {
  it("returns 401 when there is no authenticated session", async () => {
    routeMocks.getApiSessionIdentity.mockResolvedValueOnce(null);

    const response = await POST(
      createRequest({
        workspaceId,
        name: "Projeto Alpha",
        template: "graph",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      error: "UNAUTHORIZED",
      message: "Autenticacao necessaria.",
    });
    expect(routeMocks.createServerUseCases).not.toHaveBeenCalled();
  });

  it("returns 400 when payload is invalid", async () => {
    const response = await POST(
      createRequest({
        workspaceId: "invalid-workspace-id",
        name: "",
        template: "graph",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: "VALIDATION_ERROR",
      message: "Dados invalidos.",
    });
    expect(routeMocks.createServerUseCases).not.toHaveBeenCalled();
  });

  it("returns app errors from createProject without changing the envelope", async () => {
    const useCases = createUseCasesMock();
    useCases.projects.createProject.execute.mockRejectedValueOnce(
      new AppError("Slug ja esta em uso.", {
        code: "PROJECT_SLUG_ALREADY_EXISTS",
        status: 409,
      }),
    );
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await POST(
      createRequest({
        workspaceId,
        name: "Projeto Alpha",
        description: "Mapa principal",
        template: "graph",
        slug: "projeto-alpha",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      error: "PROJECT_SLUG_ALREADY_EXISTS",
      code: "PROJECT_SLUG_ALREADY_EXISTS",
      message: "Slug ja esta em uso.",
    });
  });

  it("returns 201 with the created project envelope on success", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await POST(
      createRequest({
        workspaceId,
        name: "Projeto Alpha",
        description: "Mapa principal",
        template: "graph",
        slug: "projeto-alpha",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(useCases.projects.createProject.execute).toHaveBeenCalledWith({
      actorUserId,
      workspaceId,
      name: "Projeto Alpha",
      description: "Mapa principal",
      template: "graph",
      slug: "projeto-alpha",
    });
    expect(body).toMatchObject({
      data: {
        project: {
          id: projectId,
          workspaceId,
          name: "Projeto Alpha",
          description: "Mapa principal",
          template: "graph",
          slug: "projeto-alpha",
        },
      },
    });
  });
});
