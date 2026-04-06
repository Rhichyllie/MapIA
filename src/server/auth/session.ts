import type { Session } from "next-auth";
import { getLocale } from "next-intl/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { AppError, isAppError } from "@/src/lib/app-error";
import { redirect } from "@/src/i18n/navigation";
import { appRoutes } from "@/src/lib/routes";
import { getAuthOptions } from "@/src/server/auth/options";
import { findActiveAppUserById, type AuthenticatedActor } from "./auth-user-store";
import { resolveAuthRuntimeConfig } from "./auth-runtime";
import {
  addServerTelemetryEvent,
  setServerTelemetryAttributes,
  withServerTelemetrySpan,
} from "@/src/server/observability/server-telemetry";

type AuthenticatedSessionContext = {
  session: Session;
  actor: AuthenticatedActor;
};

const sessionUserIdSchema = z.string().uuid();
const sessionIdentitySchema = z.string().email();
const recoverableSessionErrorCodes = new Set([
  "AUTH_JWT_CLAIMS_MISSING",
  "AUTH_SESSION_CLAIMS_MISSING",
  "AUTH_SESSION_IDENTITY_MISMATCH",
  "AUTH_SESSION_IDENTITY_MISSING",
  "AUTH_SESSION_USER_ID_MISSING",
  "AUTH_SESSION_USER_INVALID",
]);

function buildSessionInvalidError(message: string, code: string, status = 401) {
  return new AppError(message, {
    code,
    status,
  });
}

export function requireSessionIdentity(session: Session): string {
  const identity = session.user?.email?.trim().toLowerCase();

  if (!identity || !sessionIdentitySchema.safeParse(identity).success) {
    throw buildSessionInvalidError(
      "Sessao autenticada sem email utilizavel.",
      "AUTH_SESSION_IDENTITY_MISSING",
    );
  }

  return identity;
}

export function requireSessionUserId(session: Session): string {
  const userId = session.user?.id?.trim();

  if (!userId || !sessionUserIdSchema.safeParse(userId).success) {
    throw buildSessionInvalidError(
      "Sessao autenticada sem userId interno do MapIA.",
      "AUTH_SESSION_USER_ID_MISSING",
    );
  }

  return userId;
}

async function resolveAuthenticatedActorFromSession(
  session: Session,
): Promise<AuthenticatedActor> {
  const userId = requireSessionUserId(session);
  const identity = requireSessionIdentity(session);
  const authProvider = session.user?.authProvider?.trim();
  const authMode = session.user?.authMode;

  if (!authProvider || !authMode) {
    throw buildSessionInvalidError(
      "Sessao autenticada sem claims de provedor ou modo de auth.",
      "AUTH_SESSION_CLAIMS_MISSING",
    );
  }

  const user = await findActiveAppUserById(userId);

  if (!user) {
    throw buildSessionInvalidError(
      "Sessao autenticada aponta para um usuario inexistente ou desativado.",
      "AUTH_SESSION_USER_INVALID",
      403,
    );
  }

  if (user.email.trim().toLowerCase() !== identity) {
    throw buildSessionInvalidError(
      "Sessao autenticada nao coincide com o usuario interno ativo.",
      "AUTH_SESSION_IDENTITY_MISMATCH",
    );
  }

  return {
    userId: user.id,
    email: user.email || identity,
    ...(user.displayName ? { displayName: user.displayName } : {}),
    providerId: authProvider,
    authMode,
  };
}

export function isRecoverableSessionAuthError(error: unknown): error is AppError {
  return isAppError(error) && recoverableSessionErrorCodes.has(error.code);
}

async function readAuthenticatedSession(
  source: "server_optional" | "server_required",
): Promise<AuthenticatedSessionContext | null> {
  return await withServerTelemetrySpan(
    "auth.session.read",
    {
      attributes: {
        "auth.session.required": source === "server_required",
        "auth.session.source": source,
      },
    },
    async (span) => {
      try {
        const session = await getServerSession(getAuthOptions());
        setServerTelemetryAttributes(span, {
          "auth.session.present": Boolean(session),
        });

        if (!session) {
          addServerTelemetryEvent(span, "auth.session.missing");
          return null;
        }

        const actor = await resolveAuthenticatedActorFromSession(session);
        addServerTelemetryEvent(span, "auth.session.actor_resolved", {
          "auth.identity.present": true,
        });

        return {
          session,
          actor,
        };
      } catch (error) {
        if (isRecoverableSessionAuthError(error)) {
          addServerTelemetryEvent(span, "auth.session.invalid", {
            "auth.session.error_code": error.code,
          });
          return null;
        }

        throw error;
      }
    },
  );
}

export async function getOptionalAuthenticatedSession() {
  if (resolveAuthRuntimeConfig().mode === "misconfigured") {
    return null;
  }

  return await readAuthenticatedSession("server_optional");
}

export async function getOptionalSession() {
  const authenticatedSession = await getOptionalAuthenticatedSession();
  return authenticatedSession?.session ?? null;
}

export async function requireAuthenticatedSession(): Promise<AuthenticatedSessionContext> {
  if (resolveAuthRuntimeConfig().mode === "misconfigured") {
    const locale = await getLocale();
    redirect({ href: appRoutes.login, locale });
  }

  const authenticatedSession = await readAuthenticatedSession("server_required");

  if (!authenticatedSession) {
    const locale = await getLocale();
    redirect({ href: appRoutes.login, locale });
  }

  if (!authenticatedSession) {
    throw new Error("Missing authenticated session after redirect.");
  }

  return authenticatedSession;
}

export async function requireSession(): Promise<Session> {
  const { session } = await requireAuthenticatedSession();
  return session;
}

export async function requireSessionActor(session: Session) {
  return await resolveAuthenticatedActorFromSession(session);
}
