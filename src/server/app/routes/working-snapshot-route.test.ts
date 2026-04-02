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

import {
  GET,
  PUT,
} from "@/app/api/projects/[projectId]/working-snapshot/route";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";

function createContext() {
  return {
    params: Promise.resolve({ projectId }),
  };
}

function createRequest(body: unknown) {
  return new Request("http://localhost/api/projects/x/working-snapshot", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function createGetRequest() {
  return new Request("http://localhost/api/projects/x/working-snapshot", {
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
          revision: 2,
          snapshot: {
            nodes: [],
            edges: [],
            viewport: { x: 0, y: 0, zoom: 1 },
          },
        }),
      },
      saveFullSnapshot: {
        execute: vi.fn().mockResolvedValue({
          projectId,
          revision: 3,
          snapshot: {
            nodes: [],
            edges: [],
            viewport: { x: 0, y: 0, zoom: 1 },
          },
        }),
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  routeMocks.getApiSessionIdentity.mockResolvedValue({
    identity: "dev@mapia.local",
    session: { user: { email: "dev@mapia.local" } },
  });
});

describe("GET /api/projects/[projectId]/working-snapshot", () => {
  it("returns 401 when there is no authenticated session", async () => {
    routeMocks.getApiSessionIdentity.mockResolvedValueOnce(null);

    const response = await GET(createGetRequest(), createContext());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      error: "UNAUTHORIZED",
      message: "Autenticacao necessaria.",
    });
    expect(routeMocks.createServerUseCases).not.toHaveBeenCalled();
  });

  it("returns 200 and the current working snapshot on success", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await GET(createGetRequest(), createContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(useCases.projects.getOwnedProject.execute).toHaveBeenCalledWith({
      ownerIdentity: "dev@mapia.local",
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
          revision: 2,
          snapshot: {
            nodes: [],
            edges: [],
            viewport: { x: 0, y: 0, zoom: 1 },
          },
        },
      },
    });
  });
});

describe("PUT /api/projects/[projectId]/working-snapshot", () => {
  it("returns 200 and forwards revision/semantic fields on success", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await PUT(
      createRequest({
        label: "Salvar snapshot completo",
        expectedRevision: 2,
        semanticMode: "technical",
        allowSemanticOverride: true,
        overrideReason: "Override tecnico para restauracao controlada",
        snapshot: {
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(useCases.projects.getOwnedProject.execute).toHaveBeenCalledWith({
      ownerIdentity: "dev@mapia.local",
      projectId,
    });
    expect(useCases.editor.saveFullSnapshot.execute).toHaveBeenCalledWith({
      projectId,
      actorIdentity: "dev@mapia.local",
      label: "Salvar snapshot completo",
      expectedRevision: 2,
      semanticMode: "technical",
      allowSemanticOverride: true,
      overrideReason: "Override tecnico para restauracao controlada",
      snapshot: {
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    });
    expect(body).toMatchObject({
      data: {
        newRevision: 3,
        workingSnapshot: {
          projectId,
          revision: 3,
        },
      },
    });
  });

  it("returns 409 conflict with current/expected revision payload", async () => {
    const useCases = createUseCasesMock();
    useCases.editor.saveFullSnapshot.execute.mockRejectedValueOnce(
      new AppError(
        "Conflito de revisao: snapshot atual diferente da revisao esperada.",
        {
          code: "CONFLICT",
          status: 409,
          details: {
            currentRevision: 12,
            expectedRevision: 11,
          },
        },
      ),
    );
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await PUT(
      createRequest({
        expectedRevision: 11,
        snapshot: {
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      error: "CONFLICT",
      code: "CONFLICT",
      currentRevision: 12,
      expectedRevision: 11,
    });
  });
});
