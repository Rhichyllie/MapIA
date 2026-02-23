"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import type {
  Connection,
  Edge as FlowEdge,
  Node as FlowNode,
  Viewport,
} from "@xyflow/react";
import type { Edge, ExternalRef, GraphSnapshot, Node } from "@/src/domain";

type EditorProjectViewModel = {
  id: string;
  name: string;
  slug: string;
};

type EditorShellProps = {
  project: EditorProjectViewModel;
  initialSnapshot: GraphSnapshot;
};

type EditorNodeData = {
  label: string;
  kind: Node["kind"];
  payload: Record<string, unknown>;
  externalRefs: ExternalRef[];
};

type EditorEdgeData = {
  kind: Edge["kind"];
  payload: Record<string, unknown>;
  externalRefs: ExternalRef[];
};

type RFNode = FlowNode<EditorNodeData>;
type RFEdge = FlowEdge<EditorEdgeData>;

function toFlowNodes(snapshot: GraphSnapshot): RFNode[] {
  return snapshot.nodes.map((node) => ({
    id: node.id,
    position: node.position,
    type: node.kind === "project" ? "input" : undefined,
    data: {
      label: node.label,
      kind: node.kind,
      payload: node.data,
      externalRefs: node.externalRefs,
    },
  }));
}

function toFlowEdges(snapshot: GraphSnapshot): RFEdge[] {
  return snapshot.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    label: edge.label,
    data: {
      kind: edge.kind,
      payload: edge.data,
      externalRefs: edge.externalRefs,
    },
  }));
}

function toCanonicalSnapshot(
  projectId: string,
  nodes: RFNode[],
  edges: RFEdge[],
  viewport: Viewport,
): GraphSnapshot {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      projectId,
      kind: node.data.kind,
      label: node.data.label,
      position: {
        x: node.position.x,
        y: node.position.y,
      },
      data: node.data.payload,
      externalRefs: node.data.externalRefs,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      projectId,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      kind: edge.data?.kind ?? "flows-to",
      label: edge.label ? String(edge.label) : undefined,
      data: edge.data?.payload ?? {},
      externalRefs: edge.data?.externalRefs ?? [],
    })),
    viewport: {
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom,
    },
  };
}

