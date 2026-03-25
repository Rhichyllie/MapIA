"use client";

import { Link } from "@/src/i18n/navigation";
import type { DashboardCopy } from "./dashboard-copy";
import type {
  DashboardProject,
  DiagramFilter,
  SnapshotFilter,
  SortOption,
  TemplateFilter,
  UpdatedAtFilter,
  WorkspaceDensity,
  WorkspaceMode,
  WorkspaceViewMode,
} from "./workspace-projects";
import { legacyTemplateOptions } from "./workspace-projects";

type WorkspaceToolbarProps = {
  workspaceId: string;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onClearSearch: () => void;
  diagramFilter: DiagramFilter;
  onDiagramFilterChange: (value: DiagramFilter) => void;
  templateFilter: TemplateFilter;
  onTemplateFilterChange: (value: TemplateFilter) => void;
  snapshotFilter: SnapshotFilter;
  onSnapshotFilterChange: (value: SnapshotFilter) => void;
  updatedFilter: UpdatedAtFilter;
  onUpdatedFilterChange: (value: UpdatedAtFilter) => void;
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
  activeRefinementCount: number;
  isFiltersPanelOpen: boolean;
  onToggleFiltersPanel: () => void;
  isPreferencesPanelOpen: boolean;
  onTogglePreferencesPanel: () => void;
  newProjectHref: string;
  filteredCount: number;
  totalCount: number;
  collectionSummary: string;
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
  workspaceId,
  searchTerm,
  onSearchTermChange,
  onClearSearch,
  diagramFilter,
  onDiagramFilterChange,
  templateFilter,
  onTemplateFilterChange,
  snapshotFilter,
  onSnapshotFilterChange,
  updatedFilter,
  onUpdatedFilterChange,
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
  activeRefinementCount,
  isFiltersPanelOpen,
  onToggleFiltersPanel,
  isPreferencesPanelOpen,
  onTogglePreferencesPanel,
  newProjectHref,
  filteredCount,
  totalCount,
  collectionSummary,
  workspaceMessage,
  copy,
}: WorkspaceToolbarProps) {
  return (
    <div
      className="tile workspace-toolbar"
      data-testid="workspace-toolbar"
      data-workspace-id={workspaceId}
    >
      <div className="workspace-toolbar-primary">
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

        <div className="workspace-toolbar-cta">
          <Link
            className="btn btn-primary workspace-new-project-link"
            href={newProjectHref}
            data-testid="new-project-button"
          >
            {copy.filters.newProjectButton}
          </Link>
          <p className="helper">{copy.filters.newProjectHelper}</p>
        </div>
      </div>

      <div className="workspace-toolbar-secondary">
        <div className="workspace-toolbar-summary">
          <span className="helper" data-testid="workspace-project-counter">
            {copy.getCounterLabel(filteredCount, totalCount)}
          </span>
          <span className="helper" data-testid="workspace-collection-summary">
            {collectionSummary}
          </span>
          {workspaceMessage ? (
            <span className="helper" aria-live="polite">
              {workspaceMessage}
            </span>
          ) : null}
        </div>

        <div className="workspace-toolbar-secondary-actions">
          <button
            className={`btn ${isFiltersPanelOpen ? "btn-primary" : ""}`}
            type="button"
            onClick={onToggleFiltersPanel}
            aria-expanded={isFiltersPanelOpen}
            aria-controls="workspace-filters-panel"
            data-testid="workspace-toggle-filters"
          >
            {copy.filters.refineButton}
            {activeRefinementCount > 0 ? (
              <span className="workspace-toolbar-button-count">
                {copy.getActiveRefinementsLabel(activeRefinementCount)}
              </span>
            ) : null}
          </button>

          <button
            className={`btn ${isPreferencesPanelOpen ? "btn-primary" : ""}`}
            type="button"
            onClick={onTogglePreferencesPanel}
            aria-expanded={isPreferencesPanelOpen}
            aria-controls="workspace-preferences-panel"
            data-testid="workspace-toggle-preferences"
          >
            {copy.filters.preferencesButton}
          </button>
        </div>
      </div>

      {isFiltersPanelOpen ? (
        <section
          id="workspace-filters-panel"
          className="workspace-toolbar-panel"
          data-testid="workspace-filters-panel"
        >
          <div className="workspace-toolbar-panel-header">
            <div>
              <strong>{copy.filters.filtersPanelTitle}</strong>
              <p className="helper">{copy.filters.filtersPanelDescription}</p>
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
          </div>

          <div className="workspace-toolbar-panel-grid">
            <div className="field workspace-filter-field">
              <label htmlFor="workspace-filter-diagram">{copy.filters.diagramLabel}</label>
              <select
                id="workspace-filter-diagram"
                value={diagramFilter}
                onChange={(event) =>
                  onDiagramFilterChange(event.target.value as DiagramFilter)
                }
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
              <label htmlFor="workspace-filter-snapshot">
                {copy.filters.snapshotLabel}
              </label>
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
              <label htmlFor="workspace-filter-updated">
                {copy.filters.updatedLabel}
              </label>
              <select
                id="workspace-filter-updated"
                value={updatedFilter}
                onChange={(event) =>
                  onUpdatedFilterChange(event.target.value as UpdatedAtFilter)
                }
                data-testid="workspace-filter-updated"
              >
                <option value="all">{copy.filters.allOption}</option>
                <option value="today">{copy.filters.updatedTodayOption}</option>
                <option value="last-7-days">
                  {copy.filters.updatedLast7DaysOption}
                </option>
                <option value="last-30-days">
                  {copy.filters.updatedLast30DaysOption}
                </option>
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
        </section>
      ) : null}

      {isPreferencesPanelOpen ? (
        <section
          id="workspace-preferences-panel"
          className="workspace-toolbar-panel"
          data-testid="workspace-preferences-panel"
        >
          <div className="workspace-toolbar-panel-header">
            <div>
              <strong>{copy.filters.preferencesPanelTitle}</strong>
              <p className="helper">{copy.filters.preferencesPanelDescription}</p>
            </div>
          </div>

          <div className="workspace-toolbar-preferences-grid">
            <div className="workspace-toolbar-preference-group">
              <div className="workspace-toolbar-preference-copy">
                <span className="workspace-toolbar-preference-label">
                  {copy.filters.viewModeAriaLabel}
                </span>
                <span className="helper">{copy.filters.listDefaultHelper}</span>
              </div>
              <div
                className="workspace-view-toggle"
                role="group"
                aria-label={copy.filters.viewModeAriaLabel}
                data-testid="workspace-view-toggle"
              >
                <button
                  className={`btn ${viewMode === "list" ? "btn-primary" : ""}`}
                  type="button"
                  aria-pressed={viewMode === "list"}
                  onClick={() => onViewModeChange("list")}
                  data-testid="workspace-view-list"
                >
                  {copy.viewMode.list}
                </button>
                <button
                  className={`btn ${viewMode === "grid" ? "btn-primary" : ""}`}
                  type="button"
                  aria-pressed={viewMode === "grid"}
                  onClick={() => onViewModeChange("grid")}
                  data-testid="workspace-view-grid"
                >
                  {copy.viewMode.grid}
                </button>
              </div>
            </div>

            <div className="workspace-toolbar-preference-group">
              <div className="workspace-toolbar-preference-copy">
                <span className="workspace-toolbar-preference-label">
                  {copy.filters.densityAriaLabel}
                </span>
                <span className="helper">{copy.filters.densityHelper}</span>
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
                  data-testid="workspace-density-compact"
                >
                  {copy.density.compact}
                </button>
                <button
                  className={`btn ${density === "comfortable" ? "btn-primary" : ""}`}
                  type="button"
                  aria-pressed={density === "comfortable"}
                  onClick={() => onDensityChange("comfortable")}
                  data-testid="workspace-density-comfortable"
                >
                  {copy.density.comfortable}
                </button>
              </div>
            </div>

            <div className="workspace-toolbar-preference-group">
              <div className="workspace-toolbar-preference-copy">
                <span className="workspace-toolbar-preference-label">
                  {copy.filters.workspaceModeAriaLabel}
                </span>
                <span className="helper">{copy.filters.workspaceModeHelper}</span>
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
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
