import { z } from "zod";
import {
  apiErrorResponse,
  apiSuccessResponse,
} from "@/src/server/app/api-response";
import {
  requireAuthenticatedApiRequest,
  requireProjectAccessForApi,
} from "@/src/server/app/api-route-guards";
import { createServerUseCases } from "@/src/server/app/container";
import { recordServerAuditEvent } from "@/src/server/audit/server-audit";
import { CreateSnapshotVersionFromWorkingSnapshotInputSchema } from "@/src/modules/versioning/application";

const ParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const CreateSnapshotVersionRequestSchema =
  CreateSnapshotVersionFromWorkingSnapshotInputSchema.omit({
    projectId: true,
  });

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuthenticatedApiRequest();
    const params = ParamsSchema.parse(await context.params);
    const useCases = createServerUseCases();

    await requireProjectAccessForApi({
      route: "GET /api/projects/[projectId]/snapshot-versions",
      projectId: params.projectId,
      minimumRole: "viewer",
      auth,
      useCases,
    });

    const snapshotVersions =
      await useCases.versioning.listSnapshotVersions.execute({
        projectId: params.projectId,
      });

    return apiSuccessResponse({ snapshotVersions });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuthenticatedApiRequest();
    const params = ParamsSchema.parse(await context.params);
    const body = CreateSnapshotVersionRequestSchema.parse(await request.json());
    const useCases = createServerUseCases();
    const access = await requireProjectAccessForApi({
      route: "POST /api/projects/[projectId]/snapshot-versions",
      projectId: params.projectId,
      minimumRole: "member",
      auth,
      useCases,
    });

    const snapshotVersion =
      await useCases.versioning.createSnapshotVersionFromWorkingSnapshot.execute(
        {
          projectId: params.projectId,
          label: body.label,
          origin: body.origin,
        },
      );
    await recordServerAuditEvent({
      workspaceId: access.project.workspaceId,
      projectId: params.projectId,
      entityType: "graph_version",
      entityId: snapshotVersion.id,
      action: "created",
      actorUserId: auth.userId,
      actorIdentity: auth.identity,
      payload: {
        route: "POST /api/projects/[projectId]/snapshot-versions",
        actorRole: access.membership.role,
        origin: snapshotVersion.origin,
        label: snapshotVersion.label ?? null,
      },
    });

    return apiSuccessResponse(
      {
        message: "Versao criada com sucesso.",
        snapshotVersion,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
