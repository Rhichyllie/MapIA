import {
  apiErrorResponse,
  apiSuccessResponse,
  forbiddenResponse,
} from "@/src/server/app/api-response";
import { requireAuthenticatedApiRequest } from "@/src/server/app/api-route-guards";
import { resolveInternalObservabilityAccess } from "@/src/server/auth/internal-observability-access";
import {
  buildCreationTelemetryContextFromRequest,
  evaluateCreationTransitionGateWarnings,
  recordCreationTransitionSnapshotAccessDenied,
  recordCreationTransitionSnapshotAccessed,
} from "@/src/server/observability/creation-assistant-transition-telemetry";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedApiRequest();
    const requestContext = buildCreationTelemetryContextFromRequest(request);
    const access = resolveInternalObservabilityAccess(auth.identity);

    if (!access.allowed) {
      await recordCreationTransitionSnapshotAccessDenied({
        ownerIdentity: auth.identity,
        requestContext,
      });
      return forbiddenResponse(
        "Acesso restrito a perfis internos de observabilidade.",
      );
    }

    await evaluateCreationTransitionGateWarnings("manual");
    await recordCreationTransitionSnapshotAccessed({
      ownerIdentity: auth.identity,
      role: "internal",
      requestContext,
    });
    return apiSuccessResponse({
      evaluatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
