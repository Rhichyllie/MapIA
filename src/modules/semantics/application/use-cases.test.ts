import { describe, expect, it, vi } from "vitest";
import { AuditWorkingSnapshotUseCase } from "./use-cases";

describe("AuditWorkingSnapshotUseCase", () => {
  it("returns issues and appends audit event log", async () => {
    const append = vi.fn(async () => ({
      id: "log-1",
      projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
      eventType: "audit_run",
      payloadJson: {},
      createdAt: new Date("2026-03-09T12:00:00.000Z"),
    }));
    const useCase = new AuditWorkingSnapshotUseCase({
      semanticPolicyRepository: {
        loadByProjectId: vi.fn(async () => ({
          id: "policy-1",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          diagramType: "erd",
          strictEnabled: true,
          enforceOnServer: true,
          allowTechOverride: false,
          requireOverrideReason: true,
          version: 1,
          updatedAt: new Date("2026-03-09T12:00:00.000Z"),
          createdAt: new Date("2026-03-09T12:00:00.000Z"),
        })),
        create: vi.fn(),
        update: vi.fn(),
      },
      semanticEventLogRepository: {
        append,
      },
      workingSnapshotRepository: {
        load: vi.fn(async () => ({
          id: "work-1",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          versionNumber: 1,
          revision: 9,
          snapshot: {
            nodes: [
              {
                id: "node-1",
                projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
                kind: "flow-step" as const,
                label: "Etapa",
                position: { x: 0, y: 0 },
                data: {},
                externalRefs: [],
              },
            ],
            edges: [],
            viewport: { x: 0, y: 0, zoom: 1 },
            diagramType: "erd",
          },
          createdAt: new Date("2026-03-09T12:00:00.000Z"),
        })),
        save: vi.fn(),
      },
    });

    const result = await useCase.execute({
      projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
      actorIdentity: "dev@mapia.local",
      mode: "operational",
    });

    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.snapshotRevision).toBe(9);
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        actorIdentity: "dev@mapia.local",
        eventType: "audit_run",
      }),
    );
  });
});
