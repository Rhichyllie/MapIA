import type { Prisma, PrismaClient } from "@prisma/client";
import { GraphSnapshotSchema, ViewportStateSchema } from "@/src/domain";
import { GraphVersionSchema } from "@/src/modules/versioning/domain";
import type {
  SaveWorkingSnapshotRecordInput,
  WorkingSnapshotRecord,
  WorkingSnapshotRepository,
} from "@/src/modules/graph/application";

type PrismaGraphVersionDelegate = PrismaClient["graphVersion"];

type GraphVersionRow =
  Awaited<ReturnType<PrismaGraphVersionDelegate["findUnique"]>> extends infer T
    ? T
    : never;

export function parseSnapshotBoundary(snapshot: unknown) {
  return GraphSnapshotSchema.parse(snapshot);
}

function parseGraphVersionRow(
  row: NonNullable<GraphVersionRow>,
): WorkingSnapshotRecord {
  const snapshot = parseSnapshotBoundary(row.snapshot);
  ViewportStateSchema.parse(row.viewport);

  const parsed = GraphVersionSchema.parse({
    ...row,
    snapshot,
    viewport: row.viewport,
  });

  return {
    id: parsed.id,
    projectId: parsed.projectId,
    versionNumber: parsed.versionNumber,
    label: parsed.label,
    snapshot: parsed.snapshot,
    createdByIdentity: parsed.createdByIdentity,
    createdAt: parsed.createdAt,
  };
}

export class PrismaWorkingSnapshotRepository implements WorkingSnapshotRepository {
  constructor(private readonly delegate: PrismaGraphVersionDelegate) {}

  async load(projectId: string): Promise<WorkingSnapshotRecord | null> {
    const row = await this.delegate.findUnique({
      where: {
        projectId_versionNumber: {
          projectId,
          versionNumber: 1,
        },
      },
    });

    return row ? parseGraphVersionRow(row) : null;
  }

  async save(
    input: SaveWorkingSnapshotRecordInput,
  ): Promise<WorkingSnapshotRecord> {
    const snapshot = parseSnapshotBoundary(input.snapshot);
    const viewport = ViewportStateSchema.parse(snapshot.viewport);

    const row = await this.delegate.upsert({
      where: {
        projectId_versionNumber: {
          projectId: input.projectId,
          versionNumber: 1,
        },
      },
      create: {
        projectId: input.projectId,
        versionNumber: 1,
        label: input.label ?? "fase1-working-v1",
        snapshot: snapshot as unknown as Prisma.InputJsonObject,
        viewport: viewport as unknown as Prisma.InputJsonObject,
        createdByIdentity: input.actorIdentity,
      },
      update: {
        label: input.label ?? "fase1-working-v1",
        snapshot: snapshot as unknown as Prisma.InputJsonObject,
        viewport: viewport as unknown as Prisma.InputJsonObject,
        createdByIdentity: input.actorIdentity,
      },
    });

    return parseGraphVersionRow(row);
  }
}
