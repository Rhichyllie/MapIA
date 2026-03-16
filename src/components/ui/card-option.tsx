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
      className={`tile card-option ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
      data-selected={selected}
      data-testid={dataTestId}
    >
      <div className="row-actions row-actions-between">
        <strong>{title}</strong>
        <span className="badge">{selected ? "Selecionado" : "Selecionar"}</span>
      </div>
      <p className="helper">{description}</p>
      {preview ? <div aria-hidden="true">{preview}</div> : null}
    </button>
  );
}
