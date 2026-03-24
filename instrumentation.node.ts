import { ensureServerOpenTelemetryRuntimeStarted } from "./src/server/observability/otel-runtime";

export function registerNodeInstrumentation() {
  ensureServerOpenTelemetryRuntimeStarted();
}
