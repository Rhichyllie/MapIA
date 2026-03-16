"use client";

import Link from "next/link";
import { memo } from "react";
import type {
  DashboardProject,
  WorkspaceDensity,
  WorkspaceMode,
} from "./workspace-projects";
import {
  buildEditorHref,
  buildVersionsHref,
  buildWizardHref,
  formatDateLabel,
  getDiagramTypeLabel,
  getSnapshotStatusLabel,
  getSnapshotStatusTone,
  getTemplateLabel,
} from "./workspace-projects";

type ProjectsListProps = {
  projects: DashboardProject[];
  density: WorkspaceDensity;
  workspaceMode: WorkspaceMode;
  highlightedProjectId: string | null;
  onOpenProject: (projectId: string) => void;
  onCopyTechnicalId: (project: DashboardProject) => void;
};

export const ProjectsList = memo(function ProjectsList({
  projects,
  density,
  workspaceMode,
  highlightedProjectId,
  onOpenProject,
  onCopyTechnicalId,
}: ProjectsListProps) {
  return (
    <div
      className={`workspace-project-list workspace-density-${density}`}
      data-testid="dashboard-project-list"
      data-view="list"
      data-density={density}
      role="table"
      aria-label="Lista de projetos"
    >
      <div className="workspace-project-list-header" role="row">
        <span role="columnheader">Projeto</span>
        <span role="columnheader">Tipo</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Atualizado</span>
        <span role="columnheader">Acoes</span>
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
                  {project.description?.trim() || "Sem finalidade informada"}
                </span>
              </div>

              <span className="workspace-project-list-type" role="cell">
                {getTemplateLabel(project.template, workspaceMode)}
                <small>{getDiagramTypeLabel(project.selectedDiagramType)}</small>
              </span>

              <span className="workspace-project-list-status" role="cell">
                <span className={`badge workspace-status-badge workspace-status-${snapshotTone}`}>
                  {getSnapshotStatusLabel(project.hasInitialSnapshot)}
                </span>
              </span>

              <span className="workspace-project-list-updated" role="cell">
                {formatDateLabel(project.updatedAt)}
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
                  Abrir
                </Link>

                <details className="workspace-project-actions-menu">
                  <summary className="btn" aria-label={`Mais acoes para ${project.name}`}>
                    ...
                  </summary>
                  <div className="workspace-project-actions-popover">
                    <Link
                      className="btn"
                      href={buildWizardHref(project.id, "wizard")}
                      data-testid={`dashboard-open-wizard-${project.id}`}
                    >
                      Abrir Assistente
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
                      Ver versoes
                    </Link>
                    {workspaceMode === "technical" ? (
                      <button
                        className="btn"
                        type="button"
                        onClick={() => onCopyTechnicalId(project)}
                        data-testid={`dashboard-copy-technical-id-${project.id}`}
                      >
                        Copiar ID tecnico
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
