"use client";

import { type FormEvent, type RefObject, useEffect } from "react";
import { CardOption } from "@/src/components/ui/card-option";
import type { DashboardCopy } from "./dashboard-copy";
import type {
  DashboardProject,
  InitialDiagramChoice,
} from "./workspace-projects";
import {
  legacyTemplateOptions,
  type WorkspaceMode,
} from "./workspace-projects";

type NewProjectDrawerProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  name: string;
  description: string;
  initialDiagramType: InitialDiagramChoice;
  template: DashboardProject["template"];
  workspaceMode: WorkspaceMode;
  errorMessage: string | null;
  nameInputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onInitialDiagramTypeChange: (value: InitialDiagramChoice) => void;
  onTemplateChange: (value: DashboardProject["template"]) => void;
  copy: DashboardCopy;
};

export function NewProjectDrawer({
  isOpen,
  isSubmitting,
  name,
  description,
  initialDiagramType,
  template,
  workspaceMode,
  errorMessage,
  nameInputRef,
  onClose,
  onSubmit,
  onNameChange,
  onDescriptionChange,
  onInitialDiagramTypeChange,
  onTemplateChange,
  copy,
}: NewProjectDrawerProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    nameInputRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, isSubmitting, nameInputRef, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="workspace-drawer-backdrop"
      onClick={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
    >
      <aside
        className="workspace-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        aria-describedby="new-project-description"
        data-testid="new-project-drawer"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="workspace-drawer-header">
          <div>
            <h3 id="new-project-title">{copy.createDrawer.title}</h3>
            <p className="helper" id="new-project-description">
              {copy.createDrawer.description}
            </p>
          </div>
          <button
            className="btn"
            type="button"
            onClick={() => {
              if (!isSubmitting) {
                onClose();
              }
            }}
            aria-label={copy.createDrawer.closeAriaLabel}
          >
            {copy.createDrawer.closeButton}
          </button>
        </header>

        <form
          className="dashboard-form workspace-drawer-form"
          onSubmit={onSubmit}
          data-testid="dashboard-create-project-form"
        >
          <div className="field">
            <label htmlFor="project-name">{copy.createDrawer.nameLabel}</label>
            <input
              ref={nameInputRef}
              id="project-name"
              data-testid="dashboard-project-name-input"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder={copy.createDrawer.namePlaceholder}
              required
              aria-invalid={errorMessage ? "true" : "false"}
            />
            <span className="helper">
              {copy.createDrawer.nameHelper}
            </span>
          </div>

          <div className="field">
            <label htmlFor="project-description">{copy.createDrawer.descriptionLabel}</label>
            <textarea
              id="project-description"
              data-testid="dashboard-project-description-input"
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              rows={3}
              placeholder={copy.createDrawer.descriptionPlaceholder}
            />
          </div>

          <div className="field">
            <label>{copy.createDrawer.initialDiagramTypeLabel}</label>
            <div className="grid-tiles dashboard-initial-type-grid">
              {copy.diagramTypeOptions.map((option) => (
                <CardOption
                  key={option.value}
                  title={option.label}
                  description={option.description}
                  selected={initialDiagramType === option.value}
                  onSelect={() => onInitialDiagramTypeChange(option.value)}
                  dataTestId={`dashboard-initial-diagram-type-${option.value}`}
                />
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="project-template">{copy.createDrawer.templateLabel}</label>
            <select
              id="project-template"
              data-testid="dashboard-project-template-select"
              value={template}
              onChange={(event) =>
                onTemplateChange(event.target.value as DashboardProject["template"])
              }
            >
              {legacyTemplateOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {copy.getTemplateLabel(option.value, workspaceMode)}
                </option>
              ))}
            </select>
            <span className="helper">{copy.getTemplateDescription(template)}</span>
          </div>

          {errorMessage ? (
            <div
              className="error-box"
              data-testid="dashboard-create-project-error"
              role="alert"
            >
              {errorMessage}
            </div>
          ) : null}

          <div className="row-actions workspace-drawer-actions">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={isSubmitting}
              data-testid="dashboard-create-project-button"
            >
              {isSubmitting
                ? copy.createDrawer.createSubmittingButton
                : copy.createDrawer.createButton}
            </button>
            <button
              className="btn"
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
            >
              {copy.createDrawer.cancelButton}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
