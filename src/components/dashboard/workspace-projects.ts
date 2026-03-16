"use client";

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
  operationalLabel: string;
  technicalLabel: string;
  description: string;
};

export const SEARCH_DEBOUNCE_MS = 250;
export const CARD_HIGHLIGHT_MS = 4_000;

export const diagramTypeOptions: Array<{
  value: InitialDiagramChoice;
  label: string;
  description: string;
}> = [
  {
    value: "wizard",
    label: "Decidir no Assistente",
    description: "Defina o tipo durante o fluxo guiado de criacao.",
  },
  {
    value: "tree",
    label: "Hierarquia",
    description: "Estruturas com niveis e relacao pai-filho.",
  },
  {
    value: "flow",
    label: "Processo",
    description: "Etapas de processo com sequencia.",
  },
  {
    value: "mindmap",
    label: "Mapa mental",
    description: "Exploracao radial de ideias e temas.",
  },
];

export const legacyTemplateOptions: LegacyTemplateOption[] = [
  {
    value: "graph",
    operationalLabel: "Estrutura livre",
    technicalLabel: "graph (legado)",
    description: "Estrutura generica para compatibilidade.",
  },
  {
    value: "sitemap",
    operationalLabel: "Mapa de navegacao",
    technicalLabel: "sitemap (legado)",
    description: "Navegacao de paginas e secoes.",
  },
  {
    value: "flowchart",
    operationalLabel: "Fluxograma",
    technicalLabel: "flowchart (legado)",
    description: "Fluxograma classico de processos.",
  },
  {
    value: "erd",
    operationalLabel: "Modelo de dados",
    technicalLabel: "erd (legado)",
    description: "Relacionamento de entidades e dados.",
  },
];

export function getDiagramTypeLabel(diagramType: DashboardProject["selectedDiagramType"]) {
  if (diagramType === "tree") {
    return "Hierarquia";
  }

  if (diagramType === "flow") {
    return "Processo";
  }

  if (diagramType === "mindmap") {
    return "Mapa mental";
  }

  return "Definir durante a criacao";
}

export function getTemplateLabel(
  template: DashboardProject["template"],
  workspaceMode: WorkspaceMode,
) {
  const found = legacyTemplateOptions.find((option) => option.value === template);
  if (!found) {
    return template;
  }

  return workspaceMode === "technical"
    ? found.technicalLabel
    : found.operationalLabel;
}

export function getTemplateDescription(template: DashboardProject["template"]) {
  return (
    legacyTemplateOptions.find((option) => option.value === template)?.description ??
    "Template legado para compatibilidade."
  );
}

export function getSnapshotStatusLabel(hasInitialSnapshot: boolean) {
  return hasInitialSnapshot ? "Snapshot gerado" : "Snapshot pendente";
}

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

export function formatDateLabel(dateInput: string | undefined) {
  const timestamp = parseDateToTimestamp(dateInput);
  if (timestamp === null) {
    return "—";
  }

  return new Date(timestamp).toLocaleDateString("pt-BR");
}

function buildSearchIndex(project: DashboardProject, workspaceMode: WorkspaceMode) {
  return [
    project.name,
    project.slug,
    project.description ?? "",
    getDiagramTypeLabel(project.selectedDiagramType),
    getTemplateLabel(project.template, workspaceMode),
    project.template,
  ]
    .join(" ")
    .toLowerCase();
}

export function filterAndSortProjects(
  projects: DashboardProject[],
  filters: WorkspaceFilters,
) {
  const normalizedSearchTerm = filters.searchTerm.trim().toLowerCase();
  const filtered = projects.filter((project) => {
    if (normalizedSearchTerm.length > 0) {
      const searchableText = buildSearchIndex(project, filters.workspaceMode);
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
      return projectA.name.localeCompare(projectB.name, "pt-BR", {
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

    return projectA.name.localeCompare(projectB.name, "pt-BR", {
      sensitivity: "base",
    });
  });

  return filtered;
}
