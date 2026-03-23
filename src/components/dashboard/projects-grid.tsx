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

type ProjectsGridProps = {
  projects: DashboardProject[];
  density: WorkspaceDensity;
  workspaceMode: WorkspaceMode;
  highlightedProjectId: string | null;
  onCopyTechnicalId: (project: DashboardProject) => void;
  copy: DashboardCopy;
};

type ProjectCardProps = {
  project: DashboardProject;
  density: WorkspaceDensity;
  workspaceMode: WorkspaceMode;
  highlighted: boolean;
  onCopyTechnicalId: (project: DashboardProject) => void;
  copy: DashboardCopy;
};

const ProjectCard = memo(function ProjectCard({
  project,
  density,
  workspaceMode,
  highlighted,
  onCopyTechnicalId,
  copy,
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
          {copy.getSnapshotStatusLabel(project.hasInitialSnapshot)}
        </span>
      </header>

      <p className="workspace-project-description" title={project.description ?? ""}>
        {project.description?.trim() || copy.project.fallbackDescription}
      </p>

      <div className="workspace-project-meta-row">
        <span className="workspace-project-meta-item">
          {copy.getDiagramTypeLabel(project.selectedDiagramType)}
        </span>
        <span className="workspace-project-meta-item">
          {copy.getTemplateLabel(project.template, workspaceMode)}
        </span>
        <span className="workspace-project-meta-item">
          {copy.getProjectUpdatedLabel(project.updatedAt)}
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
              href={buildEditorHref(project.id)}
              data-testid={`dashboard-open-editor-menu-${project.id}`}
            >
              {copy.project.openEditor}
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
  highlightedProjectId,
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
          highlighted={highlightedProjectId === project.id}
          onCopyTechnicalId={onCopyTechnicalId}
          copy={copy}
        />
      ))}
    </div>
  );
});
