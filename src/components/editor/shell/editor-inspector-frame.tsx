import type { ReactNode } from "react";

type EditorInspectorFrameProps = {
  ariaLabel: string;
  isProcessDiagram: boolean;
  selectionBadge: string;
  draftBadgeLabel: string;
  hasDirtyDraft: boolean;
  selectedItemLabel: string;
  inspectorSubtitle: string;
  mode: "operational" | "technical";
  modeAriaLabel: string;
  operationalLabel: string;
  technicalLabel: string;
  onModeChange: (mode: "operational" | "technical") => void;
  semanticAudit?: ReactNode;
  children: ReactNode;
};

export function EditorInspectorFrame({
  ariaLabel,
  isProcessDiagram,
  selectionBadge,
  draftBadgeLabel,
  hasDirtyDraft,
  selectedItemLabel,
  inspectorSubtitle,
  mode,
  modeAriaLabel,
  operationalLabel,
  technicalLabel,
  onModeChange,
  semanticAudit,
  children,
}: EditorInspectorFrameProps) {
  return (
    <aside
      className={`inspector ${isProcessDiagram ? "inspector-process" : ""}`}
      aria-label={ariaLabel}
      data-testid="inspector-panel"
    >
      <div className="inspector-header">
        <div className="row-actions inspector-selection-row">
          <span className="badge">{selectionBadge}</span>
          {hasDirtyDraft ? (
            <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
              {draftBadgeLabel}
            </span>
          ) : null}
        </div>
        <h3 className="inspector-selection-title" title={selectedItemLabel}>
          {selectedItemLabel}
        </h3>
        <p className="helper inspector-subtitle">{inspectorSubtitle}</p>
      </div>

      <div
        className="row-actions inspector-mode-toggle"
        role="group"
        aria-label={modeAriaLabel}
        data-testid="inspector-mode-toggle"
      >
        <button
          className={`btn ${mode === "operational" ? "btn-primary" : ""}`}
          type="button"
          aria-pressed={mode === "operational"}
          onClick={() => onModeChange("operational")}
          data-testid="inspector-operational"
        >
          {operationalLabel}
        </button>
        <button
          className={`btn ${mode === "technical" ? "btn-primary" : ""}`}
          type="button"
          aria-pressed={mode === "technical"}
          onClick={() => onModeChange("technical")}
          data-testid="inspector-technical"
        >
          {technicalLabel}
        </button>
      </div>

      {semanticAudit}

      {children}
    </aside>
  );
}
