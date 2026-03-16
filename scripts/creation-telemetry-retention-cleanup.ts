import { PrismaClient } from "@prisma/client";
import {
  parseCreationTransitionRetentionCleanupArgs,
  runCreationTransitionRetentionCleanup,
} from "../src/server/observability/creation-transition-retention-cleanup";

async function main() {
  const prisma = new PrismaClient();
  const args = parseCreationTransitionRetentionCleanupArgs(process.argv.slice(2));

  try {
    const result = await runCreationTransitionRetentionCleanup(
      prisma.creationTelemetryEvent,
      args,
    );

    console.log(
      JSON.stringify(
        result,
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "cleanup-failed");
  process.exitCode = error instanceof Error ? 2 : 1;
});
