import { z } from "zod";
import { isAppError } from "@/src/lib/app-error";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import { createServerUseCases } from "@/src/server/app/container";
import { requireAuthenticatedApiRequest } from "@/src/server/app/api-route-guards";
import { recordServerAuditEvent } from "@/src/server/audit/server-audit";

const CreateProjectRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().or(z.literal("")),
  template: z.enum(["sitemap", "flowchart", "erd", "graph"]),
  slug: z.string().min(2).max(80).optional().or(z.literal("")),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedApiRequest();
    const body = CreateProjectRequestSchema.parse(await request.json());
    const { projects } = createServerUseCases();
    let createdProject;

    try {
      createdProject = await projects.createProject.execute({
        ownerIdentity: auth.identity,
        workspaceId: body.workspaceId,
        name: body.name,
        description: body.description,
        template: body.template,
        slug: body.slug,
      });
    } catch (error) {
      if (isAppError(error) && error.code === "WORKSPACE_NOT_FOUND") {
        await recordServerAuditEvent({
          workspaceId: body.workspaceId,
          entityType: "workspace",
          entityId: body.workspaceId,
          action: "denied",
          actorIdentity: auth.identity,
          payload: {
            route: "POST /api/projects",
            reason: error.code,
          },
        });
      }

      throw error;
    }

    await recordServerAuditEvent({
      workspaceId: createdProject.workspaceId,
      projectId: createdProject.id,
      entityType: "project",
      entityId: createdProject.id,
      action: "created",
      actorIdentity: auth.identity,
      payload: {
        route: "POST /api/projects",
        template: createdProject.template,
        slug: createdProject.slug,
      },
    });

    return apiSuccessResponse(
      {
        project: createdProject,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
