"use client";

import type { RefObject } from "react";
import type { DashboardCopy } from "./dashboard-copy";
import type {
  DashboardProject,
  DiagramFilter,
  SnapshotFilter,
  SortOption,
  TemplateFilter,
  WorkspaceDensity,
  WorkspaceMode,
  WorkspaceViewMode,
} from "./workspace-projects";
import { legacyTemplateOptions } from "./workspace-projects";

type WorkspaceToolbarProps = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onClearSearch: () => void;
  diagramFilter: DiagramFilter;
  onDiagramFilterChange: (value: DiagramFilter) => void;
  templateFilter: TemplateFilter;
  onTemplateFilterChange: (value: TemplateFilter) => void;
  snapshotFilter: SnapshotFilter;
  onSnapshotFilterChange: (value: SnapshotFilter) => void;
  sortOption: SortOption;
  onSortOptionChange: (value: SortOption) => void;
  viewMode: WorkspaceViewMode;
  onViewModeChange: (value: WorkspaceViewMode) => void;
  density: WorkspaceDensity;
  onDensityChange: (value: WorkspaceDensity) => void;
  workspaceMode: WorkspaceMode;
  onWorkspaceModeChange: (value: WorkspaceMode) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  onOpenNewProject: () => void;
  newProjectButtonRef: RefObject<HTMLButtonElement | null>;
  filteredCount: number;
  totalCount: number;
  workspaceMessage: string | null;
  copy: DashboardCopy;
};

function getTemplateFilterLabel(
  template: DashboardProject["template"],
  workspaceMode: WorkspaceMode,
  copy: DashboardCopy,
) {
  const option = legacyTemplateOptions.find((entry) => entry.value === template);
  if (!option) {
    return template;
  }

  return copy.getTemplateLabel(option.value, workspaceMode);
}

