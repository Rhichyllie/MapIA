import { getServerSession } from "next-auth";
import { unauthorizedError } from "@/src/server/app/api-response";
import { authOptions } from "@/src/server/auth/options";
import { requireSessionIdentity } from "@/src/server/auth/session";
import {
  addServerTelemetryEvent,
  setServerTelemetryAttributes,
  withServerTelemetrySpan,
} from "@/src/server/observability/server-telemetry";

export async function getApiSessionIdentity() {
  return await withServerTelemetrySpan(
    "auth.session.api_identity",
    {
      attributes: {
        "auth.session.required": false,
        "auth.session.source": "api",
      },
    },
    async (span) => {
      const session = await getServerSession(authOptions);
      setServerTelemetryAttributes(span, {
        "auth.session.present": Boolean(session),
      });

      if (!session) {
        addServerTelemetryEvent(span, "auth.session.missing");
        return null;
      }

      const identity = requireSessionIdentity(session);
      addServerTelemetryEvent(span, "auth.session.identity_resolved", {
        "auth.identity.present": true,
      });
      return {
        session,
        identity,
      };
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
