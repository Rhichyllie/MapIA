import { describe, expect, it, vi } from "vitest";
import type { EditorSnapshotGateway } from "./ports";
import {
  ApplyEditorCommandUseCase,
  ApplyEditorCommandsUseCase,
  GetWorkingSnapshotForEditorUseCase,
  SaveEditorFullSnapshotUseCase,
} from "./use-cases";

function createBaseSnapshot(projectId: string) {
  return {
    nodes: [
      {
        id: "8f0f4805-5f98-471c-a074-67c196419b15",
        projectId,
        kind: "project" as const,
        label: "Projeto raiz",
        position: { x: 10, y: 20 },
        data: {},
        externalRefs: [],
      },
      {
        id: "64c948e5-da1a-4c7f-9351-678f013720f9",
        projectId,
        kind: "note" as const,
        label: "Nota",
        position: { x: 30, y: 40 },
        data: {},
        externalRefs: [],
      },
    ],
    edges: [
      {
        id: "0dc56b95-fd65-48b7-bb8d-7402c0dd92e2",
        projectId,
        sourceNodeId: "8f0f4805-5f98-471c-a074-67c196419b15",
        targetNodeId: "64c948e5-da1a-4c7f-9351-678f013720f9",
        kind: "contains" as const,
        label: "contains",
        data: {},
        externalRefs: [],
      },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function createGatewayMock(projectId: string) {
  let persisted = {
    id: "b22f2835-c768-45f4-a85f-bdc2fd6f2438",
    projectId,
    versionNumber: 1,
    revision: 1,
    label: "fase1-working-v1",
    snapshot: createBaseSnapshot(projectId),
    createdByIdentity: "admin@mapia.local",
    createdAt: new Date(),
  };

  const gateway: EditorSnapshotGateway = {
    loadWorkingSnapshot: vi.fn(async () => persisted),
    saveWorkingSnapshot: vi.fn(async (input) => {
      persisted = {
        ...persisted,
        label: input.label,
        snapshot: input.snapshot,
        createdByIdentity: input.actorIdentity,
        revision: persisted.revision + 1,
      };
      return persisted;
    }),
  };

  return { gateway, getPersisted: () => persisted };
}

describe("Editor use-cases", () => {
  const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";

  it("query returns working snapshot for editor", async () => {
    const { gateway } = createGatewayMock(projectId);
    const useCase = new GetWorkingSnapshotForEditorUseCase({
      editorSnapshotGateway: gateway,
    });

    const snapshot = await useCase.execute({ projectId });

    expect(snapshot?.projectId).toBe(projectId);
    expect(gateway.loadWorkingSnapshot).toHaveBeenCalledWith(projectId);
  });

  it("query fails when persisted snapshot is inconsistent", async () => {
    const { gateway, getPersisted } = createGatewayMock(projectId);
    const useCase = new GetWorkingSnapshotForEditorUseCase({
      editorSnapshotGateway: gateway,
    });

    const badSnapshot = {
      ...getPersisted().snapshot,
      edges: [
        ...getPersisted().snapshot.edges,
        {
          id: "f8c43637-b1db-431f-a7e2-86340db39664",
          projectId,
          sourceNodeId: getPersisted().snapshot.edges[0].sourceNodeId,
          targetNodeId: "aab3a841-da15-4fc5-9255-6a5d05826af5",
          kind: "references" as const,
          label: "orphan",
          data: {},
          externalRefs: [],
        },
      ],
    };

    (gateway.loadWorkingSnapshot as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...getPersisted(),
      snapshot: badSnapshot,
    });

    await expect(useCase.execute({ projectId })).rejects.toThrow(
      /source\/target deve existir/i,
    );
  });

  it("ApplyEditorCommandUseCase addNode", async () => {
    const { gateway } = createGatewayMock(projectId);
    const useCase = new ApplyEditorCommandUseCase({
      editorSnapshotGateway: gateway,
    });
    const nodeId = "2a03ff0f-4be9-4f3f-b1e9-84c4e79e5ff4";

    const result = await useCase.execute({
      projectId,
      command: {
        type: "addNode",
        node: {
          id: nodeId,
          kind: "entity",
          label: " User ",
          position: { x: 100, y: 200 },
          data: {},
        },
      },
    });

    expect(result.snapshot.nodes.find((node) => node.id === nodeId)?.label).toBe(
      "User",
    );
  });

  it("ApplyEditorCommandUseCase updateNode", async () => {
    const { gateway } = createGatewayMock(projectId);
    const useCase = new ApplyEditorCommandUseCase({
      editorSnapshotGateway: gateway,
    });
    const nodeId = "8f0f4805-5f98-471c-a074-67c196419b15";

    const result = await useCase.execute({
      projectId,
      command: {
        type: "updateNode",
        nodeId,
        patch: { label: " Atualizado ", kind: "entity", data: { ok: true } },
      },
    });

    const node = result.snapshot.nodes.find((item) => item.id === nodeId);
    expect(node?.label).toBe("Atualizado");
    expect(node?.data).toEqual({ ok: true });
  });

  it("ApplyEditorCommandUseCase moveNode", async () => {
    const { gateway } = createGatewayMock(projectId);
    const useCase = new ApplyEditorCommandUseCase({
      editorSnapshotGateway: gateway,
    });
    const nodeId = "64c948e5-da1a-4c7f-9351-678f013720f9";

    const result = await useCase.execute({
      projectId,
      command: {
        type: "moveNode",
        nodeId,
        position: { x: 500, y: 600 },
      },
    });

    const node = result.snapshot.nodes.find((item) => item.id === nodeId);
    expect(node?.position).toEqual({ x: 500, y: 600 });
  });

  it("ApplyEditorCommandUseCase removeNode cascades connected edges", async () => {
    const { gateway } = createGatewayMock(projectId);
    const useCase = new ApplyEditorCommandUseCase({
      editorSnapshotGateway: gateway,
    });
    const nodeId = "64c948e5-da1a-4c7f-9351-678f013720f9";

    const result = await useCase.execute({
      projectId,
      command: {
        type: "removeNode",
        nodeId,
      },
    });

    expect(result.snapshot.nodes.find((item) => item.id === nodeId)).toBeUndefined();
    expect(
      result.snapshot.edges.some(
        (edge) => edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId,
      ),
    ).toBe(false);
  });

  it("ApplyEditorCommandUseCase addEdge", async () => {
    const { gateway } = createGatewayMock(projectId);
    const useCase = new ApplyEditorCommandUseCase({
      editorSnapshotGateway: gateway,
    });
    const edgeId = "ba024055-0073-4584-a80f-fd9531b92936";

    const result = await useCase.execute({
      projectId,
      command: {
        type: "addEdge",
        edge: {
          id: edgeId,
          sourceNodeId: "64c948e5-da1a-4c7f-9351-678f013720f9",
          targetNodeId: "8f0f4805-5f98-471c-a074-67c196419b15",
          kind: "references",
          label: " reverse ",
          data: {},
        },
      },
    });

    expect(result.snapshot.edges.find((edge) => edge.id === edgeId)?.label).toBe(
      "reverse",
    );
  });

  it("ApplyEditorCommandUseCase updateEdge", async () => {
    const { gateway } = createGatewayMock(projectId);
    const useCase = new ApplyEditorCommandUseCase({
      editorSnapshotGateway: gateway,
    });
    const edgeId = "0dc56b95-fd65-48b7-bb8d-7402c0dd92e2";

    const result = await useCase.execute({
      projectId,
      command: {
        type: "updateEdge",
        edgeId,
        patch: { label: " mudou ", kind: "relates-to", data: { ok: 1 } },
      },
    });

    const edge = result.snapshot.edges.find((item) => item.id === edgeId);
    expect(edge?.label).toBe("mudou");
    expect(edge?.kind).toBe("relates-to");
    expect(edge?.data).toEqual({ ok: 1 });
  });

  it("ApplyEditorCommandUseCase removeEdge", async () => {
    const { gateway } = createGatewayMock(projectId);
    const useCase = new ApplyEditorCommandUseCase({
      editorSnapshotGateway: gateway,
    });
    const edgeId = "0dc56b95-fd65-48b7-bb8d-7402c0dd92e2";

    const result = await useCase.execute({
      projectId,
      command: {
        type: "removeEdge",
        edgeId,
      },
    });

    expect(result.snapshot.edges.find((item) => item.id === edgeId)).toBeUndefined();
  });

  it("ApplyEditorCommandUseCase rejects invalid command payload", async () => {
    const { gateway } = createGatewayMock(projectId);
    const useCase = new ApplyEditorCommandUseCase({
      editorSnapshotGateway: gateway,
    });

    await expect(
      useCase.execute({
        projectId,
        command: {
          type: "moveNode",
          nodeId: "8f0f4805-5f98-471c-a074-67c196419b15",
          position: { x: Number.NaN, y: 10 },
        },
      } as never),
    ).rejects.toThrow();

    expect(gateway.saveWorkingSnapshot).not.toHaveBeenCalled();
  });

  it("applies add/update/move/remove node commands and cascades edge removal", async () => {
    const { gateway } = createGatewayMock(projectId);
    const useCase = new ApplyEditorCommandsUseCase({
      editorSnapshotGateway: gateway,
    });

    const nodeId = "2a03ff0f-4be9-4f3f-b1e9-84c4e79e5ff4";
    const edgeId = "ba024055-0073-4584-a80f-fd9531b92936";

    const result = await useCase.execute({
      projectId,
      actorIdentity: "admin@mapia.local",
      commands: [
        {
          type: "addNode",
          node: {
            id: nodeId,
            kind: "entity",
            label: " User ",
            position: { x: 100, y: 200 },
            data: { foo: "bar" },
          },
        },
        {
          type: "updateNode",
          nodeId,
          patch: {
            label: " User Updated ",
            kind: "page",
            data: { x: 1 },
          },
        },
        {
          type: "moveNode",
          nodeId,
          position: { x: 150, y: 250 },
        },
        {
          type: "addEdge",
          edge: {
            id: edgeId,
            sourceNodeId: "8f0f4805-5f98-471c-a074-67c196419b15",
            targetNodeId: nodeId,
            kind: "references",
            label: " uses ",
            data: {},
          },
        },
        {
          type: "removeNode",
          nodeId,
        },
      ],
    });

    expect(result.snapshot.nodes.find((node) => node.id === nodeId)).toBeUndefined();
    expect(result.snapshot.edges.find((edge) => edge.id === edgeId)).toBeUndefined();
    expect(gateway.saveWorkingSnapshot).toHaveBeenCalled();
  });

  it("applies add/update/remove edge commands", async () => {
    const { gateway } = createGatewayMock(projectId);
    const useCase = new ApplyEditorCommandsUseCase({
      editorSnapshotGateway: gateway,
    });
    const edgeId = "ba024055-0073-4584-a80f-fd9531b92936";

    const result = await useCase.execute({
      projectId,
      commands: [
        {
          type: "addEdge",
          edge: {
            id: edgeId,
            sourceNodeId: "64c948e5-da1a-4c7f-9351-678f013720f9",
            targetNodeId: "8f0f4805-5f98-471c-a074-67c196419b15",
            kind: "references",
            label: " reverse ",
            data: { a: 1 },
          },
        },
        {
          type: "updateEdge",
          edgeId,
          patch: {
            label: " updated ",
            kind: "flows-to",
            data: { b: 2 },
          },
        },
        {
          type: "removeEdge",
          edgeId,
        },
      ],
    });

    expect(result.snapshot.edges.find((edge) => edge.id === edgeId)).toBeUndefined();
  });

  it("rejects invalid command payloads (empty patch)", async () => {
    const { gateway } = createGatewayMock(projectId);
    const useCase = new ApplyEditorCommandsUseCase({
      editorSnapshotGateway: gateway,
    });

    await expect(
      useCase.execute({
        projectId,
        commands: [
          {
            type: "updateNode",
            nodeId: "8f0f4805-5f98-471c-a074-67c196419b15",
            patch: {},
          } as never,
        ],
      }),
    ).rejects.toThrow();

    expect(gateway.saveWorkingSnapshot).not.toHaveBeenCalled();
  });

  it("rejects invalid edge references via invariant validation", async () => {
    const { gateway } = createGatewayMock(projectId);
    const useCase = new ApplyEditorCommandsUseCase({
      editorSnapshotGateway: gateway,
    });

    await expect(
      useCase.execute({
        projectId,
        commands: [
          {
            type: "addEdge",
            edge: {
              id: "3e520cc0-bf6d-4fc2-9bfc-b3e9ba19c311",
              sourceNodeId: "8f0f4805-5f98-471c-a074-67c196419b15",
              targetNodeId: "45d334f5-11dd-41f4-a31f-04106b8a56d4",
              kind: "contains",
              label: "bad",
              data: {},
            },
          },
        ],
      }),
    ).rejects.toThrow(/(source\/target deve existir|conexao incompleta)/i);
  });

  it("full snapshot save reuses domain validation policy", async () => {
    const { gateway } = createGatewayMock(projectId);
    const useCase = new SaveEditorFullSnapshotUseCase({
      editorSnapshotGateway: gateway,
    });

    const result = await useCase.execute({
      projectId,
      snapshot: {
        ...createBaseSnapshot(projectId),
        nodes: [
          {
            ...createBaseSnapshot(projectId).nodes[0],
            label: " Root Trim ",
          },
        ],
        edges: [],
      },
    });

    expect(result.snapshot.nodes[0].label).toBe("Root Trim");
  });
});
