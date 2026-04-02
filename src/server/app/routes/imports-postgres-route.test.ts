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

import { POST } from "@/app/api/projects/[projectId]/imports/postgres/route";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";

function createContext() {
  return {
    params: Promise.resolve({ projectId }),
  };
}

function createJsonRequest(body: unknown) {
  return new Request("http://localhost/api/projects/x/imports/postgres", {
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
      importPostgresToSnapshot: {
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
            sourceKind: "postgres-live",
            sourceLabel: "postgres:public",
            warnings: [],
            metadata: {
              schemas: "public",
              tablesCount: 1,
              columnsCount: 1,
              foreignKeysCount: 0,
              foreignKeysIgnoredCompositeCount: 0,
              foreignKeysIgnoredDuplicatePairCount: 0,
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  routeMocks.getApiSessionIdentity.mockResolvedValue({
    identity: "user-123",
    session: { user: { email: "dev@example.com" } },
  });
});

describe("POST /api/projects/[projectId]/imports/postgres", () => {
  it("returns 401 when there is no authenticated session", async () => {
    routeMocks.getApiSessionIdentity.mockResolvedValueOnce(null);

    const response = await POST(
      createJsonRequest({ schema: "public" }),
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

  it("returns 400 when payload has an empty schema", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await POST(
      createJsonRequest({ schema: "   " }),
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
      createJsonRequest({ schema: "public" }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      error: "PROJECT_NOT_FOUND",
      message: "Projeto nao encontrado.",
    });
    expect(
      useCases.importing.importPostgresToSnapshot.execute,
    ).not.toHaveBeenCalled();
    expect(useCases.editor.saveFullSnapshot.execute).not.toHaveBeenCalled();
  });

  it("returns 200 and the expected response shape on success", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await POST(
      createJsonRequest({ schema: "public" }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(useCases.projects.getOwnedProject.execute).toHaveBeenCalledWith({
      ownerIdentity: "user-123",
      projectId,
    });
    expect(
      useCases.importing.importPostgresToSnapshot.execute,
    ).toHaveBeenCalledWith({
      projectId,
      schema: "public",
    });
    expect(useCases.editor.saveFullSnapshot.execute).toHaveBeenCalledWith({
      projectId,
      actorIdentity: "user-123",
      snapshot: {
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      label: "import-postgres",
    });
    expect(body).toMatchObject({
      data: {
        message: "Postgres importado com sucesso para o snapshot de trabalho.",
        importSource: {
          sourceKind: "postgres-live",
          sourceLabel: "postgres:public",
          warnings: [],
          metadata: {
            schemas: "public",
            tablesCount: 1,
            columnsCount: 1,
            foreignKeysCount: 0,
            foreignKeysIgnoredCompositeCount: 0,
            foreignKeysIgnoredDuplicatePairCount: 0,
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
    useCases.importing.importPostgresToSnapshot.execute.mockRejectedValueOnce(
      new Error("boom"),
    );
    routeMocks.createServerUseCases.mockReturnValue(useCases);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      const response = await POST(
        createJsonRequest({ schema: "public" }),
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
