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

type ErdFieldRow = {
  id: string;
  name: string;
  type: string;
  flags: string;
};

function readEntityFields(payload: Record<string, unknown>) {
  const rawFields = payload.fields;

  if (!Array.isArray(rawFields)) {
    return [] as ErdFieldRow[];
  }

  return rawFields
    .slice(0, 8)
    .map((field, index) => {
      if (typeof field === "string") {
        const [rawName, rawType] = field.split(":");
        const name = rawName?.trim() || `campo_${index + 1}`;
        const type = rawType?.trim() || "String";
        return {
          id: `${name}-${index}`,
          name,
          type,
          flags: "-",
        } satisfies ErdFieldRow;
      }

      if (!field || typeof field !== "object") {
        return null;
      }

      const parsedField = field as {
        name?: unknown;
        type?: unknown;
        isId?: unknown;
        isUnique?: unknown;
        isOptional?: unknown;
      };
      const fieldName =
        typeof parsedField.name === "string"
          ? parsedField.name
          : `campo_${index + 1}`;
      const fieldType =
        typeof parsedField.type === "string" ? parsedField.type : "String";
      const flags: string[] = [];

      if (parsedField.isId === true) {
        flags.push("PK");
      }
      if (parsedField.isUnique === true) {
        flags.push("UNQ");
      }
      if (parsedField.isOptional === false) {
        flags.push("NOT NULL");
      }

      return {
        id: `${fieldName}-${index}`,
        name: fieldName,
        type: fieldType,
        flags: flags.length > 0 ? flags.join(" | ") : "-",
      } satisfies ErdFieldRow;
    })
    .filter((value): value is ErdFieldRow => Boolean(value));
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
  const canToggleTreeSubtree = typeof nodeData.onToggleTreeCollapse === "function";

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
        <div className="diagram-node-tree__toolbar">
          <span className="diagram-node-tree__level-badge">Hierarquia</span>
          {canToggleTreeSubtree ? (
            <button
              className="diagram-node-tree__toggle"
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (nodeData.nodeId) {
                  nodeData.onToggleTreeCollapse?.(nodeData.nodeId);
                }
              }}
              data-testid="tree-node-collapse-toggle"
            >
              {nodeData.rendererTreeCollapsed ? "Expandir" : "Colapsar"}
            </button>
          ) : null}
        </div>
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
      <div className="diagram-node-flow__body">
        <div className="diagram-node-flow__header">
          <span className="diagram-node-flow__badge">Etapa</span>
        </div>
        <NodeContent nodeData={nodeData} />
        <div className="diagram-node-flow__ports-hint" aria-hidden="true">
          <span>Entrada</span>
          <span>Saida</span>
        </div>
      </div>
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
      <div className="diagram-node-mindmap__role">
        {nodeData.rendererIsRoot ? "Tema central" : "Ramificacao"}
      </div>
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
        <div className="diagram-node__header-row">
          <NodeTypeChip nodeData={nodeData} />
        </div>
        <strong className="diagram-node__title">{resolveDisplayLabel(nodeData)}</strong>
        <NodeTechnicalMeta nodeData={nodeData} />
      </div>
      <div className="diagram-node-erd__rows" data-testid="erd-node-fields-table">
        <div className="diagram-node-erd__table-head">
          <span>Campo</span>
          <span>Tipo</span>
          <span>Flags</span>
        </div>
        {fields.length > 0 ? (
          fields.map((field) => (
            <div key={field.id} className="diagram-node-erd__row">
              <span>{field.name}</span>
              <span>{field.type}</span>
              <span>{field.flags}</span>
            </div>
          ))
        ) : (
          <div className="diagram-node-erd__empty" data-testid="erd-node-fields-empty">
            Sem campos
          </div>
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
