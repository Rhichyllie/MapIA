"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/src/i18n/navigation";
import { EmptyState } from "@/src/components/ui/empty-state";
import { PageHeader } from "@/src/components/ui/page-header";
import { useDashboardCopy } from "./dashboard-copy";
import { ProjectsGrid } from "./projects-grid";
import { ProjectsList } from "./projects-list";
import { WorkspaceToolbar } from "./workspace-toolbar";
import {
  DEFAULT_WORKSPACE_COLLECTION_PAGE_SIZE,
  DEFAULT_WORKSPACE_DENSITY,
  DEFAULT_WORKSPACE_MODE,
  DEFAULT_WORKSPACE_VIEW_MODE,
  SEARCH_DEBOUNCE_MS,
  WORKSPACE_COLLECTION_PAGE_SIZE_OPTIONS,
  buildWorkspacePaginationItems,
  buildCreationAssistantHref,
  filterAndSortProjects,
  paginateProjects,
  sanitizeWorkspaceCollectionPageSize,
  type DashboardProject,
  type DashboardWorkspace,
  type DiagramFilter,
  type SnapshotFilter,
  type SortOption,
  type TemplateFilter,
  type UpdatedAtFilter,
  type WorkspaceDensity,
  type WorkspaceMode,
  type WorkspaceViewMode,
} from "./workspace-projects";

type DashboardProjectsPanelProps = {
  workspace: DashboardWorkspace;
  projects: DashboardProject[];
};

const WORKSPACE_VIEW_STORAGE_KEY_PREFIX = "mapia-workspace-view-v2";
const WORKSPACE_DENSITY_STORAGE_KEY_PREFIX = "mapia-workspace-density-v2";
const WORKSPACE_MODE_STORAGE_KEY_PREFIX = "mapia-workspace-mode-v2";
const WORKSPACE_PAGE_SIZE_STORAGE_KEY_PREFIX = "mapia-workspace-page-size-v1";

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [delayMs, value]);

  return debouncedValue;
}

