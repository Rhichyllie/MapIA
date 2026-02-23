"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

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

export function DashboardProjectsPanel({
  workspace,
  projects,
}: DashboardProjectsPanelProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] =
    useState<DashboardProject["template"]>("graph");
  const [slug, setSlug] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          name,
          description,
          template,
          slug,
        }),
      });

      const payload = (await response.json()) as {
        data?: { project?: { name?: string } };
        message?: string;
      };

      if (!response.ok) {
        setErrorMessage(payload.message ?? "Nao foi possivel criar o projeto.");
        return;
      }

      setSuccessMessage(
        `Projeto "${payload.data?.project?.name ?? name}" criado com sucesso.`,
      );
      setName("");
      setDescription("");
      setSlug("");
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
        <header className="panel-header">
          <div>
            <h2>Workspace principal</h2>
            <p>
              Crie e gerencie projetos reais persistidos via Prisma/Postgres.
            </p>
          </div>
          <span className="badge">
            <span className="badge-dot" aria-hidden="true" />
            {workspace.slug}
          </span>
        </header>
        <div className="panel-body">
          <div className="tile">
            <h3>{workspace.name}</h3>
            <p>
              Owner:{" "}
              <span className="mono">{workspace.ownerIdentity ?? "n/a"}</span>
            </p>
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Criar projeto</h2>
            <p>
              Formulario real com validacao no backend (Zod + casos de uso).
            </p>
          </div>
        </header>
        <div className="panel-body">
          <form className="dashboard-form" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="project-name">Nome</label>
              <input
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Mapa de Onboarding"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="project-template">Template</label>
              <select
                id="project-template"
                value={template}
                onChange={(event) =>
                  setTemplate(
                    event.target.value as DashboardProject["template"],
                  )
                }
              >
                <option value="graph">Graph</option>
                <option value="sitemap">Sitemap</option>
                <option value="flowchart">Flowchart</option>
                <option value="erd">ERD</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="project-slug">Slug (opcional)</label>
              <input
                id="project-slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                placeholder="ex.: mapa-onboarding"
              />
            </div>

            <div className="field">
              <label htmlFor="project-description">Descricao (opcional)</label>
              <textarea
                id="project-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Contexto inicial do projeto"
              />
            </div>

            {errorMessage ? (
              <div className="error-box">{errorMessage}</div>
            ) : null}
            {successMessage ? (
              <div className="success-box">{successMessage}</div>
            ) : null}

            <div className="row-actions">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Criando..." : "Criar projeto"}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Projetos</h2>
            <p>{projects.length} projeto(s) neste workspace.</p>
          </div>
        </header>
        <div className="panel-body">
          {projects.length === 0 ? (
            <div className="tile">
              <h3>Nenhum projeto ainda</h3>
              <p>
                Crie um projeto acima para iniciar o fluxo Dashboard -&gt;
                Wizard -&gt; Editor.
              </p>
            </div>
          ) : (
            <div className="project-list">
              {projects.map((project) => (
                <article className="tile" key={project.id}>
                  <div
                    className="row-actions"
                    style={{ justifyContent: "space-between" }}
                  >
                    <h3>{project.name}</h3>
                    <span className="badge">{project.template}</span>
                  </div>
                  <p>{project.description ?? "Sem descricao."}</p>
                  <p className="helper">
                    Slug: <code className="mono">{project.slug}</code>
                  </p>
                  <div className="row-actions">
                    <Link
                      className="btn btn-primary"
                      href={`/wizard?projectId=${project.id}`}
                    >
                      Abrir Wizard
                    </Link>
                    <Link
                      className="btn"
                      href={`/editor?projectId=${project.id}`}
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
