import type { Session } from "next-auth";
import { getLocale } from "next-intl/server";
import { getServerSession } from "next-auth";
import { redirect } from "@/src/i18n/navigation";
import { appRoutes } from "@/src/lib/routes";
import { authOptions } from "@/src/server/auth/options";
import {
  addServerTelemetryEvent,
  setServerTelemetryAttributes,
  withServerTelemetrySpan,
} from "@/src/server/observability/server-telemetry";

export async function getOptionalSession() {
  return await withServerTelemetrySpan(
    "auth.session.read",
    {
      attributes: {
        "auth.session.required": false,
        "auth.session.source": "server_optional",
      },
    },
    async (span) => {
      const session = await getServerSession(authOptions);
      setServerTelemetryAttributes(span, {
        "auth.session.present": Boolean(session),
      });
      addServerTelemetryEvent(
        span,
        session ? "auth.session.found" : "auth.session.missing",
      );
      return session;
    },
  );
}

export async function requireSession(): Promise<Session> {
  const session = await withServerTelemetrySpan(
    "auth.session.read",
    {
      attributes: {
        "auth.session.required": true,
        "auth.session.source": "server_required",
      },
    },
    async (span) => {
      const resolvedSession = await getServerSession(authOptions);
      setServerTelemetryAttributes(span, {
        "auth.session.present": Boolean(resolvedSession),
      });
      addServerTelemetryEvent(
        span,
        resolvedSession ? "auth.session.found" : "auth.session.missing",
      );
      return resolvedSession;
    },
  );

  if (!session) {
    const locale = await getLocale();
    redirect({ href: appRoutes.login, locale });
  }

  if (!session) {
    throw new Error("Missing authenticated session after redirect.");
  }

  return session;
}

export function requireSessionIdentity(session: Session): string {
  const identity = session.user?.email;

  if (!identity) {
    throw new Error(
      "Authenticated session is missing a user identity (email).",
    );
  }

  return identity;
}
