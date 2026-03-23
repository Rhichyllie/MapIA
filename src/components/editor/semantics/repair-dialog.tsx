"use client";

import { useEffect, useRef } from "react";
import { useEditorTranslations } from "../use-editor-translations";

type RepairDialogProps = {
  open: boolean;
  title?: string;
  summary: string;
  bullets: string[];
  onApplyAndRepair: () => void;
  onApplyAndRemoveInvalid: () => void;
  onCancel: () => void;
};

export function RepairDialog(props: RepairDialogProps) {
  const {
    bullets,
    onApplyAndRemoveInvalid,
    onApplyAndRepair,
    onCancel,
    open,
    summary,
    title,
  } = props;
  const t = useEditorTranslations("semantics.repairDialog");
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    window.requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="semantic-dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="semantic-dialog semantic-repair-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("dialogAria")}
        tabIndex={-1}
        data-testid="semantic-repair-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="semantic-dialog-header">
          <h3>{title ?? t("defaultTitle")}</h3>
          <p className="helper">{summary}</p>
        </header>

        {bullets.length > 0 ? (
          <ul className="summary-list semantic-repair-list">
            {bullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}

        <div className="row-actions semantic-dialog-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={onApplyAndRepair}
            data-testid="semantic-repair-apply-fix"
          >
            {t("applyRepair")}
          </button>
          <button
            className="btn"
            type="button"
            onClick={onApplyAndRemoveInvalid}
            data-testid="semantic-repair-apply-remove"
          >
            {t("applyRemoveInvalid")}
          </button>
          <button
            className="btn"
            type="button"
            onClick={onCancel}
            data-testid="semantic-repair-cancel"
          >
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
