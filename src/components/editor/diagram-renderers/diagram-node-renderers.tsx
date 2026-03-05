import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { EditorNodeData } from "../editor-graph-mappers";
import { getNodeKindPresentation } from "../presentation/kinds";

function toEditorNodeData(data: unknown): EditorNodeData {
  return data as EditorNodeData;
}

function resolveTreeHandlePosition(direction: EditorNodeData["rendererDirection"]) {
  if (direction === "left-right") {
    return {
      source: Position.Right,
      target: Position.Left,
    } as const;
  }

  return {
    source: Position.Bottom,
    target: Position.Top,
  } as const;
}

function readEntityFields(payload: Record<string, unknown>) {
  const rawFields = payload.fields;

  if (!Array.isArray(rawFields)) {
    return [];
  }

  return rawFields
    .slice(0, 4)
    .map((field) => {
      if (typeof field === "string") {
        return field;
      }

      if (!field || typeof field !== "object") {
        return null;
      }

      const fieldName = (field as { name?: unknown }).name;
      const fieldType = (field as { type?: unknown }).type;

      if (typeof fieldName === "string" && typeof fieldType === "string") {
        return `${fieldName}: ${fieldType}`;
      }

      if (typeof fieldName === "string") {
        return fieldName;
      }

      return null;
    })
    .filter((value): value is string => Boolean(value));
}

