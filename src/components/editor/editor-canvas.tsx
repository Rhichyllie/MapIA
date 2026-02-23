"use client";

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
} from "@xyflow/react";

const initialNodes: FlowNode[] = [
  {
    id: "workspace",
    position: { x: 40, y: 60 },
    data: { label: "Workspace" },
    type: "input",
  },
  {
    id: "project",
    position: { x: 280, y: 160 },
    data: { label: "Project" },
  },
  {
    id: "snapshot",
    position: { x: 540, y: 80 },
    data: { label: "GraphVersion (snapshot)" },
  },
];

const initialEdges: FlowEdge[] = [
  { id: "e1", source: "workspace", target: "project", label: "contains" },
  { id: "e2", source: "project", target: "snapshot", label: "versions" },
];

export function EditorCanvas() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  function onConnect(connection: Connection) {
    setEdges((current) => addEdge(connection, current));
  }

  return (
    <div className="canvas-frame" role="region" aria-label="Canvas do editor">
      <ReactFlow
        fitView
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        colorMode="light"
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
  );
}
