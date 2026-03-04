import type { ReactNode } from "react";

type CardOptionProps = {
  title: string;
  description: string;
  selected: boolean;
  preview?: ReactNode;
  onSelect: () => void;
  dataTestId?: string;
};

export function CardOption({
  title,
  description,
  selected,
  preview,
  onSelect,
  dataTestId,
}: CardOptionProps) {
  return (
    <button
      type="button"
      className="tile"
      onClick={onSelect}
      aria-pressed={selected}
      data-selected={selected}
      data-testid={dataTestId}
      style={
        selected
          ? {
              borderColor: "rgba(15, 118, 110, 0.45)",
              boxShadow: "0 0 0 1px rgba(15, 118, 110, 0.22) inset",
            }
          : undefined
      }
    >
      <div className="row-actions" style={{ justifyContent: "space-between" }}>
        <strong>{title}</strong>
        <span className="badge">{selected ? "Selecionado" : "Selecionar"}</span>
      </div>
      <p className="helper">{description}</p>
      {preview ? <div aria-hidden="true">{preview}</div> : null}
    </button>
  );
}
