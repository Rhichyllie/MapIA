import { unauthorizedError } from "@/src/server/app/api-response";
import { assertAuthRuntimeReady } from "@/src/server/auth/auth-runtime";
import {
  isRecoverableSessionAuthError,
  requireSessionActor,
} from "@/src/server/auth/session";
import { getAuthOptions } from "@/src/server/auth/options";
import {
  addServerTelemetryEvent,
  setServerTelemetryAttributes,
  withServerTelemetrySpan,
} from "@/src/server/observability/server-telemetry";
import { getServerSession } from "next-auth";

export async function getApiSessionIdentity() {
  assertAuthRuntimeReady();

  return await withServerTelemetrySpan(
    "auth.session.api_identity",
    {
      attributes: {
        "auth.session.required": false,
        "auth.session.source": "api",
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

        const actor = await requireSessionActor(session);
        addServerTelemetryEvent(span, "auth.session.identity_resolved", {
          "auth.identity.present": true,
        });

        return {
          session,
          actor,
          userId: actor.userId,
          identity: actor.email,
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

export async function requireApiSessionIdentity() {
  const auth = await getApiSessionIdentity();

  if (!auth) {
    throw unauthorizedError();
  }

  return auth;
}
