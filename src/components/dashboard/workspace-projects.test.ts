import { describe, expect, it } from "vitest";
import ptBRMessages from "@/messages/pt-BR.json";
import { createDashboardCopy } from "./dashboard-copy";
import {
  buildWorkspacePaginationItems,
  buildProjectAssistantHref,
  filterAndSortProjects,
  paginateProjects,
  sanitizeWorkspaceCollectionPageSize,
  type DashboardProject,
} from "./workspace-projects";

const sampleProjects: DashboardProject[] = [
  {
    id: "0f96c9ec-23dd-4ec4-94ef-2714574c35cb",
    slug: "onboarding-zulu",
    name: "Zulu",
    description: "Fluxo de onboarding",
    template: "graph",
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-03T10:00:00.000Z",
    selectedDiagramType: "flow",
    hasInitialSnapshot: true,
    snapshotVersionCount: 2,
  },
  {
    id: "40730664-8c84-4be6-aa8b-a23c7dc998e5",
    slug: "onboarding-alpha",
    name: "Alpha",
    description: "Mapa raiz",
    template: "sitemap",
    createdAt: "2026-03-02T10:00:00.000Z",
    updatedAt: "2026-03-04T10:00:00.000Z",
    selectedDiagramType: undefined,
    hasInitialSnapshot: false,
    snapshotVersionCount: 0,
  },
  {
    id: "35a5d2b8-0763-4e39-b4cb-057ad4d6bc6f",
    slug: "onboarding-beta",
    name: "Beta",
    description: "Mapeamento entidade",
    template: "erd",
    createdAt: "2026-03-05T10:00:00.000Z",
    updatedAt: "2026-03-05T10:00:00.000Z",
    selectedDiagramType: "tree",
    hasInitialSnapshot: true,
    snapshotVersionCount: 1,
  },
];

const dashboardCopy = createDashboardCopy(ptBRMessages.Dashboard, "pt-BR");

describe("workspace-projects", () => {
  it("filters snapshot pendente + tipo indefinido", () => {
    const result = filterAndSortProjects(
      sampleProjects,
      {
        searchTerm: "",
        diagramFilter: "undefined",
        templateFilter: "all",
        snapshotFilter: "pending",
        updatedFilter: "all",
        sortOption: "updated-desc",
        workspaceMode: "operational",
      },
      dashboardCopy,
    );

    expect(result.map((project) => project.name)).toEqual(["Alpha"]);
  });

  it("applies sort by name asc", () => {
    const result = filterAndSortProjects(
      sampleProjects,
      {
        searchTerm: "",
        diagramFilter: "all",
        templateFilter: "all",
        snapshotFilter: "all",
        updatedFilter: "all",
        sortOption: "name-asc",
        workspaceMode: "operational",
      },
      dashboardCopy,
    );

    expect(result.map((project) => project.name)).toEqual([
      "Alpha",
      "Beta",
      "Zulu",
    ]);
  });

  it("searches technical legacy label when workspace mode is technical", () => {
    const result = filterAndSortProjects(
      sampleProjects,
      {
        searchTerm: "graph",
        diagramFilter: "all",
        templateFilter: "all",
        snapshotFilter: "all",
        updatedFilter: "all",
        sortOption: "name-asc",
        workspaceMode: "technical",
      },
      dashboardCopy,
    );

    expect(result.map((project) => project.name)).toEqual(["Zulu"]);
  });

  it("returns operational and technical template labels", () => {
    expect(dashboardCopy.getTemplateLabel("graph", "operational")).toBe(
      "Estrutura livre",
    );
    expect(dashboardCopy.getTemplateLabel("graph", "technical")).toBe(
      "graph (legado)",
    );
  });

  it("paginates the collection instead of returning every project by default", () => {
    const manyProjects = Array.from({ length: 38 }, (_, index) => ({
      ...sampleProjects[index % sampleProjects.length],
      id: `project-${index + 1}`,
      slug: `project-${index + 1}`,
      name: `Projeto ${String(index + 1).padStart(2, "0")}`,
    }));

    const page = paginateProjects(manyProjects, { page: 1, pageSize: 25 });

    expect(page.projects).toHaveLength(25);
    expect(page.rangeStart).toBe(1);
    expect(page.rangeEnd).toBe(25);
    expect(page.pageCount).toBe(2);
    expect(page.projects.at(-1)?.name).toBe("Projeto 25");
  });

  it("clamps pagination when the requested page exceeds the filtered result", () => {
    const page = paginateProjects(sampleProjects, { page: 9, pageSize: 2 });

    expect(page.currentPage).toBe(2);
    expect(page.pageCount).toBe(2);
    expect(page.projects.map((project) => project.name)).toEqual(["Beta"]);
  });

  it("filters the collection by recent activity windows", () => {
    const result = filterAndSortProjects(
      sampleProjects,
      {
        searchTerm: "",
        diagramFilter: "all",
        templateFilter: "all",
        snapshotFilter: "all",
        updatedFilter: "last-7-days",
        sortOption: "updated-desc",
        workspaceMode: "operational",
        referenceTimestamp: Date.parse("2026-03-06T12:00:00.000Z"),
      },
      dashboardCopy,
    );

    expect(result.map((project) => project.name)).toEqual(["Beta", "Alpha", "Zulu"]);

    const onlyToday = filterAndSortProjects(
      sampleProjects,
      {
        searchTerm: "",
        diagramFilter: "all",
        templateFilter: "all",
        snapshotFilter: "all",
        updatedFilter: "today",
        sortOption: "updated-desc",
        workspaceMode: "operational",
        referenceTimestamp: Date.parse("2026-03-05T12:00:00.000Z"),
      },
      dashboardCopy,
    );

    expect(onlyToday.map((project) => project.name)).toEqual(["Beta"]);
  });

  it("builds numbered pagination items with ellipsis for long collections", () => {
    expect(
      buildWorkspacePaginationItems({
        currentPage: 5,
        pageCount: 10,
      }),
    ).toEqual([
      { type: "page", page: 1, isCurrent: false },
      { type: "ellipsis", key: "ellipsis-1-4" },
      { type: "page", page: 4, isCurrent: false },
      { type: "page", page: 5, isCurrent: true },
      { type: "page", page: 6, isCurrent: false },
      { type: "ellipsis", key: "ellipsis-6-10" },
      { type: "page", page: 10, isCurrent: false },
    ]);
  });

  it("accepts only supported page size preferences", () => {
    expect(sanitizeWorkspaceCollectionPageSize(25)).toBe(25);
    expect(sanitizeWorkspaceCollectionPageSize("50")).toBe(50);
    expect(sanitizeWorkspaceCollectionPageSize(24)).toBe(25);
    expect(sanitizeWorkspaceCollectionPageSize(null)).toBe(25);
  });

  it("builds assistant links on top of the real /create flow", () => {
    expect(
      buildProjectAssistantHref("58f3ca26-085e-4237-80d9-adcc42f7142b"),
    ).toBe("/create?fromProjectId=58f3ca26-085e-4237-80d9-adcc42f7142b");
  });
});
