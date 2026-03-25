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

export type DiagramFilter = "all" | "tree" | "flow" | "mindmap" | "undefined";
export type SnapshotFilter = "all" | "pending" | "generated";
export type UpdatedAtFilter =
  | "all"
  | "today"
  | "last-7-days"
  | "last-30-days";
export type SortOption = "name-asc" | "updated-desc" | "created-desc";
export type WorkspaceViewMode = "grid" | "list";
export type WorkspaceDensity = "compact" | "comfortable";
export type WorkspaceMode = "operational" | "technical";
export type TemplateFilter = "all" | DashboardProject["template"];
export type WorkspaceCollectionPageSize = 25 | 50 | 100;
export type WorkspaceCollectionPage = {
  currentPage: number;
  pageCount: number;
  pageSize: number;
  rangeStart: number;
  rangeEnd: number;
  projects: DashboardProject[];
};
export type WorkspacePaginationItem =
  | {
      type: "page";
      page: number;
      isCurrent: boolean;
    }
  | {
      type: "ellipsis";
      key: string;
    };

export type WorkspaceFilters = {
  searchTerm: string;
  diagramFilter: DiagramFilter;
  templateFilter: TemplateFilter;
  snapshotFilter: SnapshotFilter;
  updatedFilter: UpdatedAtFilter;
  sortOption: SortOption;
  workspaceMode: WorkspaceMode;
  referenceTimestamp?: number;
};

type LegacyTemplateOption = {
  value: DashboardProject["template"];
};

export const SEARCH_DEBOUNCE_MS = 250;
export const DEFAULT_WORKSPACE_VIEW_MODE: WorkspaceViewMode = "list";
export const DEFAULT_WORKSPACE_DENSITY: WorkspaceDensity = "compact";
export const DEFAULT_WORKSPACE_MODE: WorkspaceMode = "operational";
export const WORKSPACE_COLLECTION_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_WORKSPACE_COLLECTION_PAGE_SIZE: WorkspaceCollectionPageSize =
  WORKSPACE_COLLECTION_PAGE_SIZE_OPTIONS[0];

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

export function buildProjectAssistantHref(projectId: string) {
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

export function getProjectActivityTimestamp(project: DashboardProject) {
  return (
    parseDateToTimestamp(project.updatedAt) ??
    parseDateToTimestamp(project.createdAt)
  );
}

function isProjectWithinUpdatedFilter(
  project: DashboardProject,
  updatedFilter: UpdatedAtFilter,
  referenceTimestamp = Date.now(),
) {
  if (updatedFilter === "all") {
    return true;
  }

  const activityTimestamp = getProjectActivityTimestamp(project);
  if (activityTimestamp === null) {
    return false;
  }

  if (updatedFilter === "today") {
    const referenceDate = new Date(referenceTimestamp);
    referenceDate.setHours(0, 0, 0, 0);
    return activityTimestamp >= referenceDate.getTime();
  }

  if (updatedFilter === "last-7-days") {
    return activityTimestamp >= referenceTimestamp - 7 * 24 * 60 * 60 * 1000;
  }

  if (updatedFilter === "last-30-days") {
    return activityTimestamp >= referenceTimestamp - 30 * 24 * 60 * 60 * 1000;
  }

  return true;
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
  const referenceTimestamp = filters.referenceTimestamp ?? Date.now();
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

    if (
      !isProjectWithinUpdatedFilter(
        project,
        filters.updatedFilter,
        referenceTimestamp,
      )
    ) {
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

export function sanitizeWorkspaceCollectionPageSize(
  value: number | string | null | undefined,
) {
  const parsedValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return WORKSPACE_COLLECTION_PAGE_SIZE_OPTIONS.includes(
    parsedValue as WorkspaceCollectionPageSize,
  )
    ? (parsedValue as WorkspaceCollectionPageSize)
    : DEFAULT_WORKSPACE_COLLECTION_PAGE_SIZE;
}

export function buildWorkspacePaginationItems(input: {
  currentPage: number;
  pageCount: number;
  siblingCount?: number;
  boundaryCount?: number;
}): WorkspacePaginationItem[] {
  const pageCount = Math.max(1, Math.trunc(input.pageCount));
  const currentPage = Math.min(
    Math.max(1, Math.trunc(input.currentPage)),
    pageCount,
  );
  const siblingCount = Math.max(0, Math.trunc(input.siblingCount ?? 1));
  const boundaryCount = Math.max(1, Math.trunc(input.boundaryCount ?? 1));
  const pages = new Set<number>();

  for (let page = 1; page <= Math.min(boundaryCount, pageCount); page += 1) {
    pages.add(page);
  }

  for (
    let page = Math.max(1, pageCount - boundaryCount + 1);
    page <= pageCount;
    page += 1
  ) {
    pages.add(page);
  }

  for (
    let page = Math.max(1, currentPage - siblingCount);
    page <= Math.min(pageCount, currentPage + siblingCount);
    page += 1
  ) {
    pages.add(page);
  }

  if (currentPage <= boundaryCount + siblingCount + 2) {
    for (
      let page = 1;
      page <= Math.min(pageCount, boundaryCount + siblingCount * 2 + 3);
      page += 1
    ) {
      pages.add(page);
    }
  }

  if (currentPage >= pageCount - boundaryCount - siblingCount - 1) {
    for (
      let page = Math.max(1, pageCount - (boundaryCount + siblingCount * 2 + 2));
      page <= pageCount;
      page += 1
    ) {
      pages.add(page);
    }
  }

  const sortedPages = [...pages].sort((pageA, pageB) => pageA - pageB);
  const items: WorkspacePaginationItem[] = [];

  sortedPages.forEach((page, index) => {
    const previousPage = sortedPages[index - 1];
    if (previousPage && page - previousPage > 1) {
      items.push({
        type: "ellipsis",
        key: `ellipsis-${previousPage}-${page}`,
      });
    }

    items.push({
      type: "page",
      page,
      isCurrent: page === currentPage,
    });
  });

  return items;
}

export function paginateProjects(
  projects: DashboardProject[],
  input: {
    page: number;
    pageSize: number;
  },
): WorkspaceCollectionPage {
  const totalProjects = projects.length;
  const safePageSize = Math.max(1, Math.trunc(input.pageSize));
  const pageCount = Math.max(1, Math.ceil(totalProjects / safePageSize));
  const currentPage = Math.min(Math.max(1, Math.trunc(input.page)), pageCount);

  if (totalProjects === 0) {
    return {
      currentPage: 1,
      pageCount: 1,
      pageSize: safePageSize,
      rangeStart: 0,
      rangeEnd: 0,
      projects: [],
    };
  }

  const startIndex = (currentPage - 1) * safePageSize;
  const endIndex = Math.min(startIndex + safePageSize, totalProjects);

  return {
    currentPage,
    pageCount,
    pageSize: safePageSize,
    rangeStart: startIndex + 1,
    rangeEnd: endIndex,
    projects: projects.slice(startIndex, endIndex),
  };
}
