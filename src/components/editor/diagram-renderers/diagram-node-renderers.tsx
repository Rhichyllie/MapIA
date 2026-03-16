import { Handle, Position, type NodeProps } from "@xyflow/react";
import { resolveGraphNodeSemantic } from "@/src/modules/diagrams/domain";
import type { EditorNodeData } from "../editor-graph-mappers";
import {
  resolveFlowHandlePosition,
  resolveFlowNodePresentation,
} from "./flow-presentation";
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

function normalizeFieldFlagsForDisplay(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((flag): flag is string => typeof flag === "string")
    .map((flag) => flag.trim())
    .filter(Boolean);
}

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
        flags?: unknown;
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

      const normalizedFlags = normalizeFieldFlagsForDisplay(parsedField.flags);
      for (const flag of normalizedFlags) {
        if (flag === "NOT_NULL") {
          flags.push("NOT NULL");
          continue;
        }

        flags.push(flag);
      }

      if (parsedField.isId === true && !flags.includes("PK")) {
        flags.push("PK");
      }
      if (parsedField.isUnique === true && !flags.includes("UQ")) {
        flags.push("UQ");
      }
      if (
        parsedField.isOptional === false &&
        !flags.includes("NOT_NULL") &&
        !flags.includes("NOT NULL")
      ) {
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

function resolveTreeRole(nodeData: EditorNodeData) {
  if (nodeData.diagramRole === "tree-root" || nodeData.kind === "project") {
    return "tree-root";
  }

  return "tree-node";
}

function resolveMindmapRole(nodeData: EditorNodeData) {
  if (nodeData.diagramRole === "mindmap-reference") {
    return "mindmap-reference";
  }

  if (nodeData.diagramRole === "mindmap-root" || nodeData.rendererIsRoot) {
    return "mindmap-root";
  }

  return "mindmap-branch";
}

function resolveMindmapLabel(nodeData: EditorNodeData) {
  const role = resolveMindmapRole(nodeData);

  if (role === "mindmap-root") {
    return "Tema central";
  }

  if (role === "mindmap-reference") {
    return "Referencia";
  }

  return "Ramificacao";
}

function resolveErdRole(nodeData: EditorNodeData) {
  if (nodeData.diagramRole === "erd-comment" || nodeData.kind === "note") {
    return "erd-comment";
  }

  return "erd-entity";
}

function resolveSitemapRole(nodeData: EditorNodeData) {
  if (
    nodeData.diagramRole === "sitemap-home" ||
    resolveDisplayLabel(nodeData).trim().toLowerCase() === "home"
  ) {
    return "sitemap-home";
  }

  return "sitemap-section";
}

function GraphKindChip({
  nodeData,
  kindLabel,
}: {
  nodeData: EditorNodeData;
  kindLabel: string;
}) {
  const kindPresentation = getNodeKindPresentation(nodeData.kind);

  return (
    <span
      className={`diagram-node-graph__kind-chip tone-${kindPresentation.tone}`}
      data-testid="graph-node-kind-chip"
    >
      {kindLabel}
    </span>
  );
}

function resolveTimelineRole(nodeData: EditorNodeData) {
  if (nodeData.diagramRole === "timeline-milestone") {
    return "timeline-milestone";
  }

  return "timeline-milestone";
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
  const treeRole = resolveTreeRole(nodeData);
  const canToggleTreeSubtree =
    nodeData.rendererCanToggleTreeCollapse === true &&
    typeof nodeData.onToggleTreeCollapse === "function";

  return (
    <div
      className={`diagram-node diagram-node-tree ${visual.className}`}
      data-testid="tree-node-renderer"
      data-node-kind={nodeData.kind}
      data-node-tone={visual.kindPresentation.tone}
      data-diagram-role={treeRole}
    >
      <Handle
        type="target"
        position={positions.target}
        className="diagram-port diagram-port-target"
      />
      <div className="diagram-node-tree__content">
        <div className="diagram-node-tree__toolbar">
          <span className="diagram-node-tree__level-badge">
            {treeRole === "tree-root" ? "Raiz" : "Hierarquia"}
          </span>
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
  const positions = resolveFlowHandlePosition(nodeData.rendererDirection);
  const visual = useNodeVisualTokens(nodeData);
  const displayLabel = resolveDisplayLabel(nodeData);
  const flowPresentation = resolveFlowNodePresentation({
    diagramRole: nodeData.diagramRole,
    kind: nodeData.kind,
    label: displayLabel,
  });

  return (
    <div
      className={`diagram-node diagram-node-flow ${visual.className}`}
      data-testid="flow-node-renderer"
      data-node-kind={nodeData.kind}
      data-node-tone={visual.kindPresentation.tone}
      data-diagram-role={flowPresentation.variant}
      data-flow-variant={flowPresentation.variant}
      data-flow-weight={flowPresentation.visualWeight}
    >
      {flowPresentation.showTargetHandle ? (
        <Handle
          type="target"
          position={positions.target}
          className="diagram-port diagram-port-target"
        />
      ) : null}
      <div className="diagram-node-flow__body">
        <div className="diagram-node-flow__eyebrow">
          <span className="diagram-node-flow__badge">{flowPresentation.badgeLabel}</span>
        </div>
        <div className="diagram-node-flow__content">
          <strong className="diagram-node__title diagram-node-flow__title">
            {displayLabel}
          </strong>
          <p className="diagram-node-flow__summary">{flowPresentation.summary}</p>
          <NodeTechnicalMeta nodeData={nodeData} />
        </div>
      </div>
      {flowPresentation.showSourceHandle ? (
        <Handle
          type="source"
          position={positions.source}
          className="diagram-port diagram-port-source"
        />
      ) : null}
    </div>
  );
}

export function MindmapNodeRenderer({ data }: NodeProps) {
  const nodeData = toEditorNodeData(data);
  const visual = useNodeVisualTokens(nodeData);
  const mindmapRole = resolveMindmapRole(nodeData);

  return (
    <div
      className={`diagram-node diagram-node-mindmap ${mindmapRole === "mindmap-root" ? "is-root" : ""} ${visual.className}`}
      data-testid="mindmap-node-renderer"
      data-node-kind={nodeData.kind}
      data-node-tone={visual.kindPresentation.tone}
      data-diagram-role={mindmapRole}
    >
      <Handle type="target" position={Position.Left} className="diagram-port diagram-port-target" />
      <div className="diagram-node-mindmap__role">
        {resolveMindmapLabel(nodeData)}
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
  const erdRole = resolveErdRole(nodeData);

  if (erdRole === "erd-comment") {
    return (
      <div
        className={`diagram-node diagram-node-erd diagram-node-erd-comment ${visual.className}`}
        data-testid="erd-node-renderer"
        data-node-kind={nodeData.kind}
        data-node-tone={visual.kindPresentation.tone}
        data-diagram-role={erdRole}
      >
        <Handle type="target" position={Position.Left} className="diagram-port diagram-port-target" />
        <div className="diagram-node-erd__title">
          <div className="diagram-node__header-row">
            <NodeTypeChip nodeData={nodeData} />
          </div>
          <strong className="diagram-node__title">{resolveDisplayLabel(nodeData)}</strong>
          <span className="helper">Comentario ERD</span>
          <NodeTechnicalMeta nodeData={nodeData} />
        </div>
        <Handle type="source" position={Position.Right} className="diagram-port diagram-port-source" />
      </div>
    );
  }

  return (
    <div
      className={`diagram-node diagram-node-erd ${visual.className}`}
      data-testid="erd-node-renderer"
      data-node-kind={nodeData.kind}
      data-node-tone={visual.kindPresentation.tone}
      data-diagram-role={erdRole}
    >
      <Handle type="target" position={Position.Left} className="diagram-port diagram-port-target" />
      <div className="diagram-node-erd__title">
        <div className="diagram-node__header-row">
          <NodeTypeChip nodeData={nodeData} />
        </div>
        <strong className="diagram-node__title">{resolveDisplayLabel(nodeData)}</strong>
        {nodeData.erdBadges && nodeData.erdBadges.length > 0 ? (
          <div className="diagram-node-erd__badges">
            {nodeData.erdBadges.slice(0, 3).map((badge, index) => (
              <span
                key={`${badge.label}-${index}`}
                className={`diagram-node-erd__badge diagram-node-erd__badge-${badge.tone}`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        ) : null}
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
  const positions = resolveTreeHandlePosition(nodeData.rendererDirection);
  const visual = useNodeVisualTokens(nodeData);
  const sitemapRole = resolveSitemapRole(nodeData);

  return (
    <div
      className={`diagram-node diagram-node-sitemap ${visual.className}`}
      data-testid="sitemap-node-renderer"
      data-node-kind={nodeData.kind}
      data-node-tone={visual.kindPresentation.tone}
      data-diagram-role={sitemapRole}
    >
      <Handle
        type="target"
        position={positions.target}
        className="diagram-port diagram-port-target"
      />
      <div className="diagram-node-sitemap__role">
        {sitemapRole === "sitemap-home" ? "Home" : "Secao"}
      </div>
      <NodeContent nodeData={nodeData} />
      <Handle
        type="source"
        position={positions.source}
        className="diagram-port diagram-port-source"
      />
    </div>
  );
}

export function GraphNodeRenderer({ data }: NodeProps) {
  const nodeData = toEditorNodeData(data);
  const visual = useNodeVisualTokens(nodeData);
  const graphSemantic = resolveGraphNodeSemantic({
    diagramRole: nodeData.diagramRole,
    kind: nodeData.kind,
    label: resolveDisplayLabel(nodeData),
    payload: nodeData.payload,
  });

  return (
    <div
      className={`diagram-node diagram-node-graph diagram-node-graph--${graphSemantic.variant} ${visual.className}`}
      data-testid="graph-node-renderer"
      data-node-kind={nodeData.kind}
      data-node-tone={visual.kindPresentation.tone}
      data-diagram-role={graphSemantic.role}
      data-graph-variant={graphSemantic.variant}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="diagram-port diagram-port-target diagram-port-graph diagram-port-graph-target"
      />
      <Handle
        type="target"
        position={Position.Top}
        className="diagram-port diagram-port-target diagram-port-graph diagram-port-graph-target"
      />
      <div className="diagram-node-graph__surface" data-testid="graph-node-click-surface">
        <div className="diagram-node-graph__header">
          <div className="diagram-node-graph__header-copy">
            <span
              className="diagram-node-graph__role-badge"
              data-testid="graph-node-role-badge"
            >
              {graphSemantic.roleBadgeLabel}
            </span>
            <GraphKindChip nodeData={nodeData} kindLabel={graphSemantic.kindLabel} />
          </div>
          <span className="diagram-node-graph__glyph" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </div>
        <strong className="diagram-node-graph__title">{resolveDisplayLabel(nodeData)}</strong>
        <p className="diagram-node-graph__summary" data-testid="graph-node-summary">
          {graphSemantic.summary}
        </p>
        <div className="diagram-node-graph__footer">
          <span className="diagram-node-graph__footprint">{graphSemantic.footprintLabel}</span>
          <NodeTechnicalMeta nodeData={nodeData} />
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="diagram-port diagram-port-source diagram-port-graph diagram-port-graph-source"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="diagram-port diagram-port-source diagram-port-graph diagram-port-graph-source"
      />
    </div>
  );
}

export function TimelineNodeRenderer({ data }: NodeProps) {
  const nodeData = toEditorNodeData(data);
  const visual = useNodeVisualTokens(nodeData);
  const positions = resolveFlowHandlePosition(nodeData.rendererDirection);
  const role = resolveTimelineRole(nodeData);

  return (
    <div
      className={`diagram-node diagram-node-timeline ${visual.className}`}
      data-testid="timeline-node-renderer"
      data-node-kind={nodeData.kind}
      data-node-tone={visual.kindPresentation.tone}
      data-diagram-role={role}
    >
      <Handle type="target" position={positions.target} className="diagram-port diagram-port-target" />
      <div className="diagram-node-timeline__marker" aria-hidden="true" />
      <div className="diagram-node-timeline__role">Marco</div>
      <NodeContent nodeData={nodeData} />
      <Handle type="source" position={positions.source} className="diagram-port diagram-port-source" />
    </div>
  );
}
