"use client";

import { useMemo } from "react";
import {
  Background,
  ConnectionLineType,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import type { Connection } from "@xyflow/react";
import type { ProjectTemplate } from "@/src/modules/projects/domain";
import type { EditorTranslationFn } from "./editor-i18n";
import type { RFEdge, RFNode } from "./editor-graph-mappers";
import { resolveEditorDiagramMode } from "./diagram-modes";
import {
  computeParallelEdgeMeta,
} from "./diagram-renderers";
import { getEdgeKindLabel, getNodeKindLabel } from "./presentation/kinds";
import { useEditorTranslations } from "./use-editor-translations";

type EditorCanvasProps = {
  diagramType?: string;
  template?: ProjectTemplate;
};

export function EditorCanvas({
  diagramType = "flow",
  template = "graph",
}: EditorCanvasProps) {
  const t = useEditorTranslations() as unknown as EditorTranslationFn;
  const renderer = resolveEditorDiagramMode({
    diagramType,
    template,
  }).renderer;
  const initialNodes = useMemo<RFNode[]>(
    () => [
      {
        id: "workspace",
        position: { x: 40, y: 60 },
        data: {
          label: getNodeKindLabel("workspace", "operational", t),
          kind: "workspace",
          payload: {},
          externalRefs: [],
        },
      },
      {
        id: "project",
        position: { x: 280, y: 160 },
        data: {
          label: getNodeKindLabel("project", "operational", t),
          kind: "project",
          payload: {},
          externalRefs: [],
        },
      },
      {
        id: "snapshot",
        position: { x: 540, y: 80 },
        data: {
          label: getNodeKindLabel("note", "operational", t),
          kind: "note",
          payload: {},
          externalRefs: [],
        },
      },
    ],
    [t],
  );
  const initialEdges = useMemo<RFEdge[]>(
    () => [
      {
        id: "e1",
        source: "workspace",
        target: "project",
        label: getEdgeKindLabel("contains", "operational", t),
        data: { kind: "contains", payload: {}, externalRefs: [] },
      },
      {
        id: "e2",
        source: "project",
        target: "snapshot",
        label: getEdgeKindLabel("references", "operational", t),
        data: { kind: "references", payload: {}, externalRefs: [] },
      },
    ],
    [t],
  );
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const renderedNodes = nodes.map((node) => ({
    ...node,
    type: renderer.nodeType,
    data: {
      ...node.data,
      rendererDirection: renderer.treeDirection,
      rendererIsRoot: node.id === nodes[0]?.id,
    },
  }));
  const renderedEdges = computeParallelEdgeMeta(
    edges.map((edge) => ({
      ...edge,
      type: renderer.defaultEdgeOptions.type,
      markerEnd: renderer.defaultEdgeOptions.markerEnd,
      className: `${renderer.defaultEdgeOptions.className} editor-edge-renderer-${renderer.key}`,
    })),
  );

  function onConnect(connection: Connection) {
    if (!connection.source || !connection.target) {
      return;
    }

    const sourceNodeId = connection.source;
    const targetNodeId = connection.target;

    setEdges((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        source: sourceNodeId,
        target: targetNodeId,
        label: getEdgeKindLabel("relates-to", "operational", t),
        data: { kind: "relates-to", payload: {}, externalRefs: [] },
      },
    ]);
  }

  return (
    <div
      className={renderer.canvasClassName}
      role="region"
      aria-label={t("shell.canvasAriaLabel")}
      data-testid="editor-canvas"
      data-diagram-renderer={renderer.key}
    >
      <ReactFlow
        fitView
        nodes={renderedNodes}
        edges={renderedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={renderer.nodeTypes}
        edgeTypes={renderer.edgeTypes}
        defaultEdgeOptions={renderer.defaultEdgeOptions}
        connectionLineType={
          renderer.connectionLineType ?? ConnectionLineType.Bezier
        }
        colorMode="light"
      >
        <Background
          gap={renderer.backgroundConfig.gap}
          variant={renderer.backgroundConfig.variant}
          color="var(--canvas-grid-color)"
          className={`editor-canvas-background ${renderer.backgroundConfig.className}`}
        />
        <MiniMap pannable zoomable className={renderer.minimapClassName} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
