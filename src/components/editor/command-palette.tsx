"use client";

import { useEffect, useRef } from "react";
import { useEditorTranslations } from "./use-editor-translations";
import type { NodeQuickFindOption } from "./editor-quick-find";
import type { InspectorMode } from "./editor-inspector-personas";

type CommandPaletteProps = {
  isOpen: boolean;
  query: string;
  options: NodeQuickFindOption[];
  activeIndex: number;
  mode: InspectorMode;
  onQueryChange: (value: string) => void;
  onSelectByIndex: (index: number) => void;
  onMoveActiveIndex: (direction: "next" | "previous") => void;
  onClose: () => void;
};

export function CommandPalette({
  isOpen,
  query,
  options,
  activeIndex,
  mode,
  onQueryChange,
  onSelectByIndex,
  onMoveActiveIndex,
  onClose,
}: CommandPaletteProps) {
  const t = useEditorTranslations("commandPalette");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="command-palette-backdrop"
      onClick={onClose}
      data-testid="editor-quick-find-modal"
    >
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t("dialogAria")}
        onClick={(event) => event.stopPropagation()}
      >
        <label htmlFor="editor-quick-find-input">{t("label")}</label>
        <input
          id="editor-quick-find-input"
          ref={inputRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
              return;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              onMoveActiveIndex("next");
              return;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              onMoveActiveIndex("previous");
              return;
            }

            if (event.key === "Enter") {
              event.preventDefault();
              if (options.length > 0) {
                onSelectByIndex(activeIndex >= 0 ? activeIndex : 0);
              }
            }
          }}
          placeholder={t("placeholder")}
          data-testid="editor-quick-find-input"
        />

        <div className="command-palette-list" role="listbox">
          {options.length === 0 ? (
            <p className="helper">{t("emptyState")}</p>
          ) : (
            options.map((option, index) => (
              <button
                key={option.id}
                className={`btn command-palette-item ${
                  index === activeIndex ? "is-active" : ""
                }`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => onSelectByIndex(index)}
                data-testid={`editor-quick-find-item-${option.id}`}
              >
                <strong>{option.label}</strong>
                <span className="muted">
                  {option.kindLabel}
                  {mode === "technical"
                    ? t("technicalKind", { kind: option.kindRaw })
                    : ""}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
