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

import { POST } from "@/app/api/projects/[projectId]/imports/prisma-file/route";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";

function createContext() {
  return {
    params: Promise.resolve({ projectId }),
  };
}

function createJsonRequest(body: unknown) {
  return new Request("http://localhost/api/projects/x/imports/prisma-file", {
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
      getOwnedProject: {
        execute: vi.fn().mockResolvedValue({
          id: projectId,
          workspaceId: "7c96ab95-fd65-48b7-bb8d-7402c0dd92e2",
        }),
      },
    },
    importing: {
      importPrismaSchemaFileToSnapshot: {
        execute: vi.fn().mockResolvedValue({
          snapshot: {
            nodes: [],
            edges: [],
            viewport: { x: 0, y: 0, zoom: 1 },
          },
          summary: {
            modelsCount: 1,
            relationsCount: 0,
            scalarFieldsCount: 1,
          },
          source: {
            sourceKind: "prisma-schema-file",
            sourceLabel: "prisma/schema.prisma",
            warnings: ["arquivo grande"],
            metadata: {
              fileName: "schema.prisma",
              bytes: 128,
            },
          },
        }),
      },
    },
    editor: {
      saveFullSnapshot: {
        execute: vi.fn().mockResolvedValue({
          projectId,
          revision: 1,
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
    identity: "user-123",
    session: { user: { email: "dev@example.com" } },
  });
});

describe("POST /api/projects/[projectId]/imports/prisma-file", () => {
  it("returns 401 when there is no authenticated session", async () => {
    routeMocks.getApiSessionIdentity.mockResolvedValueOnce(null);

    const response = await POST(
      createJsonRequest({ filePath: "prisma/schema.prisma" }),
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
    expect(useCases.projects.getOwnedProject.execute).not.toHaveBeenCalled();
  });

  it("returns 400 when filePath is empty/blank", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await POST(
      createJsonRequest({ filePath: "   " }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: "VALIDATION_ERROR",
      message: "Dados invalidos.",
    });
    expect(useCases.projects.getOwnedProject.execute).not.toHaveBeenCalled();
  });

  it("returns ownership/access failure from getOwnedProject", async () => {
    const useCases = createUseCasesMock();
    useCases.projects.getOwnedProject.execute.mockRejectedValueOnce(
      new AppError("Projeto nao encontrado.", {
        code: "PROJECT_NOT_FOUND",
        status: 404,
      }),
    );
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await POST(
      createJsonRequest({ filePath: "prisma/schema.prisma" }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      error: "PROJECT_NOT_FOUND",
      message: "Projeto nao encontrado.",
    });
    expect(
      useCases.importing.importPrismaSchemaFileToSnapshot.execute,
    ).not.toHaveBeenCalled();
    expect(useCases.editor.saveFullSnapshot.execute).not.toHaveBeenCalled();
  });

  it("returns 200 and the expected response shape on success", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await POST(
      createJsonRequest({ filePath: "prisma/schema.prisma" }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(useCases.projects.getOwnedProject.execute).toHaveBeenCalledWith({
      ownerIdentity: "user-123",
      projectId,
    });
    expect(
      useCases.importing.importPrismaSchemaFileToSnapshot.execute,
    ).toHaveBeenCalledWith({
      projectId,
      filePath: "prisma/schema.prisma",
      workspaceRoot: process.cwd(),
    });
    expect(useCases.editor.saveFullSnapshot.execute).toHaveBeenCalledWith({
      projectId,
      actorIdentity: "user-123",
      snapshot: {
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      label: "import-prisma-file",
    });
    expect(
      useCases.repositories.semanticEventLogRepository.append,
    ).toHaveBeenCalledWith({
      projectId,
      actorIdentity: "user-123",
      eventType: "import_prisma",
      severity: "info",
      payloadJson: expect.objectContaining({
        source: "prisma-schema-file",
        newRevision: 1,
      }),
    });
    expect(body).toMatchObject({
      data: {
        message:
          "Arquivo Prisma importado com sucesso para o snapshot de trabalho.",
        importSource: {
          sourceKind: "prisma-schema-file",
          sourceLabel: "prisma/schema.prisma",
          warnings: ["arquivo grande"],
          metadata: {
            fileName: "schema.prisma",
            bytes: 128,
          },
        },
        importSummary: {
          modelsCount: 1,
          relationsCount: 0,
          scalarFieldsCount: 1,
        },
        workingSnapshot: {
          projectId,
          revision: 1,
        },
      },
    });
    expect("schemaText" in body.data.importSource).toBe(false);
    expect("externalRefContext" in body.data.importSource).toBe(false);
  });

  it("returns 500 for unexpected internal errors via apiErrorResponse", async () => {
    const useCases = createUseCasesMock();
    useCases.importing.importPrismaSchemaFileToSnapshot.execute.mockRejectedValueOnce(
      new Error("boom"),
    );
    routeMocks.createServerUseCases.mockReturnValue(useCases);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      const response = await POST(
        createJsonRequest({ filePath: "prisma/schema.prisma" }),
        createContext(),
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toMatchObject({
        error: "INTERNAL_SERVER_ERROR",
        message: "Erro interno inesperado.",
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
