import { describe, expect, it, vi } from "vitest";
import { PrismaSnapshotVersionRepository } from "./prisma-snapshot-version-repository";

function createValidRow(overrides: Record<string, unknown> = {}) {
  return {
    ...createValidRowBase(),
    ...overrides,
  } as ReturnType<typeof createValidRowBase>;
}

function createValidRowBase() {
  return {
    id: "1aa7a983-1fda-4438-93d7-b964c82685f4",
    projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
    label: "Checkpoint manual",
    origin: "manual" as const,
    snapshot: {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    createdAt: new Date("2026-02-23T20:00:00.000Z"),
  };
}

describe("PrismaSnapshotVersionRepository", () => {
  it("creates version with validated snapshot boundary", async () => {
    const persisted = createValidRow();
    const delegate = {
      create: vi.fn(async () => persisted),
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
    } as const;

    const repository = new PrismaSnapshotVersionRepository(delegate as never);

    const result = await repository.create({
      projectId: persisted.projectId,
      label: persisted.label ?? undefined,
      origin: "manual",
      snapshot: {
        nodes: [],
        edges: [],
        viewport: { x: 10, y: 20, zoom: 1.1 },
      },
    });

    expect(result.origin).toBe("manual");
    expect(delegate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshot: expect.objectContaining({
            viewport: expect.objectContaining({ zoom: 1.1 }),
          }),
        }),
      }),
    );
    expect(delegate.create).toHaveBeenCalled();
  });

  it("throws on invalid snapshot JSON in prisma boundary", async () => {
    const delegate = {
      create: vi.fn(),
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () =>
        createValidRow({
          snapshot: { nodes: [], edges: [], viewport: { x: 0, y: 0 } } as unknown,
        }),
      ),
    } as const;

    const repository = new PrismaSnapshotVersionRepository(delegate as never);

    await expect(
      repository.getById(
        "58f3ca26-085e-4237-80d9-adcc42f7142b",
        "1aa7a983-1fda-4438-93d7-b964c82685f4",
      ),
    ).rejects.toThrow();
  });

  it("normalizes nullable label from prisma boundary and parses domain", async () => {
    const delegate = {
      create: vi.fn(),
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => createValidRow({ label: null as unknown })),
    } as const;

    const repository = new PrismaSnapshotVersionRepository(delegate as never);

    const result = await repository.getById(
      "58f3ca26-085e-4237-80d9-adcc42f7142b",
      "1aa7a983-1fda-4438-93d7-b964c82685f4",
    );

    expect(result?.label).toBeUndefined();
  });

  it("lists versions ordered by most recent first", async () => {
    const newer = createValidRow({
      id: "790e42f2-50c4-4e75-924f-b89b3d0b78f8",
      label: "Mais recente",
      createdAt: new Date("2026-02-23T20:10:00.000Z"),
    });
    const older = createValidRow({
      id: "9f6d8616-e275-41b1-b8ad-c9050f3b3657",
      label: "Mais antiga",
      createdAt: new Date("2026-02-23T20:00:00.000Z"),
    });
    const delegate = {
      create: vi.fn(),
      findMany: vi.fn(async () => [newer, older]),
      findFirst: vi.fn(async () => null),
    } as const;

    const repository = new PrismaSnapshotVersionRepository(delegate as never);

    const result = await repository.listByProject(
      "58f3ca26-085e-4237-80d9-adcc42f7142b",
    );

    expect(result.map((item) => item.label)).toEqual(["Mais recente", "Mais antiga"]);
    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
  });
});
