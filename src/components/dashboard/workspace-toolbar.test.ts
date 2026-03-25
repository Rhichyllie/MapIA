import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ptBRMessages from "@/messages/pt-BR.json";
import { createDashboardCopy } from "./dashboard-copy";
import { WorkspaceToolbar } from "./workspace-toolbar";

vi.mock("@/src/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    React.createElement("a", { ...props, href }, children),
}));

const copy = createDashboardCopy(ptBRMessages.Dashboard, "pt-BR");

function renderToolbar(overrides?: Partial<React.ComponentProps<typeof WorkspaceToolbar>>) {
  return renderToStaticMarkup(
    React.createElement(WorkspaceToolbar, {
      workspaceId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
      searchTerm: "",
      onSearchTermChange: vi.fn(),
      onClearSearch: vi.fn(),
      diagramFilter: "all",
      onDiagramFilterChange: vi.fn(),
      templateFilter: "all",
      onTemplateFilterChange: vi.fn(),
      snapshotFilter: "all",
      onSnapshotFilterChange: vi.fn(),
      updatedFilter: "all",
      onUpdatedFilterChange: vi.fn(),
      sortOption: "updated-desc",
      onSortOptionChange: vi.fn(),
      viewMode: "list",
      onViewModeChange: vi.fn(),
      density: "compact",
      onDensityChange: vi.fn(),
      workspaceMode: "operational",
      onWorkspaceModeChange: vi.fn(),
      onClearFilters: vi.fn(),
      hasActiveFilters: false,
      activeRefinementCount: 0,
      isFiltersPanelOpen: false,
      onToggleFiltersPanel: vi.fn(),
      isPreferencesPanelOpen: false,
      onTogglePreferencesPanel: vi.fn(),
      newProjectHref: "/create",
      filteredCount: 24,
      totalCount: 120,
      collectionSummary: "120 projetos · 70 com mapa inicial · 50 pendentes",
      workspaceMessage: null,
      copy,
      ...overrides,
    }),
  );
}

describe("WorkspaceToolbar", () => {
  it("prioritizes search and the /create CTA while keeping secondary controls collapsed", () => {
    const markup = renderToolbar();

    expect(markup).toContain("data-testid=\"workspace-search\"");
    expect(markup).toContain("href=\"/create\"");
    expect(markup).toContain("Novo projeto");
    expect(markup).not.toContain("data-testid=\"workspace-filter-diagram\"");
    expect(markup).not.toContain("data-testid=\"workspace-view-toggle\"");
  });

  it("reveals filters and preferences only when their secondary panels are opened", () => {
    const markup = renderToolbar({
      isFiltersPanelOpen: true,
      isPreferencesPanelOpen: true,
      activeRefinementCount: 2,
      hasActiveFilters: true,
    });

    expect(markup).toContain("data-testid=\"workspace-filter-diagram\"");
    expect(markup).toContain("data-testid=\"workspace-filter-template\"");
    expect(markup).toContain("data-testid=\"workspace-filter-updated\"");
    expect(markup).toContain("data-testid=\"workspace-sort\"");
    expect(markup).toContain("data-testid=\"workspace-view-toggle\"");
    expect(markup).toContain("data-testid=\"workspace-density-toggle\"");
    expect(markup).toContain("data-testid=\"workspace-mode-toggle\"");
    expect(markup).toContain("2 ativo(s)");
  });
});
