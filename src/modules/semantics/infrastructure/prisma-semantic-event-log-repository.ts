import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AppendSemanticEventLogInput,
  SemanticEventLogRecord,
  SemanticEventLogRepository,
} from "@/src/modules/semantics/application";

type PrismaSemanticEventLogDelegate = PrismaClient["semanticEventLog"];

type SemanticEventLogRow =
  Awaited<ReturnType<PrismaSemanticEventLogDelegate["create"]>> extends infer T
    ? T
    : never;

function parseSemanticEventLogRow(
  row: NonNullable<SemanticEventLogRow>,
): SemanticEventLogRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    actorIdentity: row.actorIdentity ?? undefined,
    eventType: row.eventType,
    severity: row.severity ?? undefined,
    payloadJson:
      row.payloadJson && typeof row.payloadJson === "object"
        ? (row.payloadJson as Record<string, unknown>)
        : {},
    createdAt: row.createdAt,
  };
}

export class PrismaSemanticEventLogRepository implements SemanticEventLogRepository {
  constructor(private readonly delegate: PrismaSemanticEventLogDelegate) {}

  async append(input: AppendSemanticEventLogInput): Promise<SemanticEventLogRecord> {
    const row = await this.delegate.create({
      data: {
        projectId: input.projectId,
        actorIdentity: input.actorIdentity,
        eventType: input.eventType,
        severity: input.severity,
        payloadJson: input.payloadJson as Prisma.InputJsonObject,
      },
    });

    return parseSemanticEventLogRow(row);
  }
}
