import Link from "next/link";
import { AppError } from "@/src/lib/app-error";
import { EditorShell } from "@/src/components/editor/editor-shell";
import { PageHeader } from "@/src/components/ui/page-header";
import type {
  InitialView,
  ProjectProfile,
} from "@/src/modules/creation-assistant/domain";
import { resolveCreationRecipe } from "@/src/modules/creation-assistant/domain";
import { resolveCreationContext } from "@/src/modules/projects/domain";
import { createServerUseCases } from "@/src/server/app/container";
import {
  requireSession,
  requireSessionIdentity,
} from "@/src/server/auth/session";
import {
  recordCreationLegacyTemplateFallback,
  recordCreationRecipeRuntimeResolved,
} from "@/src/server/observability";

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
        <PageHeader
          title="Editor visual"
          description="Selecione um projeto na area de trabalho para abrir o editor."
        />
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
  const { projects, graph, creationAssistant } = createServerUseCases();
  let viewModel: {
    project: {
      id: string;
      name: string;
      slug: string;
      template: "sitemap" | "flowchart" | "erd" | "graph";
      creationProfile?: ProjectProfile;
      creationInitialView?: InitialView;
    };
    initialSnapshot:
      | Parameters<typeof EditorShell>[0]["initialSnapshot"]
      | null;
    initialRevision: number;
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
    const creationSettings =
      await creationAssistant.getProjectCreationSettings.execute({
        ownerIdentity,
        projectId,
      });
    const creationContextResolution = resolveCreationContext({
      creationSettings,
      snapshotDiagramType: workingSnapshot?.snapshot.diagramType,
      template: project.template,
    });
    await recordCreationLegacyTemplateFallback({
      projectId: project.id,
      ownerIdentity,
      source: "editor-page",
      fallbackMode:
        creationContextResolution.decisionTrace.legacyTemplateFallback.fallbackMode,
      fallbackReason:
        creationContextResolution.decisionTrace.legacyTemplateFallback
          .fallbackReason,
      fieldsFromTemplate:
        creationContextResolution.decisionTrace.legacyTemplateFallback
          .fieldsFromTemplate,
      riskTier: creationContextResolution.decisionTrace.legacyTemplateFallback.riskTier,
      effectiveResult: {
        profile: creationContextResolution.context.effectiveProfile,
        initialView: creationContextResolution.context.effectiveInitialView,
        layout: creationContextResolution.context.effectiveLayout,
      },
    });
    const recipe = resolveCreationRecipe({
      profile: creationContextResolution.context.effectiveProfile,
      view: creationContextResolution.context.effectiveInitialView,
    });
    await recordCreationRecipeRuntimeResolved({
      projectId: project.id,
      ownerIdentity,
      profile: creationContextResolution.context.effectiveProfile,
      view: creationContextResolution.context.effectiveInitialView,
      recipeId:
        recipe?.id ??
        `${creationContextResolution.context.effectiveProfile}:${creationContextResolution.context.effectiveInitialView}`,
      fallbackUsed: !recipe,
    });
    viewModel = {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        template: project.template,
        creationProfile: creationContextResolution.context.effectiveProfile,
        creationInitialView: creationContextResolution.context.effectiveInitialView,
      },
      initialSnapshot: workingSnapshot?.snapshot ?? null,
      initialRevision: workingSnapshot?.revision ?? 1,
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
        <PageHeader
          title="Editor visual"
          description="Falha ao carregar o projeto solicitado."
        />
        <div className="panel-body">
          <div className="error-box">{loadErrorMessage}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <PageHeader
        title="Editor visual"
        description="Ambiente de trabalho diario com salvamento, versoes e inspetor tecnico."
        actions={<span className="badge">{viewModel.project.name}</span>}
      />
      <div className="panel-body">
        {viewModel.initialSnapshot ? (
          <EditorShell
            project={viewModel.project}
            initialSnapshot={viewModel.initialSnapshot}
            initialRevision={viewModel.initialRevision}
          />
        ) : (
          <div className="tile">
            <h3>Mapa inicial ainda nao criado</h3>
            <p>
              Execute o Assistente de criacao para gerar o mapa inicial antes de editar.
            </p>
            <div className="row-actions">
              <Link
                className="btn btn-primary"
                href={`/create?fromProjectId=${viewModel.project.id}`}
              >
                Abrir Assistente
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
