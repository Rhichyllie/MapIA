import { getTranslations } from "next-intl/server";
import { Link } from "@/src/i18n/navigation";
import { AppError } from "@/src/lib/app-error";
import { appRoutes } from "@/src/lib/routes";
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
  scheduleCreationTelemetryOperation,
} from "@/src/server/observability/creation-assistant-transition-telemetry";
import { withServerTelemetrySpan } from "@/src/server/observability/server-telemetry";

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
  return await withServerTelemetrySpan(
    "editor.page.load",
    {
      attributes: {
        "editor.page.route": "/[locale]/(protected)/editor",
      },
    },
    async (span) => {
      const t = await getTranslations("Editor.page");
      const params = await searchParams;
      const projectId = getStringParam(params, "projectId");

      span.setAttribute("editor.page.project_selected", Boolean(projectId));
      if (!projectId) {
        return (
          <section className="panel">
            <PageHeader
              title={t("title")}
              description={t("emptyProjectSelectionDescription")}
            />
            <div className="panel-body">
              <p className="muted">{t("emptyProjectSelectionBody")}</p>
            </div>
          </section>
        );
      }

      span.setAttribute("editor.page.project_id", projectId);
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
        scheduleCreationTelemetryOperation(() =>
          recordCreationLegacyTemplateFallback({
            projectId: project.id,
            ownerIdentity,
            source: "editor-page",
            fallbackMode:
              creationContextResolution.decisionTrace.legacyTemplateFallback
                .fallbackMode,
            fallbackReason:
              creationContextResolution.decisionTrace.legacyTemplateFallback
                .fallbackReason,
            fieldsFromTemplate:
              creationContextResolution.decisionTrace.legacyTemplateFallback
                .fieldsFromTemplate,
            riskTier:
              creationContextResolution.decisionTrace.legacyTemplateFallback
                .riskTier,
            effectiveResult: {
              profile: creationContextResolution.context.effectiveProfile,
              initialView: creationContextResolution.context.effectiveInitialView,
              layout: creationContextResolution.context.effectiveLayout,
            },
          }),
        );
        const recipe = resolveCreationRecipe({
          profile: creationContextResolution.context.effectiveProfile,
          view: creationContextResolution.context.effectiveInitialView,
        });
        scheduleCreationTelemetryOperation(() =>
          recordCreationRecipeRuntimeResolved({
            projectId: project.id,
            ownerIdentity,
            profile: creationContextResolution.context.effectiveProfile,
            view: creationContextResolution.context.effectiveInitialView,
            recipeId:
              recipe?.id ??
              `${creationContextResolution.context.effectiveProfile}:${creationContextResolution.context.effectiveInitialView}`,
            fallbackUsed: !recipe,
          }),
        );
        span.setAttribute("editor.page.initial_snapshot_present", Boolean(workingSnapshot));
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
            : t("loadErrorFallback");
      }

      if (!viewModel) {
        span.setAttribute("editor.page.loaded", false);
        return (
          <section className="panel">
            <PageHeader
              title={t("title")}
              description={t("loadErrorDescription")}
            />
            <div className="panel-body">
              <div className="error-box">{loadErrorMessage}</div>
            </div>
          </section>
        );
      }

      span.setAttribute("editor.page.loaded", true);
      return (
        <section className="panel">
          <PageHeader
            title={t("title")}
            description={t("description")}
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
                <h3>{t("emptyInitialMapTitle")}</h3>
                <p>{t("emptyInitialMapDescription")}</p>
                <div className="row-actions">
                  <Link
                    className="btn btn-primary"
                    href={`${appRoutes.create}?fromProjectId=${viewModel.project.id}`}
                  >
                    {t("openAssistant")}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>
      );
    },
  );
}
