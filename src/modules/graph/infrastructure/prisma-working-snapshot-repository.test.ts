import { describe, expect, it, vi } from "vitest";
import { PrismaWorkingSnapshotRepository } from "./prisma-working-snapshot-repository";

function createValidRow() {
  return {
    id: "2ec92d9f-f1b5-4aaa-a0a4-13a7ecbd8db6",
    projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
    versionNumber: 1,
    revision: 1,
    label: "fase1-working-v1",
    snapshot: {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    createdByIdentity: "admin@mapia.local",
    createdAt: new Date("2026-02-23T00:00:00.000Z"),
  };
}

describe("PrismaWorkingSnapshotRepository", () => {
  it("throws when loading invalid snapshot JSON from database boundary", async () => {
    const delegate = {
      findUnique: vi.fn(async () => ({
        ...createValidRow(),
        snapshot: { nodes: [], edges: [], viewport: { x: 0, y: 0 } },
      })),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    } as const;

    const repository = new PrismaWorkingSnapshotRepository(delegate as never);

    await expect(
      repository.load("58f3ca26-085e-4237-80d9-adcc42f7142b"),
    ).rejects.toThrow();
  });

  it("saves and loads snapshot through validated boundary", async () => {
    let persisted = createValidRow();
    const delegate = {
      findUnique: vi.fn(async () => persisted),
      create: vi.fn(async () => persisted),
      update: vi.fn(),
      updateMany: vi.fn(
        async (args: {
          data: {
            label: string;
            snapshot: typeof persisted.snapshot;
            viewport: typeof persisted.viewport;
            createdByIdentity: string;
            revision: { increment: number };
          };
        }) => {
          persisted = {
            ...persisted,
            label: args.data.label,
            snapshot: args.data.snapshot,
            viewport: args.data.viewport,
            createdByIdentity: args.data.createdByIdentity,
            revision: persisted.revision + args.data.revision.increment,
          };
          return { count: 1 };
        },
      ),
    } as const;

    const repository = new PrismaWorkingSnapshotRepository(delegate as never);

    const saved = await repository.save({
      projectId: persisted.projectId,
      actorIdentity: "admin@mapia.local",
      label: "fase1-working-v1",
      expectedRevision: 1,
      snapshot: {
        nodes: [],
        edges: [],
        viewport: { x: 10, y: 20, zoom: 1.2 },
      },
    });

    const loaded = await repository.load(persisted.projectId);

    expect(saved.snapshot.viewport.zoom).toBe(1.2);
    expect(saved.revision).toBe(2);
    expect(loaded?.snapshot.viewport.x).toBe(10);
    expect(delegate.updateMany).toHaveBeenCalled();
    expect(delegate.findUnique).toHaveBeenCalled();
  });
});
