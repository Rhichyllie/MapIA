"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EdgeKind } from "@/src/domain";
import { getEdgeKindDescription, getEdgeKindLabel } from "../presentation/kinds";

type ConnectionAssistantProps = {
  open: boolean;
  mode: "operational" | "technical";
  message: string;
  details?: string;
  sourceLabel?: string;
  targetLabel?: string;
  allowedEdgeKinds: EdgeKind[];
  recommendedEdgeKind?: EdgeKind;
  onSelectKind: (kind: EdgeKind) => void;
  onCancel: () => void;
};

export function ConnectionAssistant(props: ConnectionAssistantProps) {
  const {
    allowedEdgeKinds,
    details,
    message,
    mode,
    onCancel,
    onSelectKind,
    open,
    recommendedEdgeKind,
    sourceLabel,
    targetLabel,
  } = props;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const orderedKinds = useMemo(() => {
    if (!recommendedEdgeKind) {
      return allowedEdgeKinds;
    }

    const withoutRecommended = allowedEdgeKinds.filter(
      (kind) => kind !== recommendedEdgeKind,
    );

    return [recommendedEdgeKind, ...withoutRecommended];
  }, [allowedEdgeKinds, recommendedEdgeKind]);

  useEffect(() => {
    if (!open) {
      return;
    }

    window.requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });
  }, [open]);

  useEffect(() => {
    if (!open || orderedKinds.length === 0) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }

      if (
        event.key === "ArrowRight" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowUp"
      ) {
        event.preventDefault();
        setActiveIndex((current) => {
          if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            return (current + 1) % orderedKinds.length;
          }

          return current - 1 < 0 ? orderedKinds.length - 1 : current - 1;
        });
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const selectedKind = orderedKinds[activeIndex];
        if (selectedKind) {
          onSelectKind(selectedKind);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeIndex, onCancel, onSelectKind, open, orderedKinds]);

  if (!open) {
    return null;
  }

  return (
    <div className="semantic-dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="semantic-dialog semantic-connection-assistant"
        role="dialog"
        aria-modal="true"
        aria-label="Assistente de conexao"
        tabIndex={-1}
        data-testid="semantic-connection-assistant"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="semantic-dialog-header">
          <h3>Conexao invalida</h3>
          <p className="helper">{message}</p>
          {details ? <p className="helper">{details}</p> : null}
          {sourceLabel && targetLabel ? (
            <p className="helper">
              Tentativa: <strong>{sourceLabel}</strong> →{" "}
              <strong>{targetLabel}</strong>
            </p>
          ) : null}
          <p className="helper">
            Use setas para navegar e Enter para confirmar uma relacao.
          </p>
        </header>

        <div className="semantic-kind-grid">
          {orderedKinds.map((kind, index) => {
            const isActive = index === activeIndex;
            const isRecommended = kind === recommendedEdgeKind;
            return (
              <button
                key={kind}
                type="button"
                className={`semantic-kind-card ${isActive ? "is-active" : ""}`}
                data-testid={`semantic-connection-kind-${kind}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => onSelectKind(kind)}
              >
                <span className="semantic-kind-title">
                  {getEdgeKindLabel(kind, "operational")}
                  {mode === "technical" ? ` (kind: ${kind})` : ""}
                </span>
                <span className="helper">{getEdgeKindDescription(kind)}</span>
                {isRecommended ? (
                  <span className="badge badge-soft">Recomendado</span>
                ) : null}
              </button>
            );
          })}
        </div>
        {orderedKinds.length === 0 ? (
          <p className="helper">Nenhuma relacao valida disponivel para esta conexao.</p>
        ) : null}

        <div className="row-actions semantic-dialog-actions">
          <button
            className="btn"
            type="button"
            onClick={onCancel}
            data-testid="semantic-connection-cancel"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
