import { z } from "zod";
import {
  apiErrorResponse,
  apiSuccessResponse,
  unauthorizedResponse,
} from "@/src/server/app/api-response";
import { createServerUseCases } from "@/src/server/app/container";
import { getApiSessionIdentity } from "@/src/server/auth/api-session";

const CreateProjectRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().or(z.literal("")),
  template: z.enum(["sitemap", "flowchart", "erd", "graph"]),
  slug: z.string().min(2).max(80).optional().or(z.literal("")),
});

export async function POST(request: Request) {
  try {
    const auth = await getApiSessionIdentity();

    if (!auth) {
      return unauthorizedResponse();
    }

    const body = CreateProjectRequestSchema.parse(await request.json());
    const { projects } = createServerUseCases();

    const createdProject = await projects.createProject.execute({
      ownerIdentity: auth.identity,
      workspaceId: body.workspaceId,
      name: body.name,
      description: body.description,
      template: body.template,
      slug: body.slug,
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
