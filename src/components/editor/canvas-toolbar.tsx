"use client";

import { useEditorTranslations } from "./use-editor-translations";

type CanvasToolbarProps = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenterView: () => void;
  isInFocusMode: boolean;
};

export function CanvasToolbar({
  onZoomIn,
  onZoomOut,
  onCenterView,
  isInFocusMode,
}: CanvasToolbarProps) {
  const t = useEditorTranslations("canvasToolbar");

  return (
    <div
      className={`canvas-toolbar ${isInFocusMode ? "is-focus-mode" : ""}`}
      role="toolbar"
      aria-label={t("toolbarAria")}
      data-testid="canvas-toolbar"
    >
      <button
        className="btn canvas-toolbar-icon-btn"
        type="button"
        onClick={onZoomOut}
        aria-label={t("zoomOutAria")}
        data-testid="canvas-toolbar-zoom-out"
      >
        <span aria-hidden="true">-</span>
      </button>
      <button
        className="btn canvas-toolbar-icon-btn"
        type="button"
        onClick={onZoomIn}
        aria-label={t("zoomInAria")}
        data-testid="canvas-toolbar-zoom-in"
      >
        <span aria-hidden="true">+</span>
      </button>
      <button
        className="btn canvas-toolbar-icon-btn"
        type="button"
        onClick={onCenterView}
        aria-label={t("centerAria")}
        data-testid="canvas-toolbar-center"
      >
        <span aria-hidden="true">◎</span>
      </button>
    </div>
  );
}
