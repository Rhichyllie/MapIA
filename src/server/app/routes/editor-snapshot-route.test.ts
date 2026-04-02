import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/src/lib/app-error";

const routeMocks = vi.hoisted(() => ({
  getApiSessionIdentity: vi.fn(),
  createServerUseCases: vi.fn(),
  withServerTelemetrySpan: vi.fn(),
}));

vi.mock("@/src/server/auth/api-session", () => ({
  getApiSessionIdentity: routeMocks.getApiSessionIdentity,
}));

vi.mock("@/src/server/app/container", () => ({
  createServerUseCases: routeMocks.createServerUseCases,
}));

vi.mock("@/src/server/observability/server-telemetry", () => ({
  withServerTelemetrySpan: routeMocks.withServerTelemetrySpan,
}));

import { GET } from "@/app/api/projects/[projectId]/editor-snapshot/route";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";

function createContext() {
  return {
    params: Promise.resolve({ projectId }),
  };
}

function createRequest() {
  return new Request("http://localhost/api/projects/x/editor-snapshot", {
    method: "GET",
  });
}

function createUseCasesMock() {
  return {
    projects: {
      getOwnedProject: {
        execute: vi.fn().mockResolvedValue(undefined),
      },
    },
    editor: {
      getWorkingSnapshotForEditor: {
        execute: vi.fn().mockResolvedValue({
          projectId,
          revision: 4,
          snapshot: {
            nodes: [],
            edges: [],
            viewport: { x: 4, y: 8, zoom: 1.1 },
          },
        }),
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  routeMocks.getApiSessionIdentity.mockResolvedValue({
    identity: "owner@mapia.local",
    session: { user: { email: "owner@mapia.local" } },
  });
  routeMocks.withServerTelemetrySpan.mockImplementation(
    async (
      _name: string,
      _options: unknown,
      callback: (span: { setAttribute: ReturnType<typeof vi.fn> }) => unknown,
    ) => callback({ setAttribute: vi.fn() }),
  );
});

describe("GET /api/projects/[projectId]/editor-snapshot", () => {
  it("returns 401 when there is no authenticated session", async () => {
    routeMocks.getApiSessionIdentity.mockResolvedValueOnce(null);

    const response = await GET(createRequest(), createContext());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      error: "UNAUTHORIZED",
      message: "Autenticacao necessaria.",
    });
    expect(routeMocks.createServerUseCases).not.toHaveBeenCalled();
  });

  it("returns access failures before loading the snapshot", async () => {
    const useCases = createUseCasesMock();
    useCases.projects.getOwnedProject.execute.mockRejectedValueOnce(
      new AppError("Projeto nao encontrado.", {
        code: "PROJECT_NOT_FOUND",
        status: 404,
      }),
    );
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await GET(createRequest(), createContext());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      error: "PROJECT_NOT_FOUND",
      message: "Projeto nao encontrado.",
    });
    expect(
      useCases.editor.getWorkingSnapshotForEditor.execute,
    ).not.toHaveBeenCalled();
  });

  it("returns 200 with the editor snapshot envelope on success", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await GET(createRequest(), createContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(useCases.projects.getOwnedProject.execute).toHaveBeenCalledWith({
      ownerIdentity: "owner@mapia.local",
      projectId,
    });
    expect(
      useCases.editor.getWorkingSnapshotForEditor.execute,
    ).toHaveBeenCalledWith({
      projectId,
    });
    expect(body).toMatchObject({
      data: {
        workingSnapshot: {
          projectId,
          revision: 4,
          snapshot: {
            viewport: { x: 4, y: 8, zoom: 1.1 },
          },
        },
      },
    });
  });
});
