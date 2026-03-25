import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ptBRMessages from "@/messages/pt-BR.json";
import { createDashboardCopy } from "./dashboard-copy";
import { ProjectsList } from "./projects-list";

vi.mock("@/src/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    React.createElement("a", { ...props, href }, children),
}));

const copy = createDashboardCopy(ptBRMessages.Dashboard, "pt-BR");

const sampleProject = {
  id: "58f3ca26-085e-4237-80d9-adcc42f7142b",
  slug: "mapa-onboarding",
  name: "Mapa de onboarding",
  description: "Alinha RH, TI e lideranca na jornada de entrada.",
  template: "graph" as const,
  createdAt: "2026-03-02T10:00:00.000Z",
  updatedAt: "2026-03-04T10:00:00.000Z",
  selectedDiagramType: "flow" as const,
  hasInitialSnapshot: true,
  snapshotVersionCount: 2,
};

function renderList(overrides?: Partial<React.ComponentProps<typeof ProjectsList>>) {
  return renderToStaticMarkup(
    React.createElement(ProjectsList, {
      projects: [sampleProject],
      density: "compact",
      workspaceMode: "operational",
      onCopyTechnicalId: vi.fn(),
      copy,
      ...overrides,
    }),
  );
}

describe("ProjectsList", () => {
  it("renders the row with primary hierarchy and dominant editor action", () => {
    const markup = renderList();

    expect(markup).toContain(
      `data-testid="dashboard-project-primary-link-${sampleProject.id}"`,
    );
    expect(markup).toContain(`data-testid="dashboard-project-facts-${sampleProject.id}"`);
    expect(markup).toContain(`data-testid="dashboard-project-actions-${sampleProject.id}"`);
    expect(markup).toContain(`data-testid="dashboard-open-editor-${sampleProject.id}"`);
    expect(markup).toContain(`data-testid="dashboard-project-secondary-actions-${sampleProject.id}"`);
    expect(markup).toContain("Resumo principal");
    expect(markup).toContain("Abrir no editor");
    expect(markup).toContain("Assistente de criacao");
    expect(markup).toContain("Ver versoes");
  });

  it("keeps technical actions secondary and only exposes them in technical mode", () => {
    const operationalMarkup = renderList();
    const technicalMarkup = renderList({ workspaceMode: "technical" });

    expect(operationalMarkup).not.toContain(
      `data-testid="dashboard-copy-technical-id-${sampleProject.id}"`,
    );
    expect(technicalMarkup).toContain(
      `data-testid="dashboard-copy-technical-id-${sampleProject.id}"`,
    );
    expect(technicalMarkup).toContain("graph (legado)");
  });
});