export function EditorShell({ project, initialSnapshot }: EditorShellProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(
    toFlowNodes(initialSnapshot),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>(
    toFlowEdges(initialSnapshot),
  );
  const [viewport, setViewport] = useState<Viewport>(initialSnapshot.viewport);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );

  function onConnect(connection: Connection) {
    if (!connection.source || !connection.target) {
      return;
    }

    setEdges((current) =>
      addEdge(
        {
          id: crypto.randomUUID(),
          source: connection.source,
          target: connection.target,
          label: "relacao",
          data: {
            kind: "flows-to",
            payload: {},
            externalRefs: [],
          },
        },
        current,
      ),
    );
    setMessage(null);
    setErrorMessage(null);
  }

  function handleAddNode() {
    const nextNodeId = crypto.randomUUID();
    const offset = nodes.length * 32;

    setNodes((current) => [
      ...current,
      {
        id: nextNodeId,
        position: { x: 120 + offset, y: 120 + offset / 2 },
        data: {
          label: `Novo no ${current.length + 1}`,
          kind: "note",
          payload: {},
          externalRefs: [],
        },
      },
    ]);
    setSelectedNodeId(nextNodeId);
    setSelectedEdgeId(null);
    setMessage(null);
    setErrorMessage(null);
  }

  function handleRemoveSelected() {
    if (selectedNodeId) {
      setNodes((current) =>
        current.filter((node) => node.id !== selectedNodeId),
      );
      setEdges((current) =>
        current.filter(
          (edge) =>
            edge.source !== selectedNodeId && edge.target !== selectedNodeId,
        ),
      );
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setMessage(null);
      return;
    }

    if (selectedEdgeId) {
      setEdges((current) =>
        current.filter((edge) => edge.id !== selectedEdgeId),
      );
      setSelectedEdgeId(null);
      setMessage(null);
    }
  }

  function handleNodeLabelChange(nextLabel: string) {
    if (!selectedNodeId) return;

    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                label: nextLabel,
              },
            }
          : node,
      ),
    );
    setMessage(null);
    setErrorMessage(null);
  }

  function handleSave() {
    startTransition(async () => {
      setMessage(null);
      setErrorMessage(null);
      try {
        const snapshot = toCanonicalSnapshot(
          project.id,
          nodes,
          edges,
          viewport,
        );
        const response = await fetch(
          `/api/projects/${project.id}/working-snapshot`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              label: "fase1-working-v1",
              snapshot,
            }),
          },
        );
        const payload = (await response.json()) as { message?: string };

        if (!response.ok) {
          throw new Error(
            payload.message ?? "Nao foi possivel salvar o snapshot.",
          );
        }

        setMessage("Snapshot salvo com sucesso.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Falha ao salvar o snapshot.",
        );
      }
    });
  }

  return (
    <div className="editor-grid">
      <div>
        <div className="row-actions" style={{ marginBottom: "0.85rem" }}>
          <span className="badge">
            <span className="badge-dot" aria-hidden="true" />
            Snapshot de trabalho (v1 mutavel / Fase 1)
          </span>
          <span className="muted">
            Projeto: <code className="mono">{project.slug}</code>
          </span>
        </div>

        <div className="row-actions" style={{ marginBottom: "0.85rem" }}>
          <button
            className="btn"
            type="button"
            onClick={handleAddNode}
            disabled={isPending}
          >
            Adicionar node
          </button>
          <button
            className="btn"
            type="button"
            onClick={handleRemoveSelected}
            disabled={isPending || (!selectedNodeId && !selectedEdgeId)}
          >
            Remover selecionado
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? "Salvando..." : "Salvar"}
          </button>
          {message ? <span className="helper">{message}</span> : null}
          {errorMessage ? (
            <span className="helper" style={{ color: "var(--danger)" }}>
              {errorMessage}
            </span>
          ) : null}
        </div>

        <div
          className="canvas-frame"
          role="region"
          aria-label="Canvas do editor"
        >
          <ReactFlow<RFNode, RFEdge>
            fitView
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onMoveEnd={(_, nextViewport) => setViewport(nextViewport)}
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id);
              setSelectedEdgeId(null);
            }}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
            colorMode="light"
            defaultViewport={initialSnapshot.viewport}
          >
            <Background gap={18} color="rgba(17, 94, 89, 0.12)" />
            <MiniMap
              pannable
              zoomable
              style={{ background: "rgba(255,255,255,0.9)", borderRadius: 10 }}
            />
            <Controls />
          </ReactFlow>
        </div>
      </div>

      <aside className="inspector" aria-label="Inspector">
        <div>
          <h3>Inspector</h3>
          <p className="helper">
            Edicao minima de label e controle de selecao para nodes/edges.
          </p>
        </div>

        {selectedNode ? (
          <div className="stack-sm">
            <span className="badge">Node</span>
            <div className="field">
              <label htmlFor="node-label-input">Label</label>
              <input
                id="node-label-input"
                value={selectedNode.data.label}
                onChange={(event) => handleNodeLabelChange(event.target.value)}
              />
            </div>
            <dl>
              <div>
                <dt>ID</dt>
                <dd>{selectedNode.id}</dd>
              </div>
              <div>
                <dt>Kind</dt>
                <dd>{selectedNode.data.kind}</dd>
              </div>
              <div>
                <dt>Posicao</dt>
                <dd>
                  {Math.round(selectedNode.position.x)},{" "}
                  {Math.round(selectedNode.position.y)}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        {selectedEdge ? (
          <div className="stack-sm">
            <span className="badge">Edge</span>
            <dl>
              <div>
                <dt>ID</dt>
                <dd>{selectedEdge.id}</dd>
              </div>
              <div>
                <dt>Kind</dt>
                <dd>{selectedEdge.data?.kind ?? "flows-to"}</dd>
              </div>
              <div>
                <dt>Ligacao</dt>
                <dd>
                  {selectedEdge.source} -&gt; {selectedEdge.target}
                </dd>
              </div>
            </dl>
            <button
              className="btn"
              type="button"
              onClick={handleRemoveSelected}
            >
              Remover edge
            </button>
          </div>
        ) : null}

        {!selectedNode && !selectedEdge ? (
          <div>
            <p className="helper">Nenhum item selecionado.</p>
            <dl>
              <div>
                <dt>Nodes</dt>
                <dd>{nodes.length}</dd>
              </div>
              <div>
                <dt>Edges</dt>
                <dd>{edges.length}</dd>
              </div>
              <div>
                <dt>Viewport</dt>
                <dd>
                  {Math.round(viewport.x)}, {Math.round(viewport.y)} @{" "}
                  {viewport.zoom.toFixed(2)}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
