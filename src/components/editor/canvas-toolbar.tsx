"use client";

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
  return (
    <div
      className={`canvas-toolbar ${isInFocusMode ? "is-focus-mode" : ""}`}
      role="toolbar"
      aria-label="Ferramentas do canvas"
      data-testid="canvas-toolbar"
    >
      <button
        className="btn canvas-toolbar-icon-btn"
        type="button"
        onClick={onZoomOut}
        aria-label="Reduzir zoom"
        data-testid="canvas-toolbar-zoom-out"
      >
        <span aria-hidden="true">-</span>
      </button>
      <button
        className="btn canvas-toolbar-icon-btn"
        type="button"
        onClick={onZoomIn}
        aria-label="Aumentar zoom"
        data-testid="canvas-toolbar-zoom-in"
      >
        <span aria-hidden="true">+</span>
      </button>
      <button
        className="btn canvas-toolbar-icon-btn"
        type="button"
        onClick={onCenterView}
        aria-label="Centralizar selecao"
        data-testid="canvas-toolbar-center"
      >
        <span aria-hidden="true">◎</span>
      </button>
    </div>
  );
}
