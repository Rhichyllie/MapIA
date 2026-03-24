import type { Metadata } from "next";
import { DashboardProjectsPanel } from "@/src/components/dashboard/dashboard-projects-panel";
import { buildLocalizedPageMetadata } from "@/src/i18n/metadata";
import type { AppLocale } from "@/src/i18n/routing";
import { isSupportedDiagramType } from "@/src/modules/graph/domain";
import { createServerUseCases } from "@/src/server/app/container";
import {
  requireSession,
  requireSessionIdentity,
} from "@/src/server/auth/session";

type DashboardPageProps = {
  params: Promise<{ locale: AppLocale }>;
};

export async function generateMetadata({
  params,
}: DashboardPageProps): Promise<Metadata> {
  const { locale } = await params;
  return buildLocalizedPageMetadata(locale, "dashboard");
}

export default async function DashboardPage() {
  const session = await requireSession();
  const ownerIdentity = requireSessionIdentity(session);
  const { workspaces, projects, graph, versioning } = createServerUseCases();

  const primaryWorkspace =
    await workspaces.getOrCreatePrimaryWorkspaceForIdentity.execute(
      ownerIdentity,
    );
  const projectList = await projects.listProjectsByWorkspace.execute({
    ownerIdentity,
    workspaceId: primaryWorkspace.id,
  });
  const projectCards = await Promise.all(
    projectList.map(async (project) => {
      const [workingSnapshot, snapshotVersions] = await Promise.all([
        graph.loadWorkingSnapshot.execute({ projectId: project.id }),
        versioning.listSnapshotVersions.execute({ projectId: project.id }),
      ]);
      const diagramType = workingSnapshot?.snapshot?.diagramType;

      return {
        id: project.id,
        slug: project.slug,
        name: project.name,
        description: project.description,
        template: project.template,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        selectedDiagramType: isSupportedDiagramType(diagramType)
          ? diagramType
          : undefined,
        hasInitialSnapshot: Boolean(workingSnapshot?.snapshot),
        snapshotVersionCount: snapshotVersions.length,
      };
    }),
  );

  return (
    <DashboardProjectsPanel
      workspace={{
        id: primaryWorkspace.id,
        slug: primaryWorkspace.slug,
        name: primaryWorkspace.name,
        ownerIdentity: primaryWorkspace.ownerIdentity,
      }}
      projects={projectCards}
    />
  );
}
