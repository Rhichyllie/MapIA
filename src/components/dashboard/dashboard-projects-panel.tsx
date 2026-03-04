"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { EmptyState } from "@/src/components/ui/empty-state";
import { PageHeader } from "@/src/components/ui/page-header";

type DashboardWorkspace = {
  id: string;
  slug: string;
  name: string;
  ownerIdentity?: string;
};

type DashboardProject = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  template: "sitemap" | "flowchart" | "erd" | "graph";
};

type DashboardProjectsPanelProps = {
  workspace: DashboardWorkspace;
  projects: DashboardProject[];
};

type InitialDiagramChoice = "wizard" | "tree" | "flow" | "mindmap";

const diagramTypeOptions: Array<{
  value: InitialDiagramChoice;
  label: string;
  description: string;
}> = [
  {
    value: "wizard",
    label: "Escolher no wizard",
    description: "Recomendado para configurar com mais contexto.",
  },
  {
    value: "tree",
    label: "Tree (hierarquia)",
    description: "Ideal para estruturas em níveis.",
  },
  {
    value: "flow",
    label: "Flow (processo)",
    description: "Ideal para fluxos de etapas.",
  },
  {
    value: "mindmap",
    label: "Mindmap (ideias)",
    description: "Ideal para mapas mentais radiais.",
  },
];

const legacyTemplateOptions: Array<{
  value: DashboardProject["template"];
  label: string;
  description: string;
}> = [
  {
    value: "graph",
    label: "Graph (padrão legado)",
    description: "Estrutura genérica para compatibilidade.",
  },
  {
    value: "sitemap",
    label: "Sitemap",
    description: "Navegação de páginas ou seções.",
  },
  {
    value: "flowchart",
    label: "Flowchart",
    description: "Fluxograma clássico de processos.",
  },
  {
    value: "erd",
    label: "ERD",
    description: "Relacionamento de entidades e dados.",
  },
];

function buildWizardHref(projectId: string, initialDiagramType: InitialDiagramChoice) {
  const params = new URLSearchParams({
    projectId,
  });

  if (initialDiagramType !== "wizard") {
    params.set("diagramType", initialDiagramType);
  }

  return `/wizard?${params.toString()}`;
}