function toKindClassToken(kind: string) {
  return kind.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function resolveDisplayLabel(nodeData: EditorNodeData) {
  const fromPresentation = nodeData.displayLabel?.trim();
  if (fromPresentation) {
    return fromPresentation;
  }

  const fallback = nodeData.label?.trim();
  return fallback || "Sem titulo";
}

function NodeTypeChip({ nodeData }: { nodeData: EditorNodeData }) {
  const kindPresentation = getNodeKindPresentation(nodeData.kind);

  return (
    <span className={`diagram-node-type-chip tone-${kindPresentation.tone}`}>
      <svg
        className="diagram-node-type-chip__icon"
        viewBox={kindPresentation.icon.viewBox}
        aria-hidden="true"
        focusable="false"
      >
        <path d={kindPresentation.icon.path} fill="currentColor" />
      </svg>
      <span>{kindPresentation.labelOperational}</span>
    </span>
  );
}

function NodeTechnicalMeta({ nodeData }: { nodeData: EditorNodeData }) {
  if (nodeData.presentationMode !== "technical") {
    return null;
  }

  return <span className="diagram-node__meta">kind: {nodeData.kind}</span>;
}

function NodeContent({ nodeData }: { nodeData: EditorNodeData }) {
  return (
    <>
      <div className="diagram-node__header-row">
        <NodeTypeChip nodeData={nodeData} />
      </div>
      <strong className="diagram-node__title">{resolveDisplayLabel(nodeData)}</strong>
      <NodeTechnicalMeta nodeData={nodeData} />
    </>
  );
}

function useNodeVisualTokens(nodeData: EditorNodeData) {
  const kindPresentation = getNodeKindPresentation(nodeData.kind);
  const kindToken = toKindClassToken(nodeData.kind);

  return {
    kindPresentation,
    kindToken,
    className: [
      `diagram-node-kind-${kindToken}`,
      `diagram-node-tone-${kindPresentation.tone}`,
    ].join(" "),
  };
}

export function TreeNodeRenderer({ data }: NodeProps) {
  const nodeData = toEditorNodeData(data);
  const positions = resolveTreeHandlePosition(nodeData.rendererDirection);
  const visual = useNodeVisualTokens(nodeData);

  return (
    <div
      className={`diagram-node diagram-node-tree ${visual.className}`}
      data-testid="tree-node-renderer"
      data-node-kind={nodeData.kind}
      data-node-tone={visual.kindPresentation.tone}
    >
      <Handle
        type="target"
        position={positions.target}
        className="diagram-port diagram-port-target"
      />
      <div className="diagram-node-tree__content">
        <NodeContent nodeData={nodeData} />
      </div>
      <Handle
        type="source"
        position={positions.source}
        className="diagram-port diagram-port-source"
      />
    </div>
  );
}

export function FlowNodeRenderer({ data }: NodeProps) {
  const nodeData = toEditorNodeData(data);
  const visual = useNodeVisualTokens(nodeData);

  return (
    <div
      className={`diagram-node diagram-node-flow ${visual.className}`}
      data-testid="flow-node-renderer"
      data-node-kind={nodeData.kind}
      data-node-tone={visual.kindPresentation.tone}
    >
      <Handle type="target" position={Position.Left} className="diagram-port diagram-port-target" />
      <NodeContent nodeData={nodeData} />
      <Handle type="source" position={Position.Right} className="diagram-port diagram-port-source" />
    </div>
  );
}

export function MindmapNodeRenderer({ data }: NodeProps) {
  const nodeData = toEditorNodeData(data);
  const visual = useNodeVisualTokens(nodeData);

  return (
    <div
      className={`diagram-node diagram-node-mindmap ${nodeData.rendererIsRoot ? "is-root" : ""} ${visual.className}`}
      data-testid="mindmap-node-renderer"
      data-node-kind={nodeData.kind}
      data-node-tone={visual.kindPresentation.tone}
    >
      <Handle type="target" position={Position.Left} className="diagram-port diagram-port-target" />
      <NodeContent nodeData={nodeData} />
      <Handle type="source" position={Position.Right} className="diagram-port diagram-port-source" />
    </div>
  );
}

export function ErdNodeRenderer({ data }: NodeProps) {
  const nodeData = toEditorNodeData(data);
  const fields = readEntityFields(nodeData.payload);
  const visual = useNodeVisualTokens(nodeData);

  return (
    <div
      className={`diagram-node diagram-node-erd ${visual.className}`}
      data-testid="erd-node-renderer"
      data-node-kind={nodeData.kind}
      data-node-tone={visual.kindPresentation.tone}
    >
      <Handle type="target" position={Position.Left} className="diagram-port diagram-port-target" />
      <div className="diagram-node-erd__title">
        <NodeContent nodeData={nodeData} />
      </div>
      <div className="diagram-node-erd__rows">
        {fields.length > 0 ? (
          fields.map((field) => (
            <div key={field} className="diagram-node-erd__row">
              {field}
            </div>
          ))
        ) : (
          <div className="diagram-node-erd__row">id: string</div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="diagram-port diagram-port-source" />
    </div>
  );
}

export function SitemapNodeRenderer({ data }: NodeProps) {
  const nodeData = toEditorNodeData(data);
  const visual = useNodeVisualTokens(nodeData);

  return (
    <div
      className={`diagram-node diagram-node-sitemap ${visual.className}`}
      data-testid="sitemap-node-renderer"
      data-node-kind={nodeData.kind}
      data-node-tone={visual.kindPresentation.tone}
    >
      <Handle type="target" position={Position.Top} className="diagram-port diagram-port-target" />
      <NodeContent nodeData={nodeData} />
      <Handle type="source" position={Position.Bottom} className="diagram-port diagram-port-source" />
    </div>
  );
}

export function GraphNodeRenderer({ data }: NodeProps) {
  const nodeData = toEditorNodeData(data);
  const visual = useNodeVisualTokens(nodeData);

  return (
    <div
      className={`diagram-node diagram-node-graph ${visual.className}`}
      data-testid="graph-node-renderer"
      data-node-kind={nodeData.kind}
      data-node-tone={visual.kindPresentation.tone}
    >
      <Handle type="target" position={Position.Left} className="diagram-port diagram-port-target" />
      <NodeContent nodeData={nodeData} />
      <Handle type="source" position={Position.Right} className="diagram-port diagram-port-source" />
    </div>
  );
}
