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
  buildProjectAssistantHref,
  buildVersionsHref,
  getSnapshotStatusTone,
} from "./workspace-projects";

type ProjectsGridProps = {
  projects: DashboardProject[];
  density: WorkspaceDensity;
  workspaceMode: WorkspaceMode;
  onCopyTechnicalId: (project: DashboardProject) => void;
  copy: DashboardCopy;
};

type ProjectCardProps = {
  project: DashboardProject;
  density: WorkspaceDensity;
  workspaceMode: WorkspaceMode;
  onCopyTechnicalId: (project: DashboardProject) => void;
  copy: DashboardCopy;
};

const ProjectCard = memo(function ProjectCard({
  project,
  density,
  workspaceMode,
  onCopyTechnicalId,
  copy,
}: ProjectCardProps) {
  const snapshotTone = getSnapshotStatusTone(project.hasInitialSnapshot);
  const canShowVersions = project.snapshotVersionCount > 0;
  const updatedMeta = copy.getProjectUpdatedMeta(project.updatedAt);
  const statusMeta = copy.getProjectStatusMeta(project.hasInitialSnapshot);

  return (
    <article
      className={`tile workspace-project-card workspace-density-${density}`}
      data-project-id={project.id}
      data-testid={`dashboard-project-card-${project.id}`}
    >
      <header className="workspace-project-card-header">
        <div className="workspace-project-card-copy">
          <Link className="workspace-project-title-link" href={buildEditorHref(project.id)}>
            <h3 className="workspace-project-title" title={project.name}>
              {project.name}
            </h3>
          </Link>
          <p className="workspace-project-description" title={project.description ?? ""}>
            {project.description?.trim() || copy.project.fallbackDescription}
          </p>
        </div>

        <span className={`badge workspace-status-badge workspace-status-${snapshotTone}`}>
          {statusMeta.label}
        </span>
      </header>

      <div className="workspace-project-meta-row">
        <span className="workspace-project-meta-item">
          {copy.getTemplateLabel(project.template, workspaceMode)}
        </span>
        <span className="workspace-project-meta-item">
          {copy.getDiagramTypeLabel(project.selectedDiagramType)}
        </span>
        <span className="workspace-project-meta-item">
          {updatedMeta.label}
        </span>
      </div>

      <div className="row-actions workspace-project-actions-row">
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
            {copy.project.secondaryActionsLabel}
          </summary>
          <div className="workspace-project-actions-popover">
            <Link
              className="btn"
              href={buildProjectAssistantHref(project.id)}
              data-testid={`dashboard-open-assistant-${project.id}`}
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
    </article>
  );
});

export const ProjectsGrid = memo(function ProjectsGrid({
  projects,
  density,
  workspaceMode,
  onCopyTechnicalId,
  copy,
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
          onCopyTechnicalId={onCopyTechnicalId}
          copy={copy}
        />
      ))}
    </div>
  );
});