export function WorkspaceToolbar({
  searchTerm,
  onSearchTermChange,
  onClearSearch,
  diagramFilter,
  onDiagramFilterChange,
  templateFilter,
  onTemplateFilterChange,
  snapshotFilter,
  onSnapshotFilterChange,
  sortOption,
  onSortOptionChange,
  viewMode,
  onViewModeChange,
  density,
  onDensityChange,
  workspaceMode,
  onWorkspaceModeChange,
  onClearFilters,
  hasActiveFilters,
  onOpenNewProject,
  newProjectButtonRef,
  filteredCount,
  totalCount,
  workspaceMessage,
  copy,
}: WorkspaceToolbarProps) {
  return (
    <div className="tile workspace-toolbar" data-testid="workspace-toolbar">
      <div className="workspace-toolbar-main">
        <div className="field workspace-search-field">
          <label htmlFor="workspace-search-input">{copy.filters.searchLabel}</label>
          <div className="workspace-search-input-wrap">
            <span className="workspace-search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path
                  d="M15.5 15.5 20 20M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <input
              id="workspace-search-input"
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                }
              }}
              placeholder={copy.filters.searchPlaceholder}
              data-testid="workspace-search"
              aria-label={copy.filters.searchAriaLabel}
            />
            <button
              className="btn workspace-search-clear-btn"
              type="button"
              onClick={onClearSearch}
              disabled={searchTerm.length === 0}
              aria-label={copy.filters.clearSearchAriaLabel}
              data-testid="workspace-search-clear"
            >
              {copy.filters.clearSearchButton}
            </button>
          </div>
        </div>

        <div className="field workspace-filter-field">
          <label htmlFor="workspace-filter-diagram">{copy.filters.diagramLabel}</label>
          <select
            id="workspace-filter-diagram"
            value={diagramFilter}
            onChange={(event) => onDiagramFilterChange(event.target.value as DiagramFilter)}
            data-testid="workspace-filter-diagram"
          >
            <option value="all">{copy.filters.allOption}</option>
            <option value="tree">{copy.getDiagramTypeLabel("tree")}</option>
            <option value="flow">{copy.getDiagramTypeLabel("flow")}</option>
            <option value="mindmap">{copy.getDiagramTypeLabel("mindmap")}</option>
            <option value="undefined">{copy.getDiagramTypeLabel(undefined)}</option>
          </select>
        </div>

        <div className="field workspace-filter-field">
          <label htmlFor="workspace-filter-template">
            {workspaceMode === "technical"
              ? copy.filters.templateLabelTechnical
              : copy.filters.templateLabelOperational}
          </label>
          <select
            id="workspace-filter-template"
            value={templateFilter}
            onChange={(event) =>
              onTemplateFilterChange(event.target.value as TemplateFilter)
            }
            data-testid="workspace-filter-template"
          >
            <option value="all">{copy.filters.allOption}</option>
            {legacyTemplateOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {getTemplateFilterLabel(option.value, workspaceMode, copy)}
              </option>
            ))}
          </select>
        </div>

        <div className="field workspace-filter-field">
          <label htmlFor="workspace-filter-snapshot">{copy.filters.snapshotLabel}</label>
          <select
            id="workspace-filter-snapshot"
            value={snapshotFilter}
            onChange={(event) =>
              onSnapshotFilterChange(event.target.value as SnapshotFilter)
            }
            data-testid="workspace-filter-snapshot"
          >
            <option value="all">{copy.filters.allOption}</option>
            <option value="generated">{copy.filters.generatedOption}</option>
            <option value="pending">{copy.filters.pendingOption}</option>
          </select>
        </div>

        <div className="field workspace-filter-field">
          <label htmlFor="workspace-sort">{copy.filters.sortLabel}</label>
          <select
            id="workspace-sort"
            value={sortOption}
            onChange={(event) => onSortOptionChange(event.target.value as SortOption)}
            data-testid="workspace-sort"
          >
            <option value="name-asc">{copy.filters.sortNameAsc}</option>
            <option value="updated-desc">{copy.filters.sortUpdatedDesc}</option>
            <option value="created-desc">{copy.filters.sortCreatedDesc}</option>
          </select>
        </div>
      </div>

      <div className="workspace-toolbar-actions">
        <div
          className="workspace-view-toggle"
          role="group"
          aria-label={copy.filters.viewModeAriaLabel}
          data-testid="workspace-view-toggle"
        >
          <button
            className={`btn ${viewMode === "grid" ? "btn-primary" : ""}`}
            type="button"
            aria-pressed={viewMode === "grid"}
            onClick={() => onViewModeChange("grid")}
          >
            {copy.viewMode.grid}
          </button>
          <button
            className={`btn ${viewMode === "list" ? "btn-primary" : ""}`}
            type="button"
            aria-pressed={viewMode === "list"}
            onClick={() => onViewModeChange("list")}
          >
            {copy.viewMode.list}
          </button>
        </div>

        <div
          className="workspace-view-toggle"
          role="group"
          aria-label={copy.filters.densityAriaLabel}
          data-testid="workspace-density-toggle"
        >
          <button
            className={`btn ${density === "compact" ? "btn-primary" : ""}`}
            type="button"
            aria-pressed={density === "compact"}
            onClick={() => onDensityChange("compact")}
          >
            {copy.density.compact}
          </button>
          <button
            className={`btn ${density === "comfortable" ? "btn-primary" : ""}`}
            type="button"
            aria-pressed={density === "comfortable"}
            onClick={() => onDensityChange("comfortable")}
          >
            {copy.density.comfortable}
          </button>
        </div>

        <div
          className="workspace-view-toggle"
          role="group"
          aria-label={copy.filters.workspaceModeAriaLabel}
          data-testid="workspace-mode-toggle"
        >
          <button
            className={`btn ${workspaceMode === "operational" ? "btn-primary" : ""}`}
            type="button"
            aria-pressed={workspaceMode === "operational"}
            onClick={() => onWorkspaceModeChange("operational")}
            data-testid="workspace-mode-operational"
          >
            {copy.workspaceMode.operational}
          </button>
          <button
            className={`btn ${workspaceMode === "technical" ? "btn-primary" : ""}`}
            type="button"
            aria-pressed={workspaceMode === "technical"}
            onClick={() => onWorkspaceModeChange("technical")}
            data-testid="workspace-mode-technical"
          >
            {copy.workspaceMode.technical}
          </button>
        </div>

        <button
          className="btn"
          type="button"
          onClick={onClearFilters}
          disabled={!hasActiveFilters}
          data-testid="workspace-clear-filters"
        >
          {copy.filters.clearFiltersButton}
        </button>

        <button
          ref={newProjectButtonRef}
          className="btn btn-primary"
          type="button"
          onClick={onOpenNewProject}
          data-testid="new-project-button"
        >
          {copy.filters.newProjectButton}
        </button>
      </div>

      <div className="row-actions row-actions-between workspace-toolbar-footer">
        <span className="helper" data-testid="workspace-project-counter">
          {copy.getCounterLabel(filteredCount, totalCount)}
        </span>
        {workspaceMessage ? (
          <span className="helper" aria-live="polite">
            {workspaceMessage}
          </span>
        ) : null}
      </div>
    </div>
  );
}
