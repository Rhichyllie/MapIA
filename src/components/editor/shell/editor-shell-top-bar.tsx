import type { ReactNode } from "react";

type EditorShellTopBarProps = {
  projectName: string;
  isCanvasFocusMode: boolean;
  ariaLabel: string;
  saveStatusClassName: string;
  saveStatusLabel: string;
  isSaving: boolean;
  addPrimaryLabel: string;
  quickActionHint: string;
  quickFindLabel: string;
  fitViewLabel: string;
  organizeLabel: string;
  validationLabel: string;
  inspectorToggleLabel: string;
  focusToggleLabel: string;
  onAddNode: () => void;
  onOpenQuickFind: () => void;
  onFitView: () => void;
  onOrganizeDiagram: () => void;
  onToggleValidationPanel: () => void;
  onToggleInspectorVisibility: () => void;
  onToggleCanvasFocusMode: () => void;
  extraActions?: ReactNode;
};

export function EditorShellTopBar({
  projectName,
  isCanvasFocusMode,
  ariaLabel,
  saveStatusClassName,
  saveStatusLabel,
  isSaving,
  addPrimaryLabel,
  quickActionHint,
  quickFindLabel,
  fitViewLabel,
  organizeLabel,
  validationLabel,
  inspectorToggleLabel,
  focusToggleLabel,
  onAddNode,
  onOpenQuickFind,
  onFitView,
  onOrganizeDiagram,
  onToggleValidationPanel,
  onToggleInspectorVisibility,
  onToggleCanvasFocusMode,
  extraActions,
}: EditorShellTopBarProps) {
  return (
    <div
      className={`canvas-top-bar ${isCanvasFocusMode ? "is-focus-mode" : ""}`}
      role="region"
      aria-label={ariaLabel}
      data-testid="canvas-top-bar"
    >
      <div className="canvas-top-bar-main">
        <strong className="canvas-top-project-name" title={projectName}>
          {projectName}
        </strong>
        <span
          className={saveStatusClassName}
          aria-live="polite"
          data-testid="save-status-badge"
        >
          {saveStatusLabel}
        </span>
      </div>
      <div className="canvas-top-bar-actions">
        <button
          className="btn btn-primary"
          type="button"
          onClick={onAddNode}
          disabled={isSaving}
          data-testid="add-node-button"
        >
          {addPrimaryLabel}
        </button>
        <span className="helper">{quickActionHint}</span>
        <button
          className="btn"
          type="button"
          onClick={onOpenQuickFind}
          data-testid="canvas-toolbar-quick-find"
        >
          {quickFindLabel}
        </button>
        <button
          className="btn"
          type="button"
          onClick={onFitView}
          data-testid="center-diagram-button"
        >
          {fitViewLabel}
        </button>
        <button
          className="btn"
          type="button"
          onClick={onOrganizeDiagram}
          data-testid="organize-diagram-button"
        >
          {organizeLabel}
        </button>
        <button
          className="btn"
          type="button"
          onClick={onToggleValidationPanel}
          data-testid="semantic-audit-button"
        >
          {validationLabel}
        </button>
        {extraActions}
        <button
          className="btn"
          type="button"
          onClick={onToggleInspectorVisibility}
          data-testid="canvas-top-inspector-toggle"
        >
          {inspectorToggleLabel}
        </button>
        <button
          className="btn"
          type="button"
          onClick={onToggleCanvasFocusMode}
          data-testid="editor-focus-toggle"
        >
          {focusToggleLabel}
        </button>
      </div>
    </div>
  );
}
