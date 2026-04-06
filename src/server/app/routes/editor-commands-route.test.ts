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

import { POST } from "@/app/api/projects/[projectId]/editor-commands/route";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";
const edgeId = "0dc56b95-fd65-48b7-bb8d-7402c0dd92e2";
const nodeId = "1aa7a983-1fda-4438-93d7-b964c82685f4";
const actorUserId = "11111111-1111-4111-8111-111111111111";

function createContext() {
  return {
    params: Promise.resolve({ projectId }),
  };
}

function createRequest(body: unknown) {
  return new Request("http://localhost/api/projects/x/editor-commands", {
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
    editor: {
      applyCommand: {
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
      applyCommands: {
        execute: vi.fn().mockResolvedValue({
          projectId,
          revision: 7,
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
  routeMocks.withServerTelemetrySpan.mockImplementation(
    async (
      _name: string,
      _options: unknown,
      callback: (span: { setAttribute: ReturnType<typeof vi.fn> }) => unknown,
    ) => callback({ setAttribute: vi.fn() }),
  );
});

describe("POST /api/projects/[projectId]/editor-commands", () => {
  it("returns 401 when there is no authenticated session", async () => {
    routeMocks.getApiSessionIdentity.mockResolvedValueOnce(null);

    const response = await POST(
      createRequest({
        command: {
          type: "removeEdge",
          edgeId,
        },
      }),
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
      createRequest({ commands: [] }),
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

  it("executes the single-command contract and returns the working snapshot envelope", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await POST(
      createRequest({
        label: "Remove edge",
        expectedRevision: 2,
        semanticMode: "operational",
        command: {
          type: "removeEdge",
          edgeId,
        },
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
    expect(useCases.editor.applyCommand.execute).toHaveBeenCalledWith({
      projectId,
      actorIdentity: "owner@mapia.local",
      label: "Remove edge",
      expectedRevision: 2,
      semanticMode: "operational",
      command: {
        type: "removeEdge",
        edgeId,
      },
    });
    expect(useCases.editor.applyCommands.execute).not.toHaveBeenCalled();
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

  it("executes the batch-command contract with semantic override fields", async () => {
    const useCases = createUseCasesMock();
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await POST(
      createRequest({
        label: "Bulk technical restore",
        expectedRevision: 6,
        semanticMode: "technical",
        allowSemanticOverride: true,
        overrideReason: "Override tecnico controlado para lote de restauracao",
        commands: [
          {
            type: "removeEdge",
            edgeId,
          },
          {
            type: "removeNode",
            nodeId,
          },
        ],
      }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(useCases.editor.applyCommands.execute).toHaveBeenCalledWith({
      projectId,
      actorIdentity: "owner@mapia.local",
      label: "Bulk technical restore",
      expectedRevision: 6,
      semanticMode: "technical",
      allowSemanticOverride: true,
      overrideReason: "Override tecnico controlado para lote de restauracao",
      commands: [
        {
          type: "removeEdge",
          edgeId,
        },
        {
          type: "removeNode",
          nodeId,
        },
      ],
    });
    expect(useCases.editor.applyCommand.execute).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      data: {
        newRevision: 7,
        workingSnapshot: {
          projectId,
          revision: 7,
        },
      },
    });
  });

  it("returns revision conflict details from the editor use case", async () => {
    const useCases = createUseCasesMock();
    useCases.editor.applyCommand.execute.mockRejectedValueOnce(
      new AppError(
        "Conflito de revisao: snapshot atual diferente da revisao esperada.",
        {
          code: "CONFLICT",
          status: 409,
          details: {
            currentRevision: 8,
            expectedRevision: 6,
          },
        },
      ),
    );
    routeMocks.createServerUseCases.mockReturnValue(useCases);

    const response = await POST(
      createRequest({
        expectedRevision: 6,
        command: {
          type: "removeEdge",
          edgeId,
        },
      }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      error: "CONFLICT",
      code: "CONFLICT",
      currentRevision: 8,
      expectedRevision: 6,
    });
  });
});
