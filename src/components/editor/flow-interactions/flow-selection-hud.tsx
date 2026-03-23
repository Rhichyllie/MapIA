"use client";

import { useCallback } from "react";
import { useEditorTranslations } from "../use-editor-translations";
import { useFlowSelectionMenu } from "./use-flow-selection-menu";

type FlowSelectionHudAction = {
  id: string;
  label: string;
  onClick: () => unknown;
};

function runAction(action: () => unknown) {
  const result = action();
  if (
    typeof result === "object" &&
    result !== null &&
    "then" in result &&
    typeof result.then === "function"
  ) {
    void result;
  }
}

export function FlowSelectionHud({
  dismissKey,
  selectedItemLabel,
  kindChipLabel,
  kindChipTone,
  semanticStatusLabel,
  semanticStatusSeverity,
  openInspectorLabel,
  primaryAction,
  secondaryActions,
  onOpenInspector,
  onCenterView,
  onDuplicate,
  onRemove,
}: {
  dismissKey: string;
  selectedItemLabel: string;
  kindChipLabel: string;
  kindChipTone?: string | null;
  semanticStatusLabel: string;
  semanticStatusSeverity: "error" | "warning" | "suggestion" | "info" | null;
  openInspectorLabel: string;
  primaryAction?: FlowSelectionHudAction;
  secondaryActions: FlowSelectionHudAction[];
  onOpenInspector: () => unknown;
  onCenterView: () => unknown;
  onDuplicate?: () => unknown;
  onRemove: () => unknown;
}) {
  const t = useEditorTranslations("selectionHud");
  const { isOpen, menuRef, closeMenu, toggleMenu } = useFlowSelectionMenu(dismissKey);

  const runHudAction = useCallback(
    (action: () => unknown) => {
      closeMenu();
      runAction(action);
    },
    [closeMenu],
  );

  return (
    <div
      className="canvas-selection-hud canvas-selection-hud-flow flow-selection-hud"
      data-testid="canvas-selection-hud"
    >
      <div className="canvas-selection-hud-main">
        <strong>{selectedItemLabel}</strong>
        <span
          className={`badge canvas-selection-kind-chip${
            kindChipTone ? ` tone-${kindChipTone}` : ""
          }`}
          data-testid="canvas-selection-kind-chip"
        >
          {kindChipLabel}
        </span>
        {semanticStatusSeverity ? (
          <span
            className={`badge canvas-selection-semantic-status canvas-selection-semantic-status-${semanticStatusSeverity}`}
            data-testid="canvas-selection-semantic-status"
          >
            {semanticStatusLabel}
          </span>
        ) : null}
      </div>
      <div className="row-actions canvas-selection-hud-actions canvas-selection-hud-actions-flow flow-selection-hud__actions">
        <button
          className="btn btn-link selection-hud-open-inspector-button"
          type="button"
          onClick={() => runHudAction(onOpenInspector)}
          data-testid="selection-hud-open-inspector-button"
        >
          {openInspectorLabel}
        </button>
        {primaryAction ? (
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => runHudAction(primaryAction.onClick)}
            data-testid="selection-hud-contextual-add-button"
          >
            {primaryAction.label}
          </button>
        ) : null}
        <div
          className="canvas-selection-hud-more flow-selection-hud__menu"
          ref={menuRef}
        >
          <button
            className="btn"
            type="button"
          onClick={toggleMenu}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          data-testid="selection-hud-flow-more-button"
        >
          {t("moreActions")}
        </button>
          {isOpen ? (
            <div
              className="canvas-selection-hud-more-menu flow-selection-hud__menu-panel"
              role="menu"
              data-testid="selection-hud-flow-more-menu"
            >
              {secondaryActions.map((action) => (
                <button
                  key={action.id}
                  className="btn"
                  type="button"
                  onClick={() => runHudAction(action.onClick)}
                  data-testid={`selection-hud-contextual-secondary-${action.id}`}
                >
                  {action.label}
                </button>
              ))}
              <button
                className="btn"
                type="button"
                onClick={() => runHudAction(onCenterView)}
                data-testid="selection-hud-center-button"
              >
                {t("center")}
              </button>
              {onDuplicate ? (
                <button
                  className="btn"
                  type="button"
                  onClick={() => runHudAction(onDuplicate)}
                  data-testid="selection-hud-duplicate-button"
                >
                  {t("duplicate")}
                </button>
              ) : null}
              <button
                className="btn btn-link btn-danger"
                type="button"
                onClick={() => runHudAction(onRemove)}
                data-testid="selection-hud-remove-button"
              >
                {t("remove")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
