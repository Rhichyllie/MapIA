"use client";

import { memo } from "react";
import { Link } from "@/src/i18n/navigation";
import type { DashboardCopy } from "./dashboard-copy";
import type {
  DashboardProject,
  WorkspaceDensity,
  WorkspaceMode,
} from "./workspace-projects";
import {
  buildEditorHref,
  buildVersionsHref,
  buildWizardHref,
  getSnapshotStatusTone,
} from "./workspace-projects";

type ProjectsListProps = {
  projects: DashboardProject[];
  density: WorkspaceDensity;
  workspaceMode: WorkspaceMode;
  highlightedProjectId: string | null;
  onOpenProject: (projectId: string) => void;
  onCopyTechnicalId: (project: DashboardProject) => void;
  copy: DashboardCopy;
};

export const ProjectsList = memo(function ProjectsList({
  projects,
  density,
  workspaceMode,
  highlightedProjectId,
  onOpenProject,
  onCopyTechnicalId,
  copy,
}: ProjectsListProps) {
  return (
    <div
      className={`workspace-project-list workspace-density-${density}`}
      data-testid="dashboard-project-list"
      data-view="list"
      data-density={density}
      role="table"
      aria-label={copy.project.listAriaLabel}
    >
      <div className="workspace-project-list-header" role="row">
        <span role="columnheader">{copy.project.headers.project}</span>
        <span role="columnheader">{copy.project.headers.type}</span>
        <span role="columnheader">{copy.project.headers.status}</span>
        <span role="columnheader">{copy.project.headers.updated}</span>
        <span role="columnheader">{copy.project.headers.actions}</span>
      </div>

      <div className="workspace-project-list-body" role="rowgroup">
        {projects.map((project) => {
          const snapshotTone = getSnapshotStatusTone(project.hasInitialSnapshot);
          const canShowVersions = project.snapshotVersionCount > 0;
          return (
            <div
              key={project.id}
              className={`workspace-project-list-row workspace-density-${density} ${
                highlightedProjectId === project.id ? "is-highlighted" : ""
              }`}
              role="row"
              tabIndex={0}
              data-project-id={project.id}
              data-testid={`dashboard-project-card-${project.id}`}
              onClick={() => onOpenProject(project.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenProject(project.id);
                }
              }}
            >
              <div className="workspace-project-list-project" role="cell">
                <strong className="workspace-project-list-project-name" title={project.name}>
                  {project.name}
                </strong>
                <span
                  className="workspace-project-list-project-description"
                  title={project.description ?? ""}
                >
                  {project.description?.trim() || copy.project.fallbackDescription}
                </span>
              </div>

              <span className="workspace-project-list-type" role="cell">
                {copy.getTemplateLabel(project.template, workspaceMode)}
                <small>{copy.getDiagramTypeLabel(project.selectedDiagramType)}</small>
              </span>

              <span className="workspace-project-list-status" role="cell">
                <span className={`badge workspace-status-badge workspace-status-${snapshotTone}`}>
                  {copy.getSnapshotStatusLabel(project.hasInitialSnapshot)}
                </span>
              </span>

              <span className="workspace-project-list-updated" role="cell">
                {copy.getProjectUpdatedLabel(project.updatedAt)}
              </span>

              <div
                className="workspace-project-list-actions"
                role="cell"
                onClick={(event) => event.stopPropagation()}
              >
                <Link
                  className="btn btn-primary"
                  href={buildEditorHref(project.id)}
                  data-testid={`dashboard-open-editor-${project.id}`}
                >
                  {copy.project.open}
                </Link>

                <details className="workspace-project-actions-menu">
                  <summary
                    className="btn"
                    aria-label={copy.getMoreActionsAriaLabel(project.name)}
                  >
                    ...
                  </summary>
                  <div className="workspace-project-actions-popover">
                    <Link
                      className="btn"
                      href={buildWizardHref(project.id, "wizard")}
                      data-testid={`dashboard-open-wizard-${project.id}`}
                    >
                      {copy.project.openAssistant}
                    </Link>
                    <Link
                      className="btn"
                      href={buildVersionsHref(project.id)}
                      data-testid={`dashboard-open-versions-${project.id}`}
                      aria-disabled={!canShowVersions}
                      onClick={(event) => {
                        if (!canShowVersions) {
                          event.preventDefault();
                        }
                      }}
                    >
                      {copy.project.viewVersions}
                    </Link>
                    {workspaceMode === "technical" ? (
                      <button
                        className="btn"
                        type="button"
                        onClick={() => onCopyTechnicalId(project)}
                        data-testid={`dashboard-copy-technical-id-${project.id}`}
                      >
                        {copy.project.copyTechnicalId}
                      </button>
                    ) : null}
                  </div>
                </details>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
