import { z } from "zod";
import {
  apiErrorResponse,
  apiSuccessResponse,
  unauthorizedResponse,
} from "@/src/server/app/api-response";
import { createServerUseCases } from "@/src/server/app/container";
import { getApiSessionIdentity } from "@/src/server/auth/api-session";
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
    const auth = await getApiSessionIdentity();

    if (!auth) {
      return unauthorizedResponse();
    }

    const params = ParamsSchema.parse(await context.params);
    const { projects, versioning } = createServerUseCases();

    await projects.getOwnedProject.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
    });

    const snapshotVersions = await versioning.listSnapshotVersions.execute({
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
    const auth = await getApiSessionIdentity();

    if (!auth) {
      return unauthorizedResponse();
    }

    const params = ParamsSchema.parse(await context.params);
    const body = CreateSnapshotVersionRequestSchema.parse(await request.json());
    const { projects, versioning } = createServerUseCases();

    await projects.getOwnedProject.execute({
      ownerIdentity: auth.identity,
      projectId: params.projectId,
    });

    const snapshotVersion =
      await versioning.createSnapshotVersionFromWorkingSnapshot.execute({
        projectId: params.projectId,
        label: body.label,
        origin: body.origin,
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
