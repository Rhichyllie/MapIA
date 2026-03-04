import Link from "next/link";
import { AppError } from "@/src/lib/app-error";
import { EditorShell } from "@/src/components/editor/editor-shell";
import { createServerUseCases } from "@/src/server/app/container";
import {
  requireSession,
  requireSessionIdentity,
} from "@/src/server/auth/session";

type EditorPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getStringParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function EditorPage({ searchParams }: EditorPageProps) {
  const params = await searchParams;
  const projectId = getStringParam(params, "projectId");

  if (!projectId) {
    return (
      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Editor visual</h2>
            <p>Selecione um projeto no Workspace para abrir o editor.</p>
          </div>
        </header>
        <div className="panel-body">
          <p className="muted">
            O editor trabalha sobre o snapshot de trabalho persistido do projeto.
          </p>
        </div>
      </section>
    );
  }

  const session = await requireSession();
  const ownerIdentity = requireSessionIdentity(session);
  const { projects, graph } = createServerUseCases();
  let viewModel: {
    project: {
      id: string;
      name: string;
      slug: string;
    };
    initialSnapshot:
      | Parameters<typeof EditorShell>[0]["initialSnapshot"]
      | null;
  } | null = null;
  let loadErrorMessage: string | null = null;

  try {
    const project = await projects.getOwnedProject.execute({
      ownerIdentity,
      projectId,
    });
    const workingSnapshot = await graph.loadWorkingSnapshot.execute({
      projectId,
    });
    viewModel = {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
      },
      initialSnapshot: workingSnapshot?.snapshot ?? null,
    };
  } catch (error) {
    loadErrorMessage =
      error instanceof AppError
        ? error.message
        : "Nao foi possivel carregar o editor deste projeto.";
  }

  if (!viewModel) {
    return (
      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Editor visual</h2>
            <p>Falha ao carregar o projeto solicitado.</p>
          </div>
        </header>
        <div className="panel-body">
          <div className="error-box">{loadErrorMessage}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
            <h2>Editor visual</h2>
            <p>
              Ambiente de edicao com salvamento, versoes e inspector tecnico.
            </p>
          </div>
          <span className="badge">{viewModel.project.name}</span>
      </header>
      <div className="panel-body">
        {viewModel.initialSnapshot ? (
          <EditorShell
            project={viewModel.project}
            initialSnapshot={viewModel.initialSnapshot}
          />
        ) : (
          <div className="tile">
            <h3>Snapshot ainda nao gerado</h3>
            <p>
              Execute o wizard para gerar o snapshot inicial antes de editar.
            </p>
            <div className="row-actions">
              <Link
                className="btn btn-primary"
                href={`/wizard?projectId=${viewModel.project.id}`}
              >
                Abrir Wizard
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
