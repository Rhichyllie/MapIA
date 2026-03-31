import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/src/i18n/navigation";
import { buildLocalizedPageMetadata } from "@/src/i18n/metadata";
import type { AppLocale } from "@/src/i18n/routing";
import { AppError } from "@/src/lib/app-error";
import { appRoutes } from "@/src/lib/routes";
import { CreationAssistantShell } from "@/src/components/creation-assistant/creation-assistant-shell";
import { PageHeader } from "@/src/components/ui/page-header";
import type { AssistantDraft } from "@/src/modules/creation-assistant/domain";
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

type CreatePageProps = {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: Pick<CreatePageProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  return buildLocalizedPageMetadata(locale, "create");
}

function getStringParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function CreatePage({ searchParams }: CreatePageProps) {
  const t = await getTranslations("Create.page");
  const params = await searchParams;
  const fromProjectId = getStringParam(params, "fromProjectId");
  const mode = fromProjectId ? "existing" : "new";
  const session = await requireSession();
  const ownerIdentity = requireSessionIdentity(session);
  const { projects, creationAssistant, graph } = createServerUseCases();

  let loadErrorMessage: string | null = null;
  let initialProject:
    | {
        id: string;
        name: string;
        objective?: string;
        template: "sitemap" | "flowchart" | "erd" | "graph";
      }
    | undefined;
  let initialSettings = null as Awaited<
    ReturnType<typeof creationAssistant.getProjectCreationSettings.execute>
  >;
  let initialDraftState: {
    draft: AssistantDraft;
    version: number;
    updatedAt: string;
  } | null = null;
  let snapshotDiagramType: string | undefined;

  if (fromProjectId) {
    try {
      const [project, settings, draftState, workingSnapshot] = await Promise.all([
        projects.getOwnedProject.execute({
          ownerIdentity,
          projectId: fromProjectId,
        }),
        creationAssistant.getProjectCreationSettings.execute({
          ownerIdentity,
          projectId: fromProjectId,
        }),
        creationAssistant.getProjectCreationDraft.execute({
          ownerIdentity,
          projectId: fromProjectId,
        }),
        graph.loadWorkingSnapshot.execute({
          projectId: fromProjectId,
        }),
      ]);
      initialProject = {
        id: project.id,
        name: project.name,
        objective: project.description,
        template: project.template,
      };
      initialSettings = settings;
      initialDraftState = draftState
        ? {
            draft: draftState.draft,
            version: draftState.version,
            updatedAt: draftState.updatedAt.toISOString(),
          }
        : null;
      snapshotDiagramType = workingSnapshot?.snapshot.diagramType;

      const contextResolution = resolveCreationContext({
        creationSettings: settings,
        snapshotDiagramType,
        template: project.template,
      });
      const recipe = resolveCreationRecipe({
        profile: contextResolution.context.effectiveProfile,
        view: contextResolution.context.effectiveInitialView,
      });
      scheduleCreationTelemetryOperation(async () => {
        await recordCreationLegacyTemplateFallback({
          projectId: project.id,
          ownerIdentity,
          source: "create-page",
          fallbackMode:
            contextResolution.decisionTrace.legacyTemplateFallback.fallbackMode,
          fallbackReason:
            contextResolution.decisionTrace.legacyTemplateFallback.fallbackReason,
          fieldsFromTemplate:
            contextResolution.decisionTrace.legacyTemplateFallback.fieldsFromTemplate,
          riskTier: contextResolution.decisionTrace.legacyTemplateFallback.riskTier,
          effectiveResult: {
            profile: contextResolution.context.effectiveProfile,
            initialView: contextResolution.context.effectiveInitialView,
            layout: contextResolution.context.effectiveLayout,
          },
        });
        await recordCreationRecipeRuntimeResolved({
          projectId: project.id,
          ownerIdentity,
          profile: contextResolution.context.effectiveProfile,
          view: contextResolution.context.effectiveInitialView,
          recipeId:
            recipe?.id ??
            `${contextResolution.context.effectiveProfile}:${contextResolution.context.effectiveInitialView}`,
          fallbackUsed: !recipe,
        });
      });
    } catch (error) {
      loadErrorMessage =
        error instanceof AppError
          ? error.message
          : t("loadErrorFallback");
    }
  }

  return (
    <section className="panel">
      <PageHeader
        title={t("title")}
        description={
          mode === "new"
            ? t("newDescription")
            : t("existingDescription")
        }
      />
      <div className="panel-body">
        {loadErrorMessage ? (
          <div className="stack-sm">
            <div className="error-box">{loadErrorMessage}</div>
            <div className="row-actions">
              <Link className="btn" href={appRoutes.dashboard}>
                {t("backToDashboard")}
              </Link>
            </div>
          </div>
        ) : (
          <CreationAssistantShell
            mode={mode}
            fromProjectId={fromProjectId}
            initialProject={initialProject}
            initialSettings={initialSettings}
            initialDraftState={initialDraftState}
            snapshotDiagramType={snapshotDiagramType}
          />
        )}
      </div>
    </section>
  );
}
