import { PrismaClient } from "@prisma/client";
import { attachOpenTelemetryPrismaInstrumentation } from "../observability/prisma-otel-instrumentation";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

attachOpenTelemetryPrismaInstrumentation(prisma);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
