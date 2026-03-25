import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RefObject } from "react";
import { applyEditorCommandsLocally } from "../editor-command-service";
import { createFocusModePanelState } from "./use-editor-canvas-ui-controller";
import {
  canBypassQueueFlush,
  useEditorCommandController,
} from "./use-editor-command-controller";
import {
  applyClipboardCommandsLocally,
  buildClipboardCommandsDraft,
  buildClipboardFragmentFromSelection,
  filterClipboardEdgesBySemanticRules,
  useEditorClipboardController,
} from "./use-editor-clipboard-controller";
import {
  buildErdFieldDrafts,
  resolveDefaultErdMaterializeState,
} from "./use-editor-erd-controller";
import {
  isClipboardPartialEdgePasteEnabled,
  sanitizeEditorPanelState,
  sanitizeInspectorSectionState,
  syncVersionNameDrafts,
} from "./editor-shell-utils";
import {
  createEdgeForEditor,
  updateNodeForEditor,
  validateSemanticDraftForEditor,
} from "../editor-query-service";

vi.mock("../editor-query-service", () => ({
  createEdgeForEditor: vi.fn(),
  updateNodeForEditor: vi.fn(),
  updateEdgeForEditor: vi.fn(),
  validateSemanticDraftForEditor: vi.fn(),
}));

vi.mock("../editor-command-service", async () => {
  const actual =
    await vi.importActual<typeof import("../editor-command-service")>(
      "../editor-command-service",
    );

  return {
    ...actual,
    applyEditorCommandsLocally: vi.fn(),
  };
});

function renderHookHarness<T>(render: () => T) {
  let resolved: T | null = null;

  function Harness() {
    resolved = render();
    return null;
  }

  renderToStaticMarkup(React.createElement(Harness));

  if (!resolved) {
    throw new Error("Hook harness did not resolve.");
  }

  return resolved as T;
}

function renderCommandController(input: Parameters<typeof useEditorCommandController>[0]) {
  return renderHookHarness(() => useEditorCommandController(input));
}

function renderClipboardController(
  input: Parameters<typeof useEditorClipboardController>[0],
) {
  return renderHookHarness(() => useEditorClipboardController(input));
}

