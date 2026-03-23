"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/src/i18n/navigation";
import { EmptyState } from "@/src/components/ui/empty-state";
import { PageHeader } from "@/src/components/ui/page-header";
import { useDashboardCopy } from "./dashboard-copy";
import { NewProjectDrawer } from "./new-project-drawer";
import { ProjectsGrid } from "./projects-grid";
import { ProjectsList } from "./projects-list";
import { WorkspaceToolbar } from "./workspace-toolbar";
import {
  CARD_HIGHLIGHT_MS,
  SEARCH_DEBOUNCE_MS,
  filterAndSortProjects,
  type DashboardProject,
  type DashboardWorkspace,
  type DiagramFilter,
  type InitialDiagramChoice,
  type SnapshotFilter,
  type SortOption,
  type TemplateFilter,
  type WorkspaceDensity,
  type WorkspaceMode,
  type WorkspaceViewMode,
} from "./workspace-projects";

type DashboardProjectsPanelProps = {
  workspace: DashboardWorkspace;
  projects: DashboardProject[];
};

const WORKSPACE_VIEW_STORAGE_KEY_PREFIX = "mapia-workspace-view";
const WORKSPACE_DENSITY_STORAGE_KEY_PREFIX = "mapia-workspace-density";
const WORKSPACE_MODE_STORAGE_KEY_PREFIX = "mapia-workspace-mode";

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