export function DashboardProjectsPanel({
  workspace,
  projects,
}: DashboardProjectsPanelProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [initialDiagramType, setInitialDiagramType] =
    useState<InitialDiagramChoice>("wizard");
  const [template, setTemplate] =
    useState<DashboardProject["template"]>("graph");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastCreatedProject, setLastCreatedProject] = useState<{
    id: string;
    initialDiagramType: InitialDiagramChoice;
  } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (!trimmedName) {
      setErrorMessage("Informe o nome do projeto.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

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
        data?: { project?: { id?: string; name?: string } };
        message?: string;
      };

      if (!response.ok) {
        setErrorMessage(payload.message ?? "Nao foi possivel criar o projeto.");
        return;
      }

      setSuccessMessage(
        `Projeto "${payload.data?.project?.name ?? trimmedName}" criado com sucesso.`,
      );
      setLastCreatedProject({
        id: payload.data?.project?.id ?? "",
        initialDiagramType,
      });
      setName("");
      setDescription("");
      setInitialDiagramType("wizard");
      setTemplate("graph");
      router.refresh();
    } catch {
      setErrorMessage("Falha de rede ao criar projeto.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <section className="panel">
        <PageHeader
          title="Workspace"
          description="Centralize seus projetos, inicie pelo wizard guiado e evolua no editor visual."
          actions={
            <span className="badge">
              <span className="badge-dot" aria-hidden="true" />
              {workspace.name}
            </span>
          }
        />
        <div className="panel-body">
          <div className="grid-tiles">
            <div className="tile">
              <h3>Workspace atual</h3>
              <p>{workspace.name}</p>
            </div>
            <div className="tile">
              <h3>Responsável</h3>
              <p>{workspace.ownerIdentity ?? "Nao identificado"}</p>
            </div>
            <div className="tile">
              <h3>Projetos</h3>
              <p>{projects.length} projeto(s) ativos neste workspace.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <PageHeader
          title="Criar projeto"
          description="Informe somente o essencial para começar. Você pode detalhar o restante no wizard."
        />
        <div className="panel-body">
          <form
            className="dashboard-form"
            onSubmit={handleSubmit}
            data-testid="dashboard-create-project-form"
          >
            <div className="field">
              <label htmlFor="project-name">Nome do projeto</label>
              <input
                id="project-name"
                data-testid="dashboard-project-name-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Mapa do processo de onboarding"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="project-description">
                Finalidade (opcional)
              </label>
              <textarea
                id="project-description"
                data-testid="dashboard-project-description-input"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Ex.: Mapear o fluxo de onboarding entre RH, TI e gestor."
              />
            </div>

            <div className="field">
              <label htmlFor="project-initial-diagram">
                Tipo inicial do diagrama
              </label>
              <select
                id="project-initial-diagram"
                data-testid="dashboard-initial-diagram-type-select"
                value={initialDiagramType}
                onChange={(event) =>
                  setInitialDiagramType(
                    event.target.value as InitialDiagramChoice,
                  )
                }
              >
                {diagramTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="helper">
                {
                  diagramTypeOptions.find(
                    (option) => option.value === initialDiagramType,
                  )?.description
                }
              </p>
            </div>

            <details className="tile">
              <summary>Avancado: templates legados</summary>
              <div className="stack-sm">
                <div className="field">
                  <label htmlFor="project-template">Template legado</label>
                  <select
                    id="project-template"
                    data-testid="dashboard-project-template-select"
                    value={template}
                    onChange={(event) =>
                      setTemplate(
                        event.target.value as DashboardProject["template"],
                      )
                    }
                  >
                    {legacyTemplateOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="helper">
                  {
                    legacyTemplateOptions.find(
                      (option) => option.value === template,
                    )?.description
                  }
                </p>
              </div>
            </details>

            {errorMessage ? (
              <div
                className="error-box"
                data-testid="dashboard-create-project-error"
              >
                {errorMessage}
              </div>
            ) : null}
            {successMessage ? (
              <div
                className="success-box"
                data-testid="dashboard-create-project-success"
              >
                <p>{successMessage}</p>
                {lastCreatedProject?.id ? (
                  <div className="row-actions">
                    <Link
                      className="btn btn-primary"
                      href={buildWizardHref(
                        lastCreatedProject.id,
                        lastCreatedProject.initialDiagramType,
                      )}
                      data-testid="dashboard-success-open-wizard-button"
                    >
                      Abrir Wizard
                    </Link>
                    <Link
                      className="btn"
                      href={`/editor?projectId=${lastCreatedProject.id}`}
                      data-testid="dashboard-success-open-editor-button"
                    >
                      Abrir Editor
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="row-actions">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={isSubmitting}
                data-testid="dashboard-create-project-button"
              >
                {isSubmitting ? "Criando..." : "Criar projeto"}
              </button>
              <p className="helper">
                Após criar, você pode seguir no Wizard para gerar o snapshot
                inicial.
              </p>
            </div>
          </form>
        </div>
      </section>

      <section className="panel">
        <PageHeader
          title="Projetos"
          description={`${projects.length} projeto(s) neste workspace.`}
        />
        <div className="panel-body">
          {projects.length === 0 ? (
            <EmptyState
              title="Nenhum projeto criado ainda"
              description="Crie seu primeiro projeto para iniciar o fluxo Workspace -> Wizard -> Editor."
              dataTestId="dashboard-empty-projects"
            />
          ) : (
            <div className="project-list" data-testid="dashboard-project-list">
              {projects.map((project) => (
                <article
                  className="tile"
                  key={project.id}
                  data-testid={`dashboard-project-card-${project.id}`}
                >
                  <div
                    className="row-actions"
                    style={{ justifyContent: "space-between" }}
                  >
                    <h3>{project.name}</h3>
                    <span className="badge">
                      {project.template === "graph"
                        ? "Template padrão"
                        : `Template ${project.template.toUpperCase()}`}
                    </span>
                  </div>
                  <p>{project.description ?? "Sem descricao informada."}</p>
                  <div className="row-actions">
                    <Link
                      className="btn btn-primary"
                      href={buildWizardHref(project.id, "wizard")}
                      data-testid={`dashboard-open-wizard-${project.id}`}
                    >
                      Abrir Wizard
                    </Link>
                    <Link
                      className="btn"
                      href={`/editor?projectId=${project.id}`}
                      data-testid={`dashboard-open-editor-${project.id}`}
                    >
                      Abrir Editor
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