function createMutableRef<T>(value: T) {
  return { current: value } as RefObject<T>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("editor shell controller helpers", () => {
  it("builds the focus mode panel state with all secondary panels hidden", () => {
    expect(createFocusModePanelState()).toEqual({
      metadata: false,
      prismaImport: false,
      versions: false,
    });
  });

  it("bypasses direct-write queue flush only when the editor is clean", () => {
    expect(
      canBypassQueueFlush({
        pendingCommandsLength: 0,
        isDirty: false,
      }),
    ).toBe(true);

    expect(
      canBypassQueueFlush({
        pendingCommandsLength: 1,
        isDirty: false,
      }),
    ).toBe(false);

    expect(
      canBypassQueueFlush({
        pendingCommandsLength: 0,
        isDirty: true,
      }),
    ).toBe(false);
  });

  it("flushes pending commands before direct write mutations and syncs the new revision", async () => {
    const flushPendingCommands = vi.fn(async () => {
      pendingCommandsRef.current = [];
    });
    const syncFromSnapshot = vi.fn();
    const setCurrentRevision = vi.fn();
    const pendingCommandsRef = createMutableRef([
      { type: "addNode", node: { id: "node-pending" } } as never,
    ]);
    const isSaveInFlightRef = createMutableRef(false);
    const currentRevisionRef = createMutableRef(7);
    const mockedCreateEdge = vi.mocked(createEdgeForEditor);

    mockedCreateEdge.mockResolvedValue({
      workingSnapshot: {
        snapshot: {
          id: "project-1",
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      },
      newRevision: 8,
    } as never);

    const controller = renderCommandController({
      projectId: "project-1",
      saveState: {
        isDirty: true,
      } as never,
      pendingCommandsRef,
      isSaveInFlightRef,
      currentRevisionRef,
      flushPendingCommands,
      syncFromSnapshot,
      setCurrentRevision,
    });

    const result = await controller.createEdgeDirect({
      edge: {
        sourceNodeId: "node-a",
        targetNodeId: "node-b",
        kind: "flows-to",
      },
      semanticMode: "operational",
    });

    expect(flushPendingCommands).toHaveBeenCalledWith("manual");
    expect(mockedCreateEdge).toHaveBeenCalledWith({
      projectId: "project-1",
      edge: {
        sourceNodeId: "node-a",
        targetNodeId: "node-b",
        kind: "flows-to",
      },
      expectedRevision: 7,
      semanticMode: "operational",
      allowSemanticOverride: undefined,
      overrideReason: undefined,
    });
    expect(syncFromSnapshot).toHaveBeenCalledWith({
      id: "project-1",
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    expect(setCurrentRevision).toHaveBeenCalledWith(8);
    expect(result).toMatchObject({
      ok: true,
      result: {
        newRevision: 8,
      },
    });
  });

  it("blocks direct write mutations when the queue remains busy after flushing", async () => {
    const flushPendingCommands = vi.fn(async () => undefined);
    const pendingCommandsRef = createMutableRef([
      { type: "addNode", node: { id: "node-pending" } } as never,
    ]);
    const mockedUpdateNode = vi.mocked(updateNodeForEditor);

    const controller = renderCommandController({
      projectId: "project-1",
      saveState: {
        isDirty: true,
      } as never,
      pendingCommandsRef,
      isSaveInFlightRef: createMutableRef(false),
      currentRevisionRef: createMutableRef(4),
      flushPendingCommands,
      syncFromSnapshot: vi.fn(),
      setCurrentRevision: vi.fn(),
    });

    const result = await controller.updateNodeDirect({
      nodeId: "node-a",
      patch: {
        label: "Atualizado",
      },
      semanticMode: "technical",
    });

    expect(flushPendingCommands).toHaveBeenCalledWith("manual");
    expect(mockedUpdateNode).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      reason: "blocked",
    });
  });

  it("builds ERD field drafts from the selected entity payload", () => {
    expect(
      buildErdFieldDrafts({
        fields: [
          {
            id: "customer-id",
            name: "customer_id",
            type: "uuid",
            flags: ["PK", "NOT_NULL"],
          },
          {
            id: "email",
            name: "email",
            type: "string",
            flags: ["UQ"],
          },
        ],
      } as never),
    ).toEqual({
      "customer-id": {
        name: "customer_id",
        type: "uuid",
      },
      email: {
        name: "email",
        type: "string",
      },
    });
  });

  it("resolves ERD materialization defaults from an FK relation", () => {
    expect(
      resolveDefaultErdMaterializeState({
        selectedEdge: {
          source: "customer",
          target: "order",
        } as never,
        selectedErdRelationPayload: {
          materialization: {
            mode: "fk",
            dependentSide: "source",
            fk: {
              unique: true,
            },
          },
        } as never,
        selectedErdSourceEntityNode: null,
        selectedErdTargetEntityNode: null,
      }),
    ).toEqual({
      dependentSide: "source",
      existingFieldId: "__new__",
      unique: true,
    });
  });

  it("sanitizes persisted panel and inspector state snapshots", () => {
    expect(
      sanitizeEditorPanelState({
        metadata: false,
        prismaImport: "invalid",
        versions: true,
      }),
    ).toEqual({
      metadata: false,
      prismaImport: true,
      versions: true,
    });

    expect(
      sanitizeInspectorSectionState({
        general: false,
        details: true,
        relations: "invalid",
        advanced: true,
      }),
    ).toEqual({
      general: false,
      details: true,
      relations: true,
      advanced: true,
    });
  });

  it("keeps local version name drafts aligned with current versions", () => {
    expect(
      syncVersionNameDrafts({
        currentDrafts: {
          v1: "Arquitetura atual",
          stale: "old",
        },
        localVersionNames: {
          v1: "Arquitetura atual",
          v2: "Split shell",
        },
        snapshotVersions: [
          {
            id: "v1",
            projectId: "project-1",
            origin: "manual",
            createdAt: "2026-03-25T10:00:00.000Z",
          },
          {
            id: "v2",
            projectId: "project-1",
            origin: "manual",
            createdAt: "2026-03-25T11:00:00.000Z",
          },
        ],
      }),
    ).toEqual({
      stale: "old",
      v1: "Arquitetura atual",
      v2: "Split shell",
    });
  });

  it("reads clipboard partial-edge policy flags from custom semantic rules", () => {
    expect(
      isClipboardPartialEdgePasteEnabled({
        customRulesJson: {
          clipboard: {
            allowPartialEdgePaste: true,
          },
        },
      } as never),
    ).toBe(true);

    expect(
      isClipboardPartialEdgePasteEnabled({
        customRulesJson: {},
      } as never),
    ).toBe(false);
  });

  it("builds a clipboard fragment from the current node selection", () => {
    expect(
      buildClipboardFragmentFromSelection({
        projectId: "project-1",
        selectedNode: {
          id: "node-a",
          position: { x: 120, y: 64 },
          data: {
            kind: "flow-step",
            label: "Registrar pedido",
            payload: { description: "Abertura" },
          },
        } as never,
        selectedEdge: null,
        nodes: [],
      }),
    ).toEqual({
      version: 1,
      sourceProjectId: "project-1",
      nodes: [
        {
          id: "node-a",
          kind: "flow-step",
          label: "Registrar pedido",
          position: { x: 120, y: 64 },
          data: { description: "Abertura" },
        },
      ],
      edges: [],
    });
  });

  it("builds clipboard commands with duplicated labels and stable selection focus", () => {
    const draft = buildClipboardCommandsDraft({
      version: 1,
      sourceProjectId: "project-1",
      nodes: [
        {
          id: "node-a",
          kind: "flow-step",
          label: "Registrar pedido",
          position: { x: 100, y: 80 },
          data: { description: "Abertura" },
        },
        {
          id: "node-b",
          kind: "flow-step",
          label: "Validar pedido",
          position: { x: 320, y: 80 },
          data: { description: "Validacao" },
        },
      ],
      edges: [
        {
          id: "edge-a",
          sourceNodeId: "node-a",
          targetNodeId: "node-b",
          kind: "flows-to",
          label: "Fluxo",
          data: {},
        },
      ],
    });

    expect(draft.nodeCommands).toHaveLength(2);
    expect(draft.edgeCommands).toHaveLength(1);
    expect(draft.nodeCommands[0]?.node.label).toBe("Registrar pedido (copia)");
    expect(draft.firstInsertedNodeId).toBe(draft.nodeCommands[0]?.node.id);
    expect(draft.nodeCommands[0]?.node.position).toEqual({ x: 210, y: 112 });
  });

  it("applies clipboard commands locally and focuses the first inserted node", () => {
    const commandsApplied: string[] = [];
    let selection: { nodeId: string | null; edgeId: string | null } | null = null;
    const draft = buildClipboardCommandsDraft({
      version: 1,
      sourceProjectId: "project-1",
      nodes: [
        {
          id: "node-a",
          kind: "flow-step",
          label: "Registrar pedido",
          position: { x: 100, y: 80 },
          data: {},
        },
      ],
      edges: [],
    });

    const result = applyClipboardCommandsLocally({
      draft,
      applyLocalCommandAndQueue: (command) => {
        commandsApplied.push(command.type);
        return true;
      },
      selectItem: (next) => {
        selection = next;
      },
    });

    expect(result).toEqual({
      appliedNodes: 1,
      appliedEdges: 0,
      skippedEdges: 0,
    });
    expect(commandsApplied).toEqual(["addNode"]);
    expect(selection).toEqual({
      nodeId: draft.firstInsertedNodeId ?? null,
      edgeId: null,
    });
  });

  it("filters invalid clipboard edges through semantic rules before paste", () => {
    const filtered = filterClipboardEdgesBySemanticRules({
      draft: {
        nodeCommands: [
          {
            type: "addNode",
            node: {
              id: "node-a",
              kind: "flow-step",
              label: "Registrar pedido (copia)",
              position: { x: 120, y: 64 },
              data: {},
            },
          },
          {
            type: "addNode",
            node: {
              id: "node-b",
              kind: "flow-step",
              label: "Validar pedido (copia)",
              position: { x: 320, y: 64 },
              data: {},
            },
          },
        ],
        edgeCommands: [
          {
            type: "addEdge",
            edge: {
              id: "edge-a",
              sourceNodeId: "node-a",
              targetNodeId: "node-b",
              kind: "references",
              label: "Invalida",
              data: {},
            },
          },
        ],
        skippedEdges: 0,
        firstInsertedNodeId: "node-a",
      },
      diagramType: "flow",
      inspectorMode: "operational",
    });

    expect(filtered.edgeCommands).toHaveLength(0);
    expect(filtered.skippedEdges).toBe(1);
  });

  it("cuts the current selection through the clipboard workflow", async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText,
      },
    });

    const setQuerySyncMessage = vi.fn();
    const handleRemoveSelected = vi.fn();
    const controller = renderClipboardController({
      projectId: "project-1",
      editorT: ((key: string) => key) as never,
      selectedNode: {
        id: "node-a",
        position: { x: 120, y: 64 },
        data: {
          kind: "flow-step",
          label: "Registrar pedido",
          payload: { description: "Abertura" },
        },
      } as never,
      selectedEdge: null,
      nodesRef: createMutableRef([]),
      getCurrentSnapshot: vi.fn(),
      applyLocalCommandAndQueue: vi.fn(() => true),
      selectItem: vi.fn(),
      handleRemoveSelected,
      inspectorMode: "operational",
      semanticDiagramType: "flow",
      semanticEngineOptions: undefined,
      semanticPolicy: null,
      setSemanticPolicy: vi.fn(),
      setQuerySyncMessage,
      setGlobalErrorMessage: vi.fn(),
    });

    const result = await controller.handleCutSelectionToClipboard();

    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    const clipboardPayload = writeText.mock.calls.at(0)?.[0];
    if (typeof clipboardPayload !== "string") {
      throw new Error("Clipboard payload was not written as text.");
    }
    expect(JSON.parse(clipboardPayload)).toMatchObject({
      version: 1,
      nodes: [
        {
          id: "node-a",
          label: "Registrar pedido",
        },
      ],
      edges: [],
    });
    expect(handleRemoveSelected).toHaveBeenCalledTimes(1);
    expect(setQuerySyncMessage).toHaveBeenLastCalledWith("shell.messages.selectionCut");
  });

  it("pastes a MapIA fragment through semantic validation and focuses the inserted node", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        readText: vi.fn(async () =>
          JSON.stringify({
            version: 1,
            sourceProjectId: "project-1",
            nodes: [
              {
                id: "node-a",
                kind: "flow-step",
                label: "Registrar pedido",
                position: { x: 120, y: 64 },
                data: { description: "Abertura" },
              },
            ],
            edges: [],
          }),
        ),
      },
    });

    const applyLocalCommandAndQueue = vi.fn(() => true);
    const selectItem = vi.fn();
    const setQuerySyncMessage = vi.fn();
    const setGlobalErrorMessage = vi.fn();
    const setSemanticPolicy = vi.fn();
    const mockedValidateDraft = vi.mocked(validateSemanticDraftForEditor);
    const mockedApplyEditorCommandsLocally = vi.mocked(applyEditorCommandsLocally);

    mockedApplyEditorCommandsLocally.mockReturnValue({
      id: "project-1",
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    } as never);
    mockedValidateDraft.mockResolvedValue({
      policy: {
        enforceOnServer: false,
        strictEnabled: false,
      },
      bySeverity: {
        error: 0,
      },
      issues: [],
    } as never);

    const controller = renderClipboardController({
      projectId: "project-1",
      editorT: ((key: string) => key) as never,
      selectedNode: null,
      selectedEdge: null,
      nodesRef: createMutableRef([]),
      getCurrentSnapshot: vi.fn(() => ({
        id: "project-1",
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      })),
      applyLocalCommandAndQueue,
      selectItem,
      handleRemoveSelected: vi.fn(),
      inspectorMode: "operational",
      semanticDiagramType: "flow",
      semanticEngineOptions: undefined,
      semanticPolicy: null,
      setSemanticPolicy,
      setQuerySyncMessage,
      setGlobalErrorMessage,
    });

    const result = await controller.handlePasteFromClipboard();

    expect(result).toBe(true);
    expect(mockedValidateDraft).toHaveBeenCalledTimes(1);
    expect(setSemanticPolicy).toHaveBeenCalledWith({
      enforceOnServer: false,
      strictEnabled: false,
    });
    expect(applyLocalCommandAndQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "addNode",
      }),
    );
    expect(selectItem).toHaveBeenCalledWith({
      nodeId: expect.any(String),
      edgeId: null,
    });
    expect(setGlobalErrorMessage).toHaveBeenCalledWith(null);
    expect(setQuerySyncMessage).toHaveBeenCalledWith("shell.messages.pasteCompleted");
  });
});
