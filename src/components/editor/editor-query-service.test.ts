import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSnapshotVersionForEditor,
  importPrismaSchemaForEditor,
  listSnapshotVersionsForEditor,
  loadSnapshotVersionDiffForEditor,
  loadWorkingSnapshotForEditor,
  loadSnapshotVersionDetailForEditor,
  restoreSnapshotVersionForEditor,
  saveWorkingSnapshotForEditor,
} from "./editor-query-service";

describe("editor-query-service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads snapshot from /editor-snapshot endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            workingSnapshot: {
              snapshot: {
                nodes: [],
                edges: [],
                viewport: { x: 0, y: 0, zoom: 1 },
              },
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await loadWorkingSnapshotForEditor(
      "58f3ca26-085e-4237-80d9-adcc42f7142b",
    );

    expect(result?.snapshot?.viewport.zoom).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/58f3ca26-085e-4237-80d9-adcc42f7142b/editor-snapshot",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("surfaces friendly save error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "WORKING_SNAPSHOT_NOT_FOUND",
          message:
            "Snapshot de trabalho nao encontrado. Gere o mapa inicial pelo Assistente de Criacao.",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      saveWorkingSnapshotForEditor({
        projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        snapshot: {
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      }),
    ).rejects.toThrow(/snapshot de trabalho/i);
  });

  it("creates version through /snapshot-versions endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            message: "Versao criada com sucesso.",
            snapshotVersion: {
              id: "1aa7a983-1fda-4438-93d7-b964c82685f4",
              projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
              origin: "manual",
              createdAt: "2026-02-23T20:00:00.000Z",
              snapshot: {
                nodes: [],
                edges: [],
                viewport: { x: 0, y: 0, zoom: 1 },
              },
            },
          },
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await createSnapshotVersionForEditor({
      projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
    });

    expect(result.message).toMatch(/versao criada/i);
    expect(result.snapshotVersion.origin).toBe("manual");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/58f3ca26-085e-4237-80d9-adcc42f7142b/snapshot-versions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces friendly create-version error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "WORKING_SNAPSHOT_NOT_FOUND",
          message:
            "Snapshot de trabalho nao encontrado. Gere o mapa inicial pelo Assistente de Criacao.",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      createSnapshotVersionForEditor({
        projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
      }),
    ).rejects.toThrow(/snapshot de trabalho/i);
  });

  it("lists versions from /snapshot-versions endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            snapshotVersions: [
              {
                id: "790e42f2-50c4-4e75-924f-b89b3d0b78f8",
                projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
                label: "Mais recente",
                origin: "manual",
                createdAt: "2026-02-23T20:10:00.000Z",
              },
            ],
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await listSnapshotVersionsForEditor(
      "58f3ca26-085e-4237-80d9-adcc42f7142b",
    );

    expect(result[0]?.label).toBe("Mais recente");
  });

  it("loads snapshot version detail from /snapshot-versions/:id endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            snapshotVersion: {
              id: "1aa7a983-1fda-4438-93d7-b964c82685f4",
              projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
              origin: "manual",
              createdAt: "2026-02-23T20:00:00.000Z",
              snapshot: {
                nodes: [],
                edges: [],
                viewport: { x: 0, y: 0, zoom: 1 },
              },
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await loadSnapshotVersionDetailForEditor(
      "58f3ca26-085e-4237-80d9-adcc42f7142b",
      "1aa7a983-1fda-4438-93d7-b964c82685f4",
    );

    expect(result.snapshot.viewport.zoom).toBe(1);
  });

  it("loads structural diff from /snapshot-versions/:id/diff endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            version: {
              id: "1aa7a983-1fda-4438-93d7-b964c82685f4",
              projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
              label: "Checkpoint manual",
              origin: "manual",
              createdAt: "2026-02-23T20:00:00.000Z",
            },
            diff: {
              hasChanges: true,
              nodesAdded: ["22222222-2222-4222-8222-222222222222"],
              nodesRemoved: [],
              nodesChanged: ["11111111-1111-4111-8111-111111111111"],
              edgesAdded: [],
              edgesRemoved: [],
              edgesChanged: [],
              viewportChanged: true,
              summary: { added: 1, removed: 0, changed: 2 },
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await loadSnapshotVersionDiffForEditor(
      "58f3ca26-085e-4237-80d9-adcc42f7142b",
      "1aa7a983-1fda-4438-93d7-b964c82685f4",
    );

    expect(result.summary.changed).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/58f3ca26-085e-4237-80d9-adcc42f7142b/snapshot-versions/1aa7a983-1fda-4438-93d7-b964c82685f4/diff",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("surfaces friendly diff error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "SNAPSHOT_VERSION_NOT_FOUND",
          message: "Versao de snapshot nao encontrada.",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      loadSnapshotVersionDiffForEditor(
        "58f3ca26-085e-4237-80d9-adcc42f7142b",
        "1aa7a983-1fda-4438-93d7-b964c82685f4",
      ),
    ).rejects.toThrow(/versao de snapshot nao encontrada/i);
  });

  it("restores version through /snapshot-versions/:id/restore endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            message: "Snapshot de trabalho restaurado com sucesso.",
            restoredFromVersionId: "1aa7a983-1fda-4438-93d7-b964c82685f4",
            workingSnapshot: {
              id: "b22f2835-c768-45f4-a85f-bdc2fd6f2438",
              projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
              versionNumber: 1,
              revision: 3,
              label: "fase1-working-v1",
              createdAt: "2026-02-23T20:30:00.000Z",
              snapshot: {
                nodes: [],
                edges: [],
                viewport: { x: 10, y: 20, zoom: 1.1 },
              },
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await restoreSnapshotVersionForEditor({
      projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
      versionId: "1aa7a983-1fda-4438-93d7-b964c82685f4",
    });

    expect(result.restoredFromVersionId).toBe(
      "1aa7a983-1fda-4438-93d7-b964c82685f4",
    );
    expect(result.workingSnapshot.snapshot.viewport.zoom).toBe(1.1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/58f3ca26-085e-4237-80d9-adcc42f7142b/snapshot-versions/1aa7a983-1fda-4438-93d7-b964c82685f4/restore",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces friendly restore error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "WORKING_SNAPSHOT_NOT_FOUND",
          message:
            "Snapshot de trabalho nao encontrado. Gere o mapa inicial pelo Assistente de Criacao.",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      restoreSnapshotVersionForEditor({
        projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        versionId: "1aa7a983-1fda-4438-93d7-b964c82685f4",
      }),
    ).rejects.toThrow(/snapshot de trabalho/i);
  });

  it("imports Prisma schema into working snapshot through /imports/prisma-schema endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            message: "Schema Prisma importado com sucesso para o snapshot de trabalho.",
            importSummary: {
              modelsCount: 2,
              relationsCount: 1,
              scalarFieldsCount: 5,
            },
            workingSnapshot: {
              id: "b22f2835-c768-45f4-a85f-bdc2fd6f2438",
              projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
              versionNumber: 1,
              revision: 4,
              label: "import-prisma-schema",
              createdAt: "2026-02-24T15:00:00.000Z",
              snapshot: {
                nodes: [],
                edges: [],
                viewport: { x: 0, y: 0, zoom: 1 },
              },
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await importPrismaSchemaForEditor({
      projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
      schema: "model User { id String @id }",
    });

    expect(result.importSummary).toEqual({
      modelsCount: 2,
      relationsCount: 1,
      scalarFieldsCount: 5,
    });
    expect(result.workingSnapshot.snapshot.viewport.zoom).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/58f3ca26-085e-4237-80d9-adcc42f7142b/imports/prisma-schema",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces friendly Prisma schema import error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "PRISMA_SCHEMA_EMPTY",
          message: "Schema Prisma vazio. Cole o conteudo de um arquivo .prisma.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      importPrismaSchemaForEditor({
        projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        schema: "   ",
      }),
    ).rejects.toThrow(/schema prisma vazio/i);
  });
});
