import { DashboardProjectsPanel } from "@/src/components/dashboard/dashboard-projects-panel";
import { createServerUseCases } from "@/src/server/app/container";
import {
  requireSession,
  requireSessionIdentity,
} from "@/src/server/auth/session";

export default async function DashboardPage() {
  const session = await requireSession();
  const ownerIdentity = requireSessionIdentity(session);
  const { workspaces, projects } = createServerUseCases();

  const primaryWorkspace =
    await workspaces.getOrCreatePrimaryWorkspaceForIdentity.execute(
      ownerIdentity,
    );
  const projectList = await projects.listProjectsByWorkspace.execute({
    ownerIdentity,
    workspaceId: primaryWorkspace.id,
  });

  return (
    <DashboardProjectsPanel
      workspace={{
        id: primaryWorkspace.id,
        slug: primaryWorkspace.slug,
        name: primaryWorkspace.name,
        ownerIdentity: primaryWorkspace.ownerIdentity,
      }}
      projects={projectList.map((project) => ({
        id: project.id,
        slug: project.slug,
        name: project.name,
        description: project.description,
        template: project.template,
      }))}
    />
  );
}
