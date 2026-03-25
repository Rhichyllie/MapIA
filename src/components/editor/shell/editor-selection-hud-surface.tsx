import type { ComponentProps } from "react";
import type { ReactNode } from "react";
import { FlowSelectionHud } from "../flow-interactions/flow-selection-hud";

type SelectionAction = {
  id: string;
  label: string;
  onClick: () => void;
  testId?: string;
};

type EditorSelectionHudSurfaceProps = {
  variant: "process" | "default";
  processHudProps?: ComponentProps<typeof FlowSelectionHud>;
  selectedItemLabel: string;
  kindChipLabel: string | null;
  kindChipTone?: string | null;
  semanticStatusLabel: string;
  semanticStatusSeverity?: string | null;
  editLabel: string;
  centerLabel: string;
  duplicateAction?: SelectionAction;
  primaryAction?: SelectionAction;
  secondaryActions?: SelectionAction[];
  extraActions?: ReactNode;
  removeLabel: string;
  onOpenInspector: () => void;
  onCenterView: () => void;
  onRemove: () => void;
};

export function EditorSelectionHudSurface({
  variant,
  processHudProps,
  selectedItemLabel,
  kindChipLabel,
  kindChipTone,
  semanticStatusLabel,
  semanticStatusSeverity,
  editLabel,
  centerLabel,
  duplicateAction,
  primaryAction,
  secondaryActions = [],
  extraActions,
  removeLabel,
  onOpenInspector,
  onCenterView,
  onRemove,
}: EditorSelectionHudSurfaceProps) {
  if (variant === "process" && processHudProps) {
    return <FlowSelectionHud {...processHudProps} />;
  }

  return (
    <div className="canvas-selection-hud" data-testid="canvas-selection-hud">
      <div className="canvas-selection-hud-main">
        <strong>{selectedItemLabel}</strong>
        {kindChipLabel ? (
          <span
            className={`badge canvas-selection-kind-chip ${
              kindChipTone ? `tone-${kindChipTone}` : ""
            }`}
            data-testid="canvas-selection-kind-chip"
          >
            {kindChipLabel}
          </span>
        ) : null}
        <span
          className={`badge canvas-selection-semantic-status ${
            semanticStatusSeverity
              ? `canvas-selection-semantic-status-${semanticStatusSeverity}`
              : ""
          }`}
          data-testid="canvas-selection-semantic-status"
        >
          {semanticStatusLabel}
        </span>
      </div>
      <div className="row-actions canvas-selection-hud-actions">
        <button className="btn" type="button" onClick={onOpenInspector}>
          {editLabel}
        </button>
        <button className="btn" type="button" onClick={onCenterView}>
          {centerLabel}
        </button>
        {duplicateAction ? (
          <button
            className="btn"
            type="button"
            onClick={duplicateAction.onClick}
            data-testid={duplicateAction.testId}
          >
            {duplicateAction.label}
          </button>
        ) : null}
        {primaryAction ? (
          <button
            className="btn"
            type="button"
            onClick={primaryAction.onClick}
            data-testid={primaryAction.testId}
          >
            {primaryAction.label}
          </button>
        ) : null}
        {secondaryActions.map((action) => (
          <button
            key={action.id}
            className="btn"
            type="button"
            onClick={action.onClick}
            data-testid={action.testId}
          >
            {action.label}
          </button>
        ))}
        {extraActions}
        <button className="btn" type="button" onClick={onRemove}>
          {removeLabel}
        </button>
      </div>
    </div>
  );
}
