import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ptBRMessages from "@/messages/pt-BR.json";
import { DashboardProjectsPanel } from "./dashboard-projects-panel";

vi.mock("@/src/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    React.createElement("a", { ...props, href }, children),
}));

vi.mock("./dashboard-copy", async () => {
  const actual = await vi.importActual<typeof import("./dashboard-copy")>(
    "./dashboard-copy",
  );

  return {
    ...actual,
    useDashboardCopy: () => actual.createDashboardCopy(ptBRMessages.Dashboard, "pt-BR"),
  };
});

function createProjects(total: number) {
  return Array.from({ length: total }, (_, index) => ({
    id: `project-${index + 1}`,
    slug: `project-${index + 1}`,
    name: `Projeto ${String(index + 1).padStart(2, "0")}`,
    description: `Descricao ${index + 1}`,
    template: index % 2 === 0 ? "graph" : "sitemap",
    createdAt: `2026-03-${String((index % 28) + 1).padStart(2, "0")}T10:00:00.000Z`,
    updatedAt: `2026-03-${String((index % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
    selectedDiagramType: index % 3 === 0 ? "flow" : index % 3 === 1 ? "tree" : undefined,
    hasInitialSnapshot: index % 4 !== 0,
    snapshotVersionCount: index % 4 === 0 ? 0 : 1,
  })) satisfies React.ComponentProps<typeof DashboardProjectsPanel>["projects"];
}

describe("DashboardProjectsPanel", () => {
  it("renders the collection in list mode by default and paginates the first screen", () => {
    const markup = renderToStaticMarkup(
      React.createElement(DashboardProjectsPanel, {
        workspace: {
          id: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          slug: "workspace-principal",
          name: "Workspace Principal",
        },
        projects: createProjects(30),
      }),
    );

    const renderedCards =
      markup.match(/data-testid="dashboard-project-card-[^"]+"/g)?.length ?? 0;

    expect(markup).toContain("data-view=\"list\"");
    expect(renderedCards).toBe(25);
    expect(markup).toContain("href=\"/create\"");
    expect(markup).toContain("data-testid=\"workspace-collection-pagination\"");
    expect(markup).toContain("Mostrando 1-25 de 30");
    expect(markup).toContain("data-testid=\"workspace-page-size\"");
    expect(markup).toContain("data-testid=\"workspace-page-jump\"");
    expect(markup).toContain("data-testid=\"workspace-page-button-2\"");
    expect(markup).not.toContain("new-project-drawer");
  });

  it("renders the empty state for a workspace with no projects", () => {
    const markup = renderToStaticMarkup(
      React.createElement(DashboardProjectsPanel, {
        workspace: {
          id: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          slug: "workspace-principal",
          name: "Workspace Principal",
        },
        projects: [],
      }),
    );

    expect(markup).toContain("Colecao vazia");
    expect(markup).toContain("data-testid=\"dashboard-empty-projects\"");
    expect(markup).toContain("href=\"/create\"");
  });
});
