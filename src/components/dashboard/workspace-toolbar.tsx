"use client";

import type { RefObject } from "react";
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
};

function getTemplateFilterLabel(
  template: DashboardProject["template"],
  workspaceMode: WorkspaceMode,
) {
  const option = legacyTemplateOptions.find((entry) => entry.value === template);
  if (!option) {
    return template;
  }

  return workspaceMode === "technical"
    ? option.technicalLabel
    : option.operationalLabel;
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
}: WorkspaceToolbarProps) {
  return (
    <div className="tile workspace-toolbar" data-testid="workspace-toolbar">
      <div className="workspace-toolbar-main">
        <div className="field workspace-search-field">
          <label htmlFor="workspace-search-input">Buscar</label>
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
              placeholder="Buscar por nome, descricao, tipo..."
              data-testid="workspace-search"
              aria-label="Buscar projeto"
            />
            <button
              className="btn workspace-search-clear-btn"
              type="button"
              onClick={onClearSearch}
              disabled={searchTerm.length === 0}
              aria-label="Limpar busca"
              data-testid="workspace-search-clear"
            >
              Limpar
            </button>
          </div>
        </div>

        <div className="field workspace-filter-field">
          <label htmlFor="workspace-filter-diagram">Tipo de diagrama</label>
          <select
            id="workspace-filter-diagram"
            value={diagramFilter}
            onChange={(event) => onDiagramFilterChange(event.target.value as DiagramFilter)}
            data-testid="workspace-filter-diagram"
          >
            <option value="all">Todos</option>
            <option value="tree">Hierarquia</option>
            <option value="flow">Processo</option>
            <option value="mindmap">Mapa mental</option>
            <option value="undefined">Definir durante a criacao</option>
          </select>
        </div>

        <div className="field workspace-filter-field">
          <label htmlFor="workspace-filter-template">
            {workspaceMode === "technical" ? "Template legado" : "Modelo"}
          </label>
          <select
            id="workspace-filter-template"
            value={templateFilter}
            onChange={(event) =>
              onTemplateFilterChange(event.target.value as TemplateFilter)
            }
            data-testid="workspace-filter-template"
          >
            <option value="all">Todos</option>
            {legacyTemplateOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {getTemplateFilterLabel(option.value, workspaceMode)}
              </option>
            ))}
          </select>
        </div>

        <div className="field workspace-filter-field">
          <label htmlFor="workspace-filter-snapshot">Status de snapshot</label>
          <select
            id="workspace-filter-snapshot"
            value={snapshotFilter}
            onChange={(event) =>
              onSnapshotFilterChange(event.target.value as SnapshotFilter)
            }
            data-testid="workspace-filter-snapshot"
          >
            <option value="all">Todos</option>
            <option value="generated">Gerado</option>
            <option value="pending">Pendente</option>
          </select>
        </div>

        <div className="field workspace-filter-field">
          <label htmlFor="workspace-sort">Ordenar por</label>
          <select
            id="workspace-sort"
            value={sortOption}
            onChange={(event) => onSortOptionChange(event.target.value as SortOption)}
            data-testid="workspace-sort"
          >
            <option value="name-asc">Nome (A-Z)</option>
            <option value="updated-desc">Atualizado (mais recente)</option>
            <option value="created-desc">Criado (mais recente)</option>
          </select>
        </div>
      </div>

      <div className="workspace-toolbar-actions">
        <div
          className="workspace-view-toggle"
          role="group"
          aria-label="Alternar visualizacao"
          data-testid="workspace-view-toggle"
        >
          <button
            className={`btn ${viewMode === "grid" ? "btn-primary" : ""}`}
            type="button"
            aria-pressed={viewMode === "grid"}
            onClick={() => onViewModeChange("grid")}
          >
            Grid
          </button>
          <button
            className={`btn ${viewMode === "list" ? "btn-primary" : ""}`}
            type="button"
            aria-pressed={viewMode === "list"}
            onClick={() => onViewModeChange("list")}
          >
            Lista
          </button>
        </div>

        <div
          className="workspace-view-toggle"
          role="group"
          aria-label="Densidade da visualizacao"
          data-testid="workspace-density-toggle"
        >
          <button
            className={`btn ${density === "compact" ? "btn-primary" : ""}`}
            type="button"
            aria-pressed={density === "compact"}
            onClick={() => onDensityChange("compact")}
          >
            Compacta
          </button>
          <button
            className={`btn ${density === "comfortable" ? "btn-primary" : ""}`}
            type="button"
            aria-pressed={density === "comfortable"}
            onClick={() => onDensityChange("comfortable")}
          >
            Confortavel
          </button>
        </div>

        <div
          className="workspace-view-toggle"
          role="group"
          aria-label="Modo do workspace"
          data-testid="workspace-mode-toggle"
        >
          <button
            className={`btn ${workspaceMode === "operational" ? "btn-primary" : ""}`}
            type="button"
            aria-pressed={workspaceMode === "operational"}
            onClick={() => onWorkspaceModeChange("operational")}
            data-testid="workspace-mode-operational"
          >
            Operacional
          </button>
          <button
            className={`btn ${workspaceMode === "technical" ? "btn-primary" : ""}`}
            type="button"
            aria-pressed={workspaceMode === "technical"}
            onClick={() => onWorkspaceModeChange("technical")}
            data-testid="workspace-mode-technical"
          >
            Tecnico
          </button>
        </div>

        <button
          className="btn"
          type="button"
          onClick={onClearFilters}
          disabled={!hasActiveFilters}
          data-testid="workspace-clear-filters"
        >
          Limpar filtros
        </button>

        <button
          ref={newProjectButtonRef}
          className="btn btn-primary"
          type="button"
          onClick={onOpenNewProject}
          data-testid="new-project-button"
        >
          Novo projeto
        </button>
      </div>

      <div className="row-actions row-actions-between workspace-toolbar-footer">
        <span className="helper" data-testid="workspace-project-counter">
          Exibindo {filteredCount} de {totalCount} projetos
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