async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function DashboardProjectsPanel({
  workspace,
  projects,
}: DashboardProjectsPanelProps) {
  const copy = useDashboardCopy();
  const workspaceViewStorageKey = `${WORKSPACE_VIEW_STORAGE_KEY_PREFIX}:${workspace.id}`;
  const workspaceDensityStorageKey =
    `${WORKSPACE_DENSITY_STORAGE_KEY_PREFIX}:${workspace.id}`;
  const workspaceModeStorageKey = `${WORKSPACE_MODE_STORAGE_KEY_PREFIX}:${workspace.id}`;
  const workspacePageSizeStorageKey =
    `${WORKSPACE_PAGE_SIZE_STORAGE_KEY_PREFIX}:${workspace.id}`;

  const [searchTerm, setSearchTerm] = useState("");
  const [diagramFilter, setDiagramFilter] = useState<DiagramFilter>("all");
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>("all");
  const [snapshotFilter, setSnapshotFilter] = useState<SnapshotFilter>("all");
  const [updatedFilter, setUpdatedFilter] = useState<UpdatedAtFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("updated-desc");
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>(
    DEFAULT_WORKSPACE_VIEW_MODE,
  );
  const [density, setDensity] = useState<WorkspaceDensity>(
    DEFAULT_WORKSPACE_DENSITY,
  );
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(
    DEFAULT_WORKSPACE_MODE,
  );
  const [pageSize, setPageSize] = useState(DEFAULT_WORKSPACE_COLLECTION_PAGE_SIZE);
  const [hasHydratedPreferences, setHasHydratedPreferences] = useState(false);
  const [workspaceMessage, setWorkspaceMessage] = useState<string | null>(null);
  const [isFiltersPanelOpen, setIsFiltersPanelOpen] = useState(false);
  const [isPreferencesPanelOpen, setIsPreferencesPanelOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const debouncedSearchTerm = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storedView = window.localStorage.getItem(workspaceViewStorageKey);
      if (storedView === "grid" || storedView === "list") {
        setViewMode(storedView);
      }

      const storedDensity = window.localStorage.getItem(workspaceDensityStorageKey);
      if (storedDensity === "compact" || storedDensity === "comfortable") {
        setDensity(storedDensity);
      }

      const storedMode = window.localStorage.getItem(workspaceModeStorageKey);
      if (storedMode === "operational" || storedMode === "technical") {
        setWorkspaceMode(storedMode);
      }

      const storedPageSize = window.localStorage.getItem(workspacePageSizeStorageKey);
      setPageSize(sanitizeWorkspaceCollectionPageSize(storedPageSize));
    } catch {
      setViewMode(DEFAULT_WORKSPACE_VIEW_MODE);
      setDensity(DEFAULT_WORKSPACE_DENSITY);
      setWorkspaceMode(DEFAULT_WORKSPACE_MODE);
      setPageSize(DEFAULT_WORKSPACE_COLLECTION_PAGE_SIZE);
    } finally {
      setHasHydratedPreferences(true);
    }
  }, [
    workspaceDensityStorageKey,
    workspaceModeStorageKey,
    workspacePageSizeStorageKey,
    workspaceViewStorageKey,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasHydratedPreferences) {
      return;
    }

    try {
      window.localStorage.setItem(workspaceViewStorageKey, viewMode);
      window.localStorage.setItem(workspaceDensityStorageKey, density);
      window.localStorage.setItem(workspaceModeStorageKey, workspaceMode);
      window.localStorage.setItem(workspacePageSizeStorageKey, String(pageSize));
    } catch {
      // Ignora indisponibilidade do localStorage.
    }
  }, [
    density,
    hasHydratedPreferences,
    pageSize,
    viewMode,
    workspaceDensityStorageKey,
    workspaceMode,
    workspaceModeStorageKey,
    workspacePageSizeStorageKey,
    workspaceViewStorageKey,
  ]);

  const filteredProjects = useMemo(
    () =>
      filterAndSortProjects(
        projects,
        {
          searchTerm: debouncedSearchTerm,
          diagramFilter,
          templateFilter,
          snapshotFilter,
          updatedFilter,
          sortOption,
          workspaceMode,
        },
        copy,
      ),
    [
      copy,
      debouncedSearchTerm,
      diagramFilter,
      projects,
      snapshotFilter,
      sortOption,
      templateFilter,
      updatedFilter,
      workspaceMode,
    ],
  );

  const hasActiveFilters =
    debouncedSearchTerm.trim().length > 0 ||
    diagramFilter !== "all" ||
    templateFilter !== "all" ||
    snapshotFilter !== "all" ||
    updatedFilter !== "all" ||
    sortOption !== "updated-desc";
  const activeRefinementCount =
    Number(diagramFilter !== "all") +
    Number(templateFilter !== "all") +
    Number(snapshotFilter !== "all") +
    Number(updatedFilter !== "all") +
    Number(sortOption !== "updated-desc");

  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearchTerm,
    diagramFilter,
    updatedFilter,
    snapshotFilter,
    sortOption,
    templateFilter,
    viewMode,
    workspaceMode,
  ]);

  useEffect(() => {
    if (activeRefinementCount > 0) {
      setIsFiltersPanelOpen(true);
    }
  }, [activeRefinementCount]);

  const paginatedProjects = useMemo(
    () => paginateProjects(filteredProjects, { page: currentPage, pageSize }),
    [currentPage, filteredProjects, pageSize],
  );
  const paginationItems = useMemo(
    () =>
      buildWorkspacePaginationItems({
        currentPage: paginatedProjects.currentPage,
        pageCount: paginatedProjects.pageCount,
      }),
    [paginatedProjects.currentPage, paginatedProjects.pageCount],
  );
  const pageJumpOptions = useMemo(
    () =>
      Array.from({ length: paginatedProjects.pageCount }, (_, index) => index + 1),
    [paginatedProjects.pageCount],
  );

  useEffect(() => {
    if (currentPage !== paginatedProjects.currentPage) {
      setCurrentPage(paginatedProjects.currentPage);
    }
  }, [currentPage, paginatedProjects.currentPage]);

  const workspaceStats = useMemo(() => {
    const withGeneratedSnapshot = projects.filter(
      (project) => project.hasInitialSnapshot,
    ).length;

    return {
      total: projects.length,
      generated: withGeneratedSnapshot,
      pending: projects.length - withGeneratedSnapshot,
    };
  }, [projects]);

  async function handleCopyTechnicalId(project: DashboardProject) {
    try {
      await copyTextToClipboard(project.id);
      setWorkspaceMessage(copy.getCopiedTechnicalIdMessage(project.id));
    } catch {
      setWorkspaceMessage(copy.messages.copyTechnicalIdError);
    }
  }

  function clearFilters() {
    setSearchTerm("");
    setDiagramFilter("all");
    setTemplateFilter("all");
    setSnapshotFilter("all");
    setUpdatedFilter("all");
    setSortOption("updated-desc");
  }

  function handlePageSizeChange(nextValue: string) {
    const nextPageSize = sanitizeWorkspaceCollectionPageSize(nextValue);
    setPageSize(nextPageSize);
    setCurrentPage(1);
  }

  return (
    <>
      <section className="panel">
        <PageHeader
          title={copy.page.title}
          description={copy.page.description}
          actions={
            <span className="badge">
              <span className="badge-dot" aria-hidden="true" />
              {workspace.name}
            </span>
          }
        />

        <div className="panel-body stack-sm">
          <WorkspaceToolbar
            workspaceId={workspace.id}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            onClearSearch={() => setSearchTerm("")}
            diagramFilter={diagramFilter}
            onDiagramFilterChange={setDiagramFilter}
            templateFilter={templateFilter}
            onTemplateFilterChange={setTemplateFilter}
            snapshotFilter={snapshotFilter}
            onSnapshotFilterChange={setSnapshotFilter}
            updatedFilter={updatedFilter}
            onUpdatedFilterChange={setUpdatedFilter}
            sortOption={sortOption}
            onSortOptionChange={setSortOption}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            density={density}
            onDensityChange={setDensity}
            workspaceMode={workspaceMode}
            onWorkspaceModeChange={setWorkspaceMode}
            onClearFilters={clearFilters}
            hasActiveFilters={hasActiveFilters}
            activeRefinementCount={activeRefinementCount}
            isFiltersPanelOpen={isFiltersPanelOpen}
            onToggleFiltersPanel={() =>
              setIsFiltersPanelOpen((current) => !current)
            }
            isPreferencesPanelOpen={isPreferencesPanelOpen}
            onTogglePreferencesPanel={() =>
              setIsPreferencesPanelOpen((current) => !current)
            }
            newProjectHref={buildCreationAssistantHref()}
            filteredCount={filteredProjects.length}
            totalCount={projects.length}
            collectionSummary={copy.getCollectionSummaryLabel(workspaceStats)}
            workspaceMessage={workspaceMessage}
            copy={copy}
          />
        </div>
      </section>

      <section className="panel">
        <PageHeader
          title={copy.page.projectListTitle}
          description={copy.getProjectListDescription(filteredProjects.length)}
        />

        <div className="panel-body stack-sm">
          {filteredProjects.length === 0 ? (
            projects.length === 0 ? (
              <EmptyState
                eyebrow={copy.emptyStates.noneCreatedEyebrow}
                title={copy.emptyStates.noneCreatedTitle}
                description={copy.emptyStates.noneCreatedDescription}
                actions={
                  <Link
                    className="btn btn-primary"
                    href={buildCreationAssistantHref()}
                    data-testid="dashboard-empty-create-project"
                  >
                    {copy.filters.newProjectButton}
                  </Link>
                }
                className="workspace-empty-state"
                dataTestId="dashboard-empty-projects"
              />
            ) : (
              <EmptyState
                eyebrow={copy.emptyStates.noneFilteredEyebrow}
                title={copy.emptyStates.noneFilteredTitle}
                description={copy.emptyStates.noneFilteredDescription}
                actions={
                  <button
                    className="btn"
                    type="button"
                    onClick={clearFilters}
                    data-testid="dashboard-empty-clear-filters"
                  >
                    {copy.filters.clearFiltersButton}
                  </button>
                }
                className="workspace-empty-state"
                dataTestId="dashboard-empty-filtered-projects"
              />
            )
          ) : (
            <>
              {viewMode === "grid" ? (
                <ProjectsGrid
                  projects={paginatedProjects.projects}
                  density={density}
                  workspaceMode={workspaceMode}
                  onCopyTechnicalId={handleCopyTechnicalId}
                  copy={copy}
                />
              ) : (
                <ProjectsList
                  projects={paginatedProjects.projects}
                  density={density}
                  workspaceMode={workspaceMode}
                  onCopyTechnicalId={handleCopyTechnicalId}
                  copy={copy}
                />
              )}

              <div
                className="workspace-collection-footer"
                data-testid="workspace-collection-footer"
              >
                <div className="workspace-collection-footer-copy">
                  <div className="workspace-collection-footer-item">
                    <span className="workspace-collection-footer-label">
                      {copy.collection.rangeCaption}
                    </span>
                    <span className="helper" data-testid="workspace-collection-range">
                      {copy.getCollectionRangeLabel(
                        paginatedProjects.rangeStart,
                        paginatedProjects.rangeEnd,
                        filteredProjects.length,
                      )}
                    </span>
                  </div>
                  <div className="workspace-collection-footer-item">
                    <span className="workspace-collection-footer-label">
                      {copy.collection.pageCaption}
                    </span>
                    <span className="helper" data-testid="workspace-collection-page">
                      {copy.getCollectionPageLabel(
                        paginatedProjects.currentPage,
                        paginatedProjects.pageCount,
                      )}
                    </span>
                  </div>
                </div>

                <div className="workspace-collection-footer-controls">
                  <div className="field workspace-collection-select-field">
                    <label htmlFor="workspace-page-size">
                      {copy.collection.pageSizeLabel}
                    </label>
                    <select
                      id="workspace-page-size"
                      value={String(pageSize)}
                      onChange={(event) => handlePageSizeChange(event.target.value)}
                      aria-label={copy.collection.pageSizeAriaLabel}
                      data-testid="workspace-page-size"
                    >
                      {WORKSPACE_COLLECTION_PAGE_SIZE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <nav
                    className="workspace-collection-pagination"
                    aria-label={copy.collection.navigationAriaLabel}
                    data-testid="workspace-collection-pagination"
                  >
                    <button
                      className="btn"
                      type="button"
                      onClick={() =>
                        setCurrentPage((page) => Math.max(1, page - 1))
                      }
                      disabled={paginatedProjects.currentPage <= 1}
                      data-testid="workspace-prev-page"
                    >
                      {copy.collection.previousPage}
                    </button>

                    {paginationItems.map((item) =>
                      item.type === "ellipsis" ? (
                        <span
                          key={item.key}
                          className="workspace-collection-pagination-ellipsis"
                          aria-label={copy.collection.ellipsisLabel}
                          data-testid={`workspace-pagination-${item.key}`}
                        >
                          …
                        </span>
                      ) : (
                        <button
                          key={item.page}
                          className={`btn workspace-page-button ${
                            item.isCurrent ? "btn-primary" : ""
                          }`}
                          type="button"
                          aria-current={item.isCurrent ? "page" : undefined}
                          aria-label={copy.getCollectionPageButtonAriaLabel(
                            item.page,
                          )}
                          onClick={() => setCurrentPage(item.page)}
                          data-testid={`workspace-page-button-${item.page}`}
                        >
                          {item.page}
                        </button>
                      ),
                    )}

                    <button
                      className="btn"
                      type="button"
                      onClick={() =>
                        setCurrentPage((page) =>
                          Math.min(paginatedProjects.pageCount, page + 1),
                        )
                      }
                      disabled={
                        paginatedProjects.currentPage >= paginatedProjects.pageCount
                      }
                      data-testid="workspace-next-page"
                    >
                      {copy.collection.nextPage}
                    </button>
                  </nav>

                  {paginatedProjects.pageCount > 1 ? (
                    <div className="field workspace-collection-select-field">
                      <label htmlFor="workspace-page-jump">
                        {copy.collection.jumpLabel}
                      </label>
                      <select
                        id="workspace-page-jump"
                        value={String(paginatedProjects.currentPage)}
                        onChange={(event) =>
                          setCurrentPage(Number.parseInt(event.target.value, 10))
                        }
                        aria-label={copy.collection.jumpAriaLabel}
                        data-testid="workspace-page-jump"
                      >
                        {pageJumpOptions.map((page) => (
                          <option key={page} value={page}>
                            {page}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