function validateProjectName(
  name: string,
  copy: ReturnType<typeof useDashboardCopy>,
) {
  const trimmed = name.trim();

  if (!trimmed) {
    return copy.messages.nameRequired;
  }

  if (trimmed.length < 3) {
    return copy.messages.nameTooShort;
  }

  if (trimmed.length > 120) {
    return copy.messages.nameTooLong;
  }

  return null;
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
  const router = useRouter();
  const drawerNameInputRef = useRef<HTMLInputElement | null>(null);
  const newProjectButtonRef = useRef<HTMLButtonElement | null>(null);
  const wasDrawerOpenRef = useRef(false);
  const workspaceViewStorageKey = `${WORKSPACE_VIEW_STORAGE_KEY_PREFIX}:${workspace.id}`;
  const workspaceDensityStorageKey = `${WORKSPACE_DENSITY_STORAGE_KEY_PREFIX}:${workspace.id}`;
  const workspaceModeStorageKey = `${WORKSPACE_MODE_STORAGE_KEY_PREFIX}:${workspace.id}`;

  const [searchTerm, setSearchTerm] = useState("");
  const [diagramFilter, setDiagramFilter] = useState<DiagramFilter>("all");
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>("all");
  const [snapshotFilter, setSnapshotFilter] = useState<SnapshotFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("updated-desc");
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>("list");
  const [density, setDensity] = useState<WorkspaceDensity>("compact");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("operational");
  const [hasHydratedPreferences, setHasHydratedPreferences] = useState(false);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [initialDiagramType, setInitialDiagramType] =
    useState<InitialDiagramChoice>("wizard");
  const [template, setTemplate] = useState<DashboardProject["template"]>("graph");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workspaceMessage, setWorkspaceMessage] = useState<string | null>(null);
  const [recentlyCreatedProjectId, setRecentlyCreatedProjectId] = useState<string | null>(
    null,
  );
  const [highlightedProjectId, setHighlightedProjectId] = useState<string | null>(null);

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
    } catch {
      setViewMode("list");
      setDensity("compact");
      setWorkspaceMode("operational");
    } finally {
      setHasHydratedPreferences(true);
    }
  }, [workspaceDensityStorageKey, workspaceModeStorageKey, workspaceViewStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasHydratedPreferences) {
      return;
    }

    try {
      window.localStorage.setItem(workspaceViewStorageKey, viewMode);
      window.localStorage.setItem(workspaceDensityStorageKey, density);
      window.localStorage.setItem(workspaceModeStorageKey, workspaceMode);
    } catch {
      // Ignora indisponibilidade do localStorage.
    }
  }, [
    density,
    hasHydratedPreferences,
    viewMode,
    workspaceDensityStorageKey,
    workspaceMode,
    workspaceModeStorageKey,
    workspaceViewStorageKey,
  ]);

  useEffect(() => {
    if (isDrawerOpen) {
      wasDrawerOpenRef.current = true;
      return;
    }

    if (!isDrawerOpen && wasDrawerOpenRef.current) {
      wasDrawerOpenRef.current = false;
      newProjectButtonRef.current?.focus();
    }
  }, [isDrawerOpen]);

  useEffect(() => {
    if (!recentlyCreatedProjectId) {
      return;
    }

    const createdProjectExists = projects.some(
      (project) => project.id === recentlyCreatedProjectId,
    );

    if (!createdProjectExists) {
      return;
    }

    setRecentlyCreatedProjectId(null);
    setHighlightedProjectId(recentlyCreatedProjectId);

    const projectCard = document.querySelector<HTMLElement>(
      `[data-project-id="${recentlyCreatedProjectId}"]`,
    );
    projectCard?.scrollIntoView({ behavior: "smooth", block: "center" });

    const timer = window.setTimeout(() => {
      setHighlightedProjectId((current) =>
        current === recentlyCreatedProjectId ? null : current,
      );
    }, CARD_HIGHLIGHT_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [projects, recentlyCreatedProjectId]);

  const filteredProjects = useMemo(
    () =>
      filterAndSortProjects(projects, {
        searchTerm: debouncedSearchTerm,
        diagramFilter,
        templateFilter,
        snapshotFilter,
        sortOption,
        workspaceMode,
      }, copy),
    [
      copy,
      debouncedSearchTerm,
      diagramFilter,
      projects,
      snapshotFilter,
      sortOption,
      templateFilter,
      workspaceMode,
    ],
  );

  const hasActiveFilters =
    debouncedSearchTerm.trim().length > 0 ||
    diagramFilter !== "all" ||
    templateFilter !== "all" ||
    snapshotFilter !== "all" ||
    sortOption !== "updated-desc";

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

  function closeDrawerAndResetForm() {
    setIsDrawerOpen(false);
    setName("");
    setDescription("");
    setInitialDiagramType("wizard");
    setTemplate("graph");
    setErrorMessage(null);
  }

  function clearFilters() {
    setSearchTerm("");
    setDiagramFilter("all");
    setTemplateFilter("all");
    setSnapshotFilter("all");
    setSortOption("updated-desc");
  }

  async function handleCopyTechnicalId(project: DashboardProject) {
    try {
      await copyTextToClipboard(project.id);
      setWorkspaceMessage(copy.getCopiedTechnicalIdMessage(project.id));
    } catch {
      setWorkspaceMessage(copy.messages.copyTechnicalIdError);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const validationError = validateProjectName(trimmedName, copy);

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          name: trimmedName,
          description: trimmedDescription,
          template,
        }),
      });

      const payload = (await response.json()) as {
        data?: {
          project?: {
            id?: string;
            name?: string;
          };
        };
        message?: string;
      };

      if (!response.ok) {
        setErrorMessage(payload.message ?? copy.messages.createError);
        return;
      }

      setWorkspaceMessage(
        copy.getCreateSuccessMessage(payload.data?.project?.name ?? trimmedName),
      );
      setRecentlyCreatedProjectId(payload.data?.project?.id ?? null);
      closeDrawerAndResetForm();
      router.refresh();
    } catch {
      setErrorMessage(copy.messages.networkError);
    } finally {
      setIsSubmitting(false);
    }
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
          <div className="grid-tiles workspace-stats-grid">
            <div className="tile">
              <h3>{copy.stats.projects}</h3>
              <p>{workspaceStats.total}</p>
            </div>
            <div className="tile">
              <h3>{copy.stats.generated}</h3>
              <p>{workspaceStats.generated}</p>
            </div>
            <div className="tile">
              <h3>{copy.stats.pending}</h3>
              <p>{workspaceStats.pending}</p>
            </div>
          </div>

          <WorkspaceToolbar
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            onClearSearch={() => setSearchTerm("")}
            diagramFilter={diagramFilter}
            onDiagramFilterChange={setDiagramFilter}
            templateFilter={templateFilter}
            onTemplateFilterChange={setTemplateFilter}
            snapshotFilter={snapshotFilter}
            onSnapshotFilterChange={setSnapshotFilter}
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
            onOpenNewProject={() => {
              setWorkspaceMessage(null);
              setErrorMessage(null);
              router.push("/create");
            }}
            newProjectButtonRef={newProjectButtonRef}
            filteredCount={filteredProjects.length}
            totalCount={projects.length}
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
        <div className="panel-body">
          {filteredProjects.length === 0 ? (
            projects.length === 0 ? (
              <EmptyState
                title={copy.emptyStates.noneCreatedTitle}
                description={copy.emptyStates.noneCreatedDescription}
                dataTestId="dashboard-empty-projects"
              />
            ) : (
              <EmptyState
                title={copy.emptyStates.noneFilteredTitle}
                description={copy.emptyStates.noneFilteredDescription}
                dataTestId="dashboard-empty-filtered-projects"
              />
            )
          ) : viewMode === "grid" ? (
            <ProjectsGrid
              projects={filteredProjects}
              density={density}
              workspaceMode={workspaceMode}
              highlightedProjectId={highlightedProjectId}
              onCopyTechnicalId={handleCopyTechnicalId}
              copy={copy}
            />
          ) : (
            <ProjectsList
              projects={filteredProjects}
              density={density}
              workspaceMode={workspaceMode}
              highlightedProjectId={highlightedProjectId}
              onOpenProject={(projectId) => router.push(`/editor?projectId=${projectId}`)}
              onCopyTechnicalId={handleCopyTechnicalId}
              copy={copy}
            />
          )}
        </div>
      </section>

      <NewProjectDrawer
        isOpen={isDrawerOpen}
        isSubmitting={isSubmitting}
        name={name}
        description={description}
        initialDiagramType={initialDiagramType}
        template={template}
        workspaceMode={workspaceMode}
        errorMessage={errorMessage}
        nameInputRef={drawerNameInputRef}
        onClose={closeDrawerAndResetForm}
        onSubmit={handleSubmit}
        onNameChange={setName}
        onDescriptionChange={setDescription}
        onInitialDiagramTypeChange={setInitialDiagramType}
        onTemplateChange={setTemplate}
        copy={copy}
      />
    </>
  );
}
