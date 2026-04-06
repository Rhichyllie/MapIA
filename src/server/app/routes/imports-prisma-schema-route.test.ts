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

import { POST } from "@/app/api/projects/[projectId]/imports/prisma-schema/route";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";
const actorUserId = "11111111-1111-4111-8111-111111111111";

function createContext() {
  return {
    params: Promise.resolve({ projectId }),
  };
}

function createJsonRequest(body: unknown) {
  return new Request("http://localhost/api/projects/x/imports/prisma-schema", {
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
      getProjectAccess: {
        execute: vi.fn().mockResolvedValue({
          project: {
            id: projectId,
            workspaceId: "7c96ab95-fd65-48b7-bb8d-7402c0dd92e2",
          },
          membership: {
            id: "22222222-2222-4222-8222-222222222222",
            workspaceId: "7c96ab95-fd65-48b7-bb8d-7402c0dd92e2",
            userId: actorUserId,
            role: "member",
            createdAt: new Date("2026-04-02T10:00:00.000Z"),
            updatedAt: new Date("2026-04-02T10:00:00.000Z"),
          },
        }),
      },
    },
    importing: {
      importPrismaSchemaToSnapshot: {
        execute: vi.fn().mockResolvedValue({
          snapshot: {
            nodes: [],
            edges: [],
            viewport: { x: 0, y: 0, zoom: 1 },
          },
          summary: {
            modelsCount: 2,
            relationsCount: 1,
            scalarFieldsCount: 5,
          },
        }),
      },
    },
    editor: {
      saveFullSnapshot: {
        execute: vi.fn().mockResolvedValue({
          projectId,
          revision: 4,
          snapshot: {
            nodes: [],
            edges: [],
            viewport: { x: 0, y: 0, zoom: 1 },
          },
        }),
      },
    },
    repositories: {
      semanticEventLogRepository: {
        append: vi.fn().mockResolvedValue({
          id: "log-1",
          projectId,
        }),
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  routeMocks.getApiSessionIdentity.mockResolvedValue({
    identity: "dev@example.com",
    userId: actorUserId,
    actor: {
      userId: actorUserId,
      email: "dev@example.com",
      providerId: "credentials",
      authMode: "development_credentials",
    },
    session: {
      user: {
        id: actorUserId,
        email: "dev@example.com",
        authProvider: "credentials",
        authMode: "development_credentials",
      },
    },
  });
});

describe("POST /api/projects/[projectId]/imports/prisma-schema", () => {
  it("returns 401 when there is no authenticated session", async () => {
    routeMocks.getApiSessionIdentity.mockResolvedValueOnce(null);

    const response = await POST(
      createJsonRequest({ schema: "model User { id String @id }" }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      error: "UNAUTHORIZED",
      message: "Autenticacao necessaria.",
    });
    expect(routeMocks.createServerUseCases).not.toHaveBeenCalled();
  });

  it("returns 400 when payload body is invalid", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await POST(
      createJsonRequest("not-an-object"),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: "VALIDATION_ERROR",
      message: "Dados invalidos.",
    });
    expect(useCases.projects.getProjectAccess.execute).not.toHaveBeenCalled();
  });

  it("returns membership/access failure from getProjectAccess", async () => {
    const useCases = createUseCasesMock();
    useCases.projects.getProjectAccess.execute.mockRejectedValueOnce(
      new AppError("Projeto nao encontrado.", {
        code: "PROJECT_NOT_FOUND",
        status: 404,
      }),
    );
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await POST(
      createJsonRequest({ schema: "model User { id String @id }" }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      error: "PROJECT_NOT_FOUND",
      message: "Projeto nao encontrado.",
    });
    expect(
      useCases.importing.importPrismaSchemaToSnapshot.execute,
    ).not.toHaveBeenCalled();
    expect(useCases.editor.saveFullSnapshot.execute).not.toHaveBeenCalled();
  });

  it("returns 200 and preserves the Prisma schema import contract on success", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await POST(
      createJsonRequest({
        schema: "model User { id String @id }",
        expectedRevision: 3,
        semanticMode: "technical",
        allowSemanticOverride: true,
        overrideReason: "Override tecnico controlado para importacao",
      }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(useCases.projects.getProjectAccess.execute).toHaveBeenCalledWith({
      actorUserId,
      projectId,
      minimumRole: "member",
    });
    expect(
      useCases.importing.importPrismaSchemaToSnapshot.execute,
    ).toHaveBeenCalledWith({
      projectId,
      schemaText: "model User { id String @id }",
    });
    expect(useCases.editor.saveFullSnapshot.execute).toHaveBeenCalledWith({
      projectId,
      actorIdentity: "dev@example.com",
      snapshot: {
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      label: "import-prisma-schema",
      expectedRevision: 3,
      semanticMode: "technical",
      allowSemanticOverride: true,
      overrideReason: "Override tecnico controlado para importacao",
    });
    expect(
      useCases.repositories.semanticEventLogRepository.append,
    ).toHaveBeenCalledWith({
      projectId,
      actorIdentity: "dev@example.com",
      eventType: "import_prisma",
      severity: "info",
      payloadJson: {
        source: "prisma-schema-inline",
        importSummary: {
          modelsCount: 2,
          relationsCount: 1,
          scalarFieldsCount: 5,
        },
        newRevision: 4,
      },
    });
    expect(body).toMatchObject({
      data: {
        message:
          "Schema Prisma importado com sucesso para o snapshot de trabalho.",
        importSummary: {
          modelsCount: 2,
          relationsCount: 1,
          scalarFieldsCount: 5,
        },
        workingSnapshot: {
          projectId,
          revision: 4,
        },
        newRevision: 4,
      },
    });
  });
});
