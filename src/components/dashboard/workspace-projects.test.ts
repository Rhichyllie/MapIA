import { describe, expect, it } from "vitest";
import {
  filterAndSortProjects,
  getTemplateLabel,
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

describe("workspace-projects", () => {
  it("filters snapshot pendente + tipo indefinido", () => {
    const result = filterAndSortProjects(sampleProjects, {
      searchTerm: "",
      diagramFilter: "undefined",
      templateFilter: "all",
      snapshotFilter: "pending",
      sortOption: "updated-desc",
      workspaceMode: "operational",
    });

    expect(result.map((project) => project.name)).toEqual(["Alpha"]);
  });

  it("applies sort by name asc", () => {
    const result = filterAndSortProjects(sampleProjects, {
      searchTerm: "",
      diagramFilter: "all",
      templateFilter: "all",
      snapshotFilter: "all",
      sortOption: "name-asc",
      workspaceMode: "operational",
    });

    expect(result.map((project) => project.name)).toEqual([
      "Alpha",
      "Beta",
      "Zulu",
    ]);
  });

  it("searches technical legacy label when workspace mode is technical", () => {
    const result = filterAndSortProjects(sampleProjects, {
      searchTerm: "graph",
      diagramFilter: "all",
      templateFilter: "all",
      snapshotFilter: "all",
      sortOption: "name-asc",
      workspaceMode: "technical",
    });

    expect(result.map((project) => project.name)).toEqual(["Zulu"]);
  });

  it("returns operational and technical template labels", () => {
    expect(getTemplateLabel("graph", "operational")).toBe("Estrutura livre");
    expect(getTemplateLabel("graph", "technical")).toBe("graph (legado)");
  });
});
