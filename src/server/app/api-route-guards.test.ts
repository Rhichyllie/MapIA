import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError } from "@/src/lib/app-error";
import type { ServerUseCases } from "@/src/server/app/container";

const mocks = vi.hoisted(() => ({
  getApiSessionIdentity: vi.fn(),
  recordServerAuditEvent: vi.fn(),
}));

vi.mock("@/src/server/auth/api-session", () => ({
  getApiSessionIdentity: mocks.getApiSessionIdentity,
}));

vi.mock("@/src/server/audit/server-audit", () => ({
  recordServerAuditEvent: mocks.recordServerAuditEvent,
}));

import {
  requireAuthenticatedApiRequest,
  requireOwnedProjectForApi,
  requireOwnedProjectRouteContext,
} from "@/src/server/app/api-route-guards";

describe("api-route-guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws standardized unauthorized error when api session is missing", async () => {
    mocks.getApiSessionIdentity.mockResolvedValue(null);

    await expect(requireAuthenticatedApiRequest()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
  });

  it("returns the authenticated api session when present", async () => {
    mocks.getApiSessionIdentity.mockResolvedValue({
      identity: "owner@mapia.local",
      session: { user: { email: "owner@mapia.local" } },
    });

    await expect(requireAuthenticatedApiRequest()).resolves.toMatchObject({
      identity: "owner@mapia.local",
    });
  });

  it("records denied audit on project access failure", async () => {
    const useCases = {
      projects: {
        getOwnedProject: {
          execute: vi.fn().mockRejectedValue(
            new AppError("Projeto nao encontrado.", {
              code: "PROJECT_NOT_FOUND",
              status: 404,
            }),
          ),
        },
      },
    } as unknown as Pick<ServerUseCases, "projects">;

    await expect(
      requireOwnedProjectForApi({
        route: "GET /api/projects/[projectId]/editor-snapshot",
        projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        ownerIdentity: "owner@mapia.local",
        useCases,
      }),
    ).rejects.toMatchObject({
      code: "PROJECT_NOT_FOUND",
      status: 404,
    });

    expect(mocks.recordServerAuditEvent).toHaveBeenCalledWith({
      projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
      entityType: "project",
      entityId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
      action: "denied",
      actorIdentity: "owner@mapia.local",
      payload: {
        route: "GET /api/projects/[projectId]/editor-snapshot",
        reason: "PROJECT_NOT_FOUND",
      },
    });
  });

  it("resolves auth, params and project in one step for project routes", async () => {
    mocks.getApiSessionIdentity.mockResolvedValue({
      identity: "owner@mapia.local",
      session: { user: { email: "owner@mapia.local" } },
    });
    const project = {
      id: "58f3ca26-085e-4237-80d9-adcc42f7142b",
      workspaceId: "7c96ab95-fd65-48b7-bb8d-7402c0dd92e2",
    };
    const useCases = {
      projects: {
        getOwnedProject: {
          execute: vi.fn().mockResolvedValue(project),
        },
      },
    } as unknown as Pick<ServerUseCases, "projects">;

    const result = await requireOwnedProjectRouteContext({
      route: "GET /api/projects/[projectId]/editor-snapshot",
      params: Promise.resolve({ projectId: project.id }),
      paramsSchema: z.object({
        projectId: z.string().uuid(),
      }),
      useCases,
    });

    expect(result).toMatchObject({
      auth: { identity: "owner@mapia.local" },
      params: { projectId: project.id },
      project,
    });
  });
});
