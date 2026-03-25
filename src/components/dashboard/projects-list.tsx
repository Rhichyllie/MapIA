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

type ProjectsListProps = {
  projects: DashboardProject[];
  density: WorkspaceDensity;
  workspaceMode: WorkspaceMode;
  onCopyTechnicalId: (project: DashboardProject) => void;
  copy: DashboardCopy;
};

export const ProjectsList = memo(function ProjectsList({
  projects,
  density,
  workspaceMode,
  onCopyTechnicalId,
  copy,
}: ProjectsListProps) {
  return (
    <div
      className={`workspace-project-list workspace-density-${density}`}
      data-testid="dashboard-project-list"
      data-view="list"
      data-density={density}
      role="list"
      aria-label={copy.project.listAriaLabel}
    >
      {projects.map((project) => {
        const snapshotTone = getSnapshotStatusTone(project.hasInitialSnapshot);
        const canShowVersions = project.snapshotVersionCount > 0;
        const statusMeta = copy.getProjectStatusMeta(project.hasInitialSnapshot);
        const updatedMeta = copy.getProjectUpdatedMeta(project.updatedAt);

        return (
          <article
            key={project.id}
            className={`workspace-project-list-row workspace-density-${density}`}
            role="listitem"
            data-project-id={project.id}
            data-mode={workspaceMode}
            data-testid={`dashboard-project-card-${project.id}`}
          >
            <Link
              className="workspace-project-list-primary-link"
              href={buildEditorHref(project.id)}
              data-testid={`dashboard-project-primary-link-${project.id}`}
            >
              <div className="workspace-project-list-heading">
                <div className="workspace-project-list-heading-copy">
                  <span className="workspace-project-list-surface-hint">
                    {copy.project.openSurfaceHint}
                  </span>
                  <strong
                    className="workspace-project-list-project-name"
                    title={project.name}
                  >
                    {project.name}
                  </strong>
                </div>
              </div>

              <p
                className="workspace-project-list-project-description"
                title={project.description ?? ""}
              >
                {project.description?.trim() || copy.project.fallbackDescription}
              </p>

              <div
                className="workspace-project-list-facts"
                data-testid={`dashboard-project-facts-${project.id}`}
              >
                <div
                  className="workspace-project-list-fact"
                  data-testid={`dashboard-project-fact-template-${project.id}`}
                >
                  <span className="workspace-project-list-fact-label">
                    {copy.project.facts.template}
                  </span>
                  <span className="workspace-project-list-fact-value">
                    {copy.getTemplateLabel(project.template, workspaceMode)}
                  </span>
                </div>

                <div
                  className="workspace-project-list-fact"
                  data-testid={`dashboard-project-fact-diagram-${project.id}`}
                >
                  <span className="workspace-project-list-fact-label">
                    {copy.project.facts.diagram}
                  </span>
                  <span className="workspace-project-list-fact-value">
                    {copy.getDiagramTypeLabel(project.selectedDiagramType)}
                  </span>
                </div>

                <div
                  className="workspace-project-list-fact"
                  data-testid={`dashboard-project-fact-status-${project.id}`}
                >
                  <span className="workspace-project-list-fact-label">
                    {copy.project.facts.status}
                  </span>
                  <span
                    className={`badge workspace-status-badge workspace-status-${snapshotTone}`}
                  >
                    {statusMeta.label}
                  </span>
                  <small>{statusMeta.hint}</small>
                </div>

                <div
                  className="workspace-project-list-fact"
                  data-testid={`dashboard-project-fact-updated-${project.id}`}
                >
                  <span className="workspace-project-list-fact-label">
                    {copy.project.facts.updated}
                  </span>
                  <span className="workspace-project-list-fact-value">
                    {updatedMeta.label}
                  </span>
                  <small>{updatedMeta.hint}</small>
                </div>
              </div>
            </Link>

            <div
              className="workspace-project-list-actions"
              data-testid={`dashboard-project-actions-${project.id}`}
            >
              <Link
                className="btn btn-primary workspace-project-primary-action"
                href={buildEditorHref(project.id)}
                data-testid={`dashboard-open-editor-${project.id}`}
              >
                {copy.project.open}
              </Link>

              <details
                className="workspace-project-actions-menu workspace-project-secondary-actions"
                data-testid={`dashboard-project-secondary-actions-${project.id}`}
              >
                <summary
                  className="btn workspace-project-secondary-trigger"
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
      })}
    </div>
  );
});
