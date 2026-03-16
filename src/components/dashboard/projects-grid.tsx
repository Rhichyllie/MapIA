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

type ProjectsGridProps = {
  projects: DashboardProject[];
  density: WorkspaceDensity;
  workspaceMode: WorkspaceMode;
  highlightedProjectId: string | null;
  onCopyTechnicalId: (project: DashboardProject) => void;
};

type ProjectCardProps = {
  project: DashboardProject;
  density: WorkspaceDensity;
  workspaceMode: WorkspaceMode;
  highlighted: boolean;
  onCopyTechnicalId: (project: DashboardProject) => void;
};

const ProjectCard = memo(function ProjectCard({
  project,
  density,
  workspaceMode,
  highlighted,
  onCopyTechnicalId,
}: ProjectCardProps) {
  const snapshotTone = getSnapshotStatusTone(project.hasInitialSnapshot);
  const canShowVersions = project.snapshotVersionCount > 0;

  return (
    <article
      className={`tile workspace-project-card workspace-density-${density} ${
        highlighted ? "is-highlighted" : ""
      }`}
      data-project-id={project.id}
      data-testid={`dashboard-project-card-${project.id}`}
    >
      <header className="workspace-project-card-header">
        <h3 className="workspace-project-title" title={project.name}>
          {project.name}
        </h3>
        <span className={`badge workspace-status-badge workspace-status-${snapshotTone}`}>
          {getSnapshotStatusLabel(project.hasInitialSnapshot)}
        </span>
      </header>

      <p className="workspace-project-description" title={project.description ?? ""}>
        {project.description?.trim() || "Sem finalidade informada"}
      </p>

      <div className="workspace-project-meta-row">
        <span className="workspace-project-meta-item">
          {getDiagramTypeLabel(project.selectedDiagramType)}
        </span>
        <span className="workspace-project-meta-item">
          {getTemplateLabel(project.template, workspaceMode)}
        </span>
        <span className="workspace-project-meta-item">
          Atualizado em {formatDateLabel(project.updatedAt)}
        </span>
      </div>

      <div className="row-actions workspace-project-actions-row">
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
              href={buildEditorHref(project.id)}
              data-testid={`dashboard-open-editor-menu-${project.id}`}
            >
              Abrir Editor
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
    </article>
  );
});

export const ProjectsGrid = memo(function ProjectsGrid({
  projects,
  density,
  workspaceMode,
  highlightedProjectId,
  onCopyTechnicalId,
}: ProjectsGridProps) {
  return (
    <div
      className={`workspace-project-grid workspace-density-${density}`}
      data-testid="dashboard-project-list"
      data-view="grid"
      data-density={density}
    >
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          density={density}
          workspaceMode={workspaceMode}
          highlighted={highlightedProjectId === project.id}
          onCopyTechnicalId={onCopyTechnicalId}
        />
      ))}
    </div>
  );
});
