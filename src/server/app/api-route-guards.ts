import { z } from "zod";
import { AppError, isAppError } from "@/src/lib/app-error";
import { unauthorizedError } from "@/src/server/app/api-response";
import type { ServerUseCases } from "@/src/server/app/container";
import { getApiSessionIdentity } from "@/src/server/auth/api-session";
import { recordServerAuditEvent } from "@/src/server/audit/server-audit";

function isProjectAccessDeniedError(error: unknown): error is AppError {
  return (
    isAppError(error) &&
    (error.code === "PROJECT_NOT_FOUND" || error.code === "WORKSPACE_NOT_FOUND")
  );
}

export async function requireAuthenticatedApiRequest() {
  const auth = await getApiSessionIdentity();

  if (!auth) {
    throw unauthorizedError();
  }

  if (!auth.identity.trim()) {
    throw unauthorizedError("Sessao autenticada sem identidade utilizavel.");
  }

  return auth;
}

export async function requireOwnedProjectForApi(input: {
  route: string;
  projectId: string;
  ownerIdentity: string;
  useCases: Pick<ServerUseCases, "projects">;
}) {
  try {
    return await input.useCases.projects.getOwnedProject.execute({
      ownerIdentity: input.ownerIdentity,
      projectId: input.projectId,
    });
  } catch (error) {
    if (isProjectAccessDeniedError(error)) {
      await recordServerAuditEvent({
        projectId: input.projectId,
        entityType: "project",
        entityId: input.projectId,
        action: "denied",
        actorIdentity: input.ownerIdentity,
        payload: {
          route: input.route,
          reason: error.code,
        },
      });
    }

    throw error;
  }
}

export async function requireOwnedProjectRouteContext<
  TParams extends {
    projectId: string;
  },
>(input: {
  route: string;
  params: Promise<TParams>;
  paramsSchema: z.ZodType<TParams>;
  useCases: Pick<ServerUseCases, "projects">;
}) {
  const auth = await requireAuthenticatedApiRequest();
  const params = input.paramsSchema.parse(await input.params);
  const project = await requireOwnedProjectForApi({
    route: input.route,
    projectId: params.projectId,
    ownerIdentity: auth.identity,
    useCases: input.useCases,
  });

  return {
    auth,
    params,
    project,
  };
}
