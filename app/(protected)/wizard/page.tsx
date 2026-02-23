import { AppError } from "@/src/lib/app-error";
import { WizardStepperShell } from "@/src/components/wizard/wizard-stepper-shell";
import { createServerUseCases } from "@/src/server/app/container";
import {
  requireSession,
  requireSessionIdentity,
} from "@/src/server/auth/session";

type WizardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getStringParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function WizardPage({ searchParams }: WizardPageProps) {
  const params = await searchParams;
  const projectId = getStringParam(params, "projectId");

  if (!projectId) {
    return (
      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Wizard de criacao</h2>
            <p>Selecione um projeto no Dashboard para abrir o wizard.</p>
          </div>
        </header>
        <div className="panel-body">
          <p className="muted">
            O wizard da Fase 1 opera sobre um projeto persistido. Crie um
            projeto no Dashboard e abra pelo link &quot;Abrir Wizard&quot;.
          </p>
        </div>
      </section>
    );
  }

  const session = await requireSession();
  const ownerIdentity = requireSessionIdentity(session);
  const { projects, wizard } = createServerUseCases();
  let viewModel: {
    project: {
      id: string;
      name: string;
      slug: string;
      template: "sitemap" | "flowchart" | "erd" | "graph";
      description?: string;
    };
    draft: {
      status: "draft" | "validating" | "generating" | "ready" | "error";
      currentStep:
        | "template"
        | "diagram_type"
        | "data_source"
        | "config"
        | "review";
      payload: Parameters<
        typeof WizardStepperShell
      >[0]["initialDraft"]["payload"];
      lastError?: string;
    };
  } | null = null;
  let loadErrorMessage: string | null = null;

  try {
    const project = await projects.getOwnedProject.execute({
      ownerIdentity,
      projectId,
    });
    const draft = await wizard.getOrCreateDraft.execute({
      ownerIdentity,
      projectId,
    });
    viewModel = {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        template: project.template,
        description: project.description,
      },
      draft: {
        status: draft.status,
        currentStep: draft.currentStep,
        payload: draft.payload,
        lastError: draft.lastError,
      },
    };
  } catch (error) {
    loadErrorMessage =
      error instanceof AppError
        ? error.message
        : "Nao foi possivel carregar o wizard deste projeto.";
  }

  if (!viewModel) {
    return (
      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Wizard de criacao</h2>
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
          <h2>Wizard de criacao</h2>
          <p>
            Stepper com persistencia de rascunho e geracao de snapshot inicial.
          </p>
        </div>
        <span className="badge">{viewModel.project.name}</span>
      </header>
      <div className="panel-body">
        <WizardStepperShell
          project={viewModel.project}
          initialDraft={viewModel.draft}
        />
      </div>
    </section>
  );
}
