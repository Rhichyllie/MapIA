import { z } from "zod";
import { AppError, isAppError } from "@/src/lib/app-error";
import type { ProjectAccessContext } from "@/src/modules/projects/application";
import type { WorkspaceRole } from "@/src/modules/workspaces/domain";
import { unauthorizedError } from "@/src/server/app/api-response";
import type { ServerUseCases } from "@/src/server/app/container";
import { getApiSessionIdentity } from "@/src/server/auth/api-session";
import { recordServerAuditEvent } from "@/src/server/audit/server-audit";

function isProjectAccessDeniedError(error: unknown): error is AppError {
  return (
    isAppError(error) &&
    (error.code === "PROJECT_NOT_FOUND" ||
      error.code === "PROJECT_FORBIDDEN" ||
      error.code === "WORKSPACE_NOT_FOUND" ||
      error.code === "WORKSPACE_FORBIDDEN")
  );
}

type AuthenticatedApiRequest = Awaited<
  ReturnType<typeof requireAuthenticatedApiRequest>
>;

async function executeProjectAccess(input: {
  route: string;
  projectId: string;
  minimumRole: WorkspaceRole;
  auth: AuthenticatedApiRequest;
  useCases: Pick<ServerUseCases, "projects">;
}): Promise<ProjectAccessContext> {
  if (!input.useCases.projects.getProjectAccess) {
    throw new AppError("Projeto protegido sem guard de acesso configurado.", {
      code: "PROJECT_ACCESS_GUARD_MISSING",
      status: 500,
      details: {
        route: input.route,
      },
    });
  }

  return await input.useCases.projects.getProjectAccess.execute({
    actorUserId: input.auth.userId,
    projectId: input.projectId,
    minimumRole: input.minimumRole,
  });
}

export async function requireAuthenticatedApiRequest() {
  const auth = await getApiSessionIdentity();

  if (!auth) {
    throw unauthorizedError();
  }

  const derivedUserId =
    auth.userId?.trim() ||
    auth.actor?.userId?.trim() ||
    auth.session?.user?.id?.trim() ||
    "";

  if (!auth.identity.trim() || !derivedUserId) {
    throw unauthorizedError("Sessao autenticada sem claims utilizaveis.");
  }

  return {
    ...auth,
    userId: derivedUserId,
    actor: auth.actor
      ? { ...auth.actor, userId: derivedUserId }
      : {
          userId: derivedUserId,
          email: auth.identity,
          providerId:
            auth.session?.user?.authProvider?.trim() || "test-compatibility",
          authMode: auth.session?.user?.authMode || "development_credentials",
        },
  };
}

export async function requireWorkspaceAccessForApi(input: {
  route: string;
  workspaceId: string;
  minimumRole: WorkspaceRole;
  auth: Awaited<ReturnType<typeof requireAuthenticatedApiRequest>>;
  useCases: Pick<ServerUseCases, "workspaces">;
}) {
  try {
    return await input.useCases.workspaces.getWorkspaceAccess.execute({
      actorUserId: input.auth.userId,
      workspaceId: input.workspaceId,
      minimumRole: input.minimumRole,
    });
  } catch (error) {
    if (isProjectAccessDeniedError(error)) {
      await recordServerAuditEvent({
        workspaceId: input.workspaceId,
        entityType: "workspace",
        entityId: input.workspaceId,
        action: "denied",
        actorUserId: input.auth.userId,
        actorIdentity: input.auth.identity,
        payload: {
          route: input.route,
          reason: error.code,
          requiredRole: input.minimumRole,
        },
      });
    }

    throw error;
  }
}

export async function requireProjectAccessForApi(input: {
  route: string;
  projectId: string;
  minimumRole: WorkspaceRole;
  auth: Awaited<ReturnType<typeof requireAuthenticatedApiRequest>>;
  useCases: Pick<ServerUseCases, "projects">;
}) {
  try {
    return await executeProjectAccess(input);
  } catch (error) {
    if (isProjectAccessDeniedError(error)) {
      await recordServerAuditEvent({
        projectId: input.projectId,
        entityType: "project",
        entityId: input.projectId,
        action: "denied",
        actorUserId: input.auth.userId,
        actorIdentity: input.auth.identity,
        payload: {
          route: input.route,
          reason: error.code,
          requiredRole: input.minimumRole,
        },
      });
    }

    throw error;
  }
}

export async function requireProjectRouteContext<
  TParams extends {
    projectId: string;
  },
>(input: {
  route: string;
  params: Promise<TParams>;
  paramsSchema: z.ZodType<TParams>;
  minimumRole: WorkspaceRole;
  useCases: Pick<ServerUseCases, "projects">;
}) {
  const auth = await requireAuthenticatedApiRequest();
  const params = input.paramsSchema.parse(await input.params);
  const access = await requireProjectAccessForApi({
    route: input.route,
    projectId: params.projectId,
    minimumRole: input.minimumRole,
    auth,
    useCases: input.useCases,
  });

  return {
    auth,
    params,
    project: access.project,
    membership: access.membership,
  };
}
