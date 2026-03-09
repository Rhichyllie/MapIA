import { describe, expect, it, vi } from "vitest";
import type {
  WorkingSnapshotRecord,
  WorkingSnapshotRepository,
} from "@/src/modules/graph/application";
import type { EditorSnapshotVersion } from "@/src/modules/versioning/domain";
import type { SnapshotVersionRepository } from "./ports";
import {
  CreateSnapshotVersionFromWorkingSnapshotUseCase,
  DiffWorkingSnapshotAgainstVersionUseCase,
  GetSnapshotVersionByIdUseCase,
  ListSnapshotVersionsUseCase,
  RestoreWorkingSnapshotFromVersionUseCase,
} from "./use-cases";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";
const versionId = "1aa7a983-1fda-4438-93d7-b964c82685f4";

function createWorkingSnapshotRecord(
  overrides: Partial<WorkingSnapshotRecord> = {},
): WorkingSnapshotRecord {
  return {
    ...createWorkingSnapshotRecordBase(),
    ...overrides,
  };
}

function createWorkingSnapshotRecordBase(): WorkingSnapshotRecord {
  return {
    id: "b22f2835-c768-45f4-a85f-bdc2fd6f2438",
    projectId,
    versionNumber: 1,
    revision: 1,
    label: "fase1-working-v1",
    snapshot: {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    createdByIdentity: "admin@mapia.local",
    createdAt: new Date("2026-02-23T19:00:00.000Z"),
  };
}

function createSnapshotVersionRecord(
  overrides: Partial<EditorSnapshotVersion> = {},
): EditorSnapshotVersion {
  return {
    ...createSnapshotVersionRecordBase(),
    ...overrides,
  };
}

function createSnapshotVersionRecordBase(): EditorSnapshotVersion {
  return {
    id: versionId,
    projectId,
    label: "Checkpoint manual",
    origin: "manual" as const,
    createdAt: new Date("2026-02-23T20:00:00.000Z"),
    snapshot: {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
}

function createDeps() {
  const workingSnapshotRepository: WorkingSnapshotRepository = {
    load: vi.fn(async () => createWorkingSnapshotRecord()),
    save: vi.fn(),
  };

  const snapshotVersionRepository: SnapshotVersionRepository = {
    create: vi.fn(async () => createSnapshotVersionRecord()),
    listByProject: vi.fn(async () => [
      {
        id: "790e42f2-50c4-4e75-924f-b89b3d0b78f8",
        projectId,
        label: "Mais recente",
        origin: "manual" as const,
        createdAt: new Date("2026-02-23T20:10:00.000Z"),
      },
      {
        id: "9f6d8616-e275-41b1-b8ad-c9050f3b3657",
        projectId,
        label: "Mais antiga",
        origin: "manual" as const,
        createdAt: new Date("2026-02-23T20:00:00.000Z"),
      },
    ]),
    getById: vi.fn(async () => createSnapshotVersionRecord()),
  };

  return {
    workingSnapshotRepository,
    snapshotVersionRepository,
  };
}

describe("Versioning use-cases", () => {
  it("creates immutable version from current working snapshot", async () => {
    const deps = createDeps();
    const useCase = new CreateSnapshotVersionFromWorkingSnapshotUseCase(deps);

    const result = await useCase.execute({
      projectId,
      label: "Checkpoint manual",
    });

    expect(deps.workingSnapshotRepository.load).toHaveBeenCalledWith(projectId);
    expect(deps.snapshotVersionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        label: "Checkpoint manual",
        origin: "manual",
        snapshot: createWorkingSnapshotRecord().snapshot,
      }),
    );
    expect(result.id).toBe(versionId);
  });

  it("fails when working snapshot does not exist", async () => {
    const deps = createDeps();
    (deps.workingSnapshotRepository.load as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    const useCase = new CreateSnapshotVersionFromWorkingSnapshotUseCase(deps);

    await expect(useCase.execute({ projectId })).rejects.toThrow(
      /snapshot de trabalho/i,
    );
    expect(deps.snapshotVersionRepository.create).not.toHaveBeenCalled();
  });

  it("lists versions for project (most recent first from repository)", async () => {
    const deps = createDeps();
    const useCase = new ListSnapshotVersionsUseCase(deps);

    const result = await useCase.execute({ projectId });

    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("Mais recente");
    expect(result[1].label).toBe("Mais antiga");
    expect(deps.snapshotVersionRepository.listByProject).toHaveBeenCalledWith(
      projectId,
    );
  });

  it("gets version detail by id", async () => {
    const deps = createDeps();
    const useCase = new GetSnapshotVersionByIdUseCase(deps);

    const result = await useCase.execute({ projectId, versionId });

    expect(result.id).toBe(versionId);
    expect(deps.snapshotVersionRepository.getById).toHaveBeenCalledWith(
      projectId,
      versionId,
    );
  });

  it("validates use-case input with zod schemas", async () => {
    const deps = createDeps();
    const useCase = new GetSnapshotVersionByIdUseCase(deps);

    await expect(
      useCase.execute({
        projectId: "not-a-uuid",
        versionId,
      }),
    ).rejects.toThrow();
  });

  it("diffs working snapshot against immutable version", async () => {
    const deps = createDeps();
    (deps.snapshotVersionRepository.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createSnapshotVersionRecord({
        snapshot: {
          nodes: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              projectId,
              kind: "note",
              label: "Base",
              position: { x: 0, y: 0 },
              data: {},
              externalRefs: [],
            },
          ],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      }),
    );
    (deps.workingSnapshotRepository.load as ReturnType<typeof vi.fn>).mockResolvedValue(
      createWorkingSnapshotRecord({
        snapshot: {
          nodes: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              projectId,
              kind: "note",
              label: "Base alterada",
              position: { x: 10, y: 0 },
              data: {},
              externalRefs: [],
            },
            {
              id: "22222222-2222-4222-8222-222222222222",
              projectId,
              kind: "entity",
              label: "Novo node",
              position: { x: 20, y: 5 },
              data: {},
              externalRefs: [],
            },
          ],
          edges: [
            {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              projectId,
              sourceNodeId: "11111111-1111-4111-8111-111111111111",
              targetNodeId: "22222222-2222-4222-8222-222222222222",
              kind: "flows-to",
              label: "novo",
              data: {},
              externalRefs: [],
            },
          ],
          viewport: { x: 5, y: 5, zoom: 1.2 },
        },
      }),
    );
    const useCase = new DiffWorkingSnapshotAgainstVersionUseCase(deps);

    const result = await useCase.execute({ projectId, versionId });

    expect(result.version).toEqual(
      expect.objectContaining({
        id: versionId,
        projectId,
        label: "Checkpoint manual",
        origin: "manual",
      }),
    );
    expect(result.diff.hasChanges).toBe(true);
    expect(result.diff.nodesAdded).toEqual([
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(result.diff.nodesChanged).toEqual([
      "11111111-1111-4111-8111-111111111111",
    ]);
    expect(result.diff.edgesAdded).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ]);
    expect(result.diff.viewportChanged).toBe(true);
    expect(result.diff.summary).toEqual({ added: 2, removed: 0, changed: 2 });
  });

  it("fails diff when working snapshot does not exist", async () => {
    const deps = createDeps();
    (deps.workingSnapshotRepository.load as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    const useCase = new DiffWorkingSnapshotAgainstVersionUseCase(deps);

    await expect(useCase.execute({ projectId, versionId })).rejects.toThrow(
      /snapshot de trabalho/i,
    );
  });

  it("fails diff when version does not exist", async () => {
    const deps = createDeps();
    (deps.snapshotVersionRepository.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    const useCase = new DiffWorkingSnapshotAgainstVersionUseCase(deps);

    await expect(useCase.execute({ projectId, versionId })).rejects.toThrow(
      /versao de snapshot nao encontrada/i,
    );
  });

  it("restores immutable version into working snapshot", async () => {
    const deps = createDeps();
    const baseVersion = createSnapshotVersionRecord({
      snapshot: {
        nodes: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            projectId,
            kind: "note",
            label: "Checkpoint",
            position: { x: 1, y: 2 },
            data: { foo: "bar" },
            externalRefs: [],
          },
        ],
        edges: [],
        viewport: { x: 10, y: 20, zoom: 1.1 },
      },
    });
    (deps.snapshotVersionRepository.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
      baseVersion,
    );
    (deps.workingSnapshotRepository.save as ReturnType<typeof vi.fn>).mockImplementation(
      async (input) =>
        createWorkingSnapshotRecord({
          snapshot: input.snapshot,
          label: input.label,
        }),
    );

    const useCase = new RestoreWorkingSnapshotFromVersionUseCase(deps);
    const result = await useCase.execute({
      projectId,
      versionId,
      actorIdentity: "admin@mapia.local",
    });

    expect(result.message).toMatch(/restaurado com sucesso/i);
    expect(result.restoredFromVersionId).toBe(versionId);
    expect(result.workingSnapshot.snapshot).toEqual(baseVersion.snapshot);
    expect(deps.workingSnapshotRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        snapshot: baseVersion.snapshot,
        actorIdentity: "admin@mapia.local",
      }),
    );
    expect(deps.snapshotVersionRepository.create).not.toHaveBeenCalled();
    expect(baseVersion.snapshot.viewport.zoom).toBe(1.1);
    result.workingSnapshot.snapshot.viewport.zoom = 9.9;
    expect(baseVersion.snapshot.viewport.zoom).toBe(1.1);
  });

  it("fails restore when version does not exist", async () => {
    const deps = createDeps();
    (deps.snapshotVersionRepository.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    const useCase = new RestoreWorkingSnapshotFromVersionUseCase(deps);

    await expect(useCase.execute({ projectId, versionId })).rejects.toThrow(
      /versao de snapshot nao encontrada/i,
    );
    expect(deps.workingSnapshotRepository.save).not.toHaveBeenCalled();
  });

  it("fails restore when working snapshot does not exist", async () => {
    const deps = createDeps();
    (deps.workingSnapshotRepository.load as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    const useCase = new RestoreWorkingSnapshotFromVersionUseCase(deps);

    await expect(useCase.execute({ projectId, versionId })).rejects.toThrow(
      /snapshot de trabalho/i,
    );
    expect(deps.workingSnapshotRepository.save).not.toHaveBeenCalled();
  });

  it("validates diff and restore inputs with zod schemas", async () => {
    const deps = createDeps();
    const diffUseCase = new DiffWorkingSnapshotAgainstVersionUseCase(deps);
    const restoreUseCase = new RestoreWorkingSnapshotFromVersionUseCase(deps);

    await expect(
      diffUseCase.execute({
        projectId: "invalid-uuid",
        versionId,
      }),
    ).rejects.toThrow();
    await expect(
      restoreUseCase.execute({
        projectId,
        versionId: "invalid-uuid",
      }),
    ).rejects.toThrow();
  });
});
