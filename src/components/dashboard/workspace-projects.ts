"use client";

import type { DashboardCopy } from "./dashboard-copy";

export type DashboardWorkspace = {
  id: string;
  slug: string;
  name: string;
  ownerIdentity?: string;
};

export type DashboardProject = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  template: "sitemap" | "flowchart" | "erd" | "graph";
  createdAt?: string;
  updatedAt?: string;
  selectedDiagramType?: "tree" | "flow" | "mindmap";
  hasInitialSnapshot: boolean;
  snapshotVersionCount: number;
};

export type InitialDiagramChoice = "wizard" | "tree" | "flow" | "mindmap";
export type DiagramFilter = "all" | "tree" | "flow" | "mindmap" | "undefined";
export type SnapshotFilter = "all" | "pending" | "generated";
export type SortOption = "name-asc" | "updated-desc" | "created-desc";
export type WorkspaceViewMode = "grid" | "list";
export type WorkspaceDensity = "compact" | "comfortable";
export type WorkspaceMode = "operational" | "technical";
export type TemplateFilter = "all" | DashboardProject["template"];

export type WorkspaceFilters = {
  searchTerm: string;
  diagramFilter: DiagramFilter;
  templateFilter: TemplateFilter;
  snapshotFilter: SnapshotFilter;
  sortOption: SortOption;
  workspaceMode: WorkspaceMode;
};

type LegacyTemplateOption = {
  value: DashboardProject["template"];
};

export const SEARCH_DEBOUNCE_MS = 250;
export const CARD_HIGHLIGHT_MS = 4_000;

export const legacyTemplateOptions: LegacyTemplateOption[] = [
  { value: "graph" },
  { value: "sitemap" },
  { value: "flowchart" },
  { value: "erd" },
];

export function getSnapshotStatusTone(hasInitialSnapshot: boolean) {
  return hasInitialSnapshot ? "success" : "warning";
}

export function buildCreationAssistantHref(projectId?: string) {
  const params = new URLSearchParams({
    ...(projectId ? { fromProjectId: projectId } : {}),
  });

  const query = params.toString();
  return query.length > 0 ? `/create?${query}` : "/create";
}

export function buildWizardHref(projectId: string, _initialDiagramType: InitialDiagramChoice) {
  return buildCreationAssistantHref(projectId);
}

export function buildEditorHref(projectId: string) {
  return `/editor?projectId=${projectId}`;
}

export function buildVersionsHref(projectId: string) {
  return `/editor?projectId=${projectId}#versoes`;
}

export function parseDateToTimestamp(dateInput: string | undefined) {
  if (!dateInput) {
    return null;
  }

  const timestamp = Date.parse(dateInput);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function buildSearchIndex(
  project: DashboardProject,
  workspaceMode: WorkspaceMode,
  copy: DashboardCopy,
) {
  return [
    project.name,
    project.slug,
    project.description ?? "",
    copy.getDiagramTypeLabel(project.selectedDiagramType),
    copy.getTemplateLabel(project.template, workspaceMode),
    project.template,
  ]
    .join(" ")
    .toLowerCase();
}

export function filterAndSortProjects(
  projects: DashboardProject[],
  filters: WorkspaceFilters,
  copy: DashboardCopy,
) {
  const normalizedSearchTerm = filters.searchTerm.trim().toLowerCase();
  const filtered = projects.filter((project) => {
    if (normalizedSearchTerm.length > 0) {
      const searchableText = buildSearchIndex(project, filters.workspaceMode, copy);
      if (!searchableText.includes(normalizedSearchTerm)) {
        return false;
      }
    }

    if (filters.diagramFilter !== "all") {
      if (
        filters.diagramFilter === "undefined" &&
        project.selectedDiagramType !== undefined
      ) {
        return false;
      }

      if (
        filters.diagramFilter !== "undefined" &&
        project.selectedDiagramType !== filters.diagramFilter
      ) {
        return false;
      }
    }

    if (
      filters.templateFilter !== "all" &&
      project.template !== filters.templateFilter
    ) {
      return false;
    }

    if (filters.snapshotFilter === "generated" && !project.hasInitialSnapshot) {
      return false;
    }

    if (filters.snapshotFilter === "pending" && project.hasInitialSnapshot) {
      return false;
    }

    return true;
  });

  filtered.sort((projectA, projectB) => {
    if (filters.sortOption === "name-asc") {
      return projectA.name.localeCompare(projectB.name, copy.locale, {
        sensitivity: "base",
      });
    }

    if (filters.sortOption === "updated-desc") {
      const projectAUpdated =
        parseDateToTimestamp(projectA.updatedAt) ??
        parseDateToTimestamp(projectA.createdAt) ??
        0;
      const projectBUpdated =
        parseDateToTimestamp(projectB.updatedAt) ??
        parseDateToTimestamp(projectB.createdAt) ??
        0;

      if (projectAUpdated !== projectBUpdated) {
        return projectBUpdated - projectAUpdated;
      }
    }

    if (filters.sortOption === "created-desc") {
      const projectACreated =
        parseDateToTimestamp(projectA.createdAt) ??
        parseDateToTimestamp(projectA.updatedAt) ??
        0;
      const projectBCreated =
        parseDateToTimestamp(projectB.createdAt) ??
        parseDateToTimestamp(projectB.updatedAt) ??
        0;

      if (projectACreated !== projectBCreated) {
        return projectBCreated - projectACreated;
      }
    }

    return projectA.name.localeCompare(projectB.name, copy.locale, {
      sensitivity: "base",
    });
  });

  return filtered;
}
