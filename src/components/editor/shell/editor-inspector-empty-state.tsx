import type { EditorTranslationFn } from "../editor-i18n";
import type { EditorDiagramInspectorCopy } from "../diagram-modes";

type EditorInspectorEmptyStateProps = {
  editorT: EditorTranslationFn;
  inspectorCopy: EditorDiagramInspectorCopy;
  nodesCount: number;
  edgesCount: number;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
};

export function EditorInspectorEmptyState({
  editorT,
  inspectorCopy,
  nodesCount,
  edgesCount,
  viewport,
}: EditorInspectorEmptyStateProps) {
  return (
    <div className="inspector-empty-state" data-testid="inspector-empty-state">
      <p className="helper">{inspectorCopy.emptyTitle}</p>
      <p className="helper">{inspectorCopy.emptySummary}</p>
      <p className="helper">{inspectorCopy.emptyGuidance}</p>
      <dl className="inspector-meta-list">
        <div>
          <dt>{editorT("shell.emptyState.nodes")}</dt>
          <dd>{nodesCount}</dd>
        </div>
        <div>
          <dt>{editorT("shell.emptyState.edges")}</dt>
          <dd>{edgesCount}</dd>
        </div>
        <div>
          <dt>{editorT("shell.emptyState.viewport")}</dt>
          <dd>
            {Math.round(viewport.x)}, {Math.round(viewport.y)} @ {viewport.zoom.toFixed(2)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
