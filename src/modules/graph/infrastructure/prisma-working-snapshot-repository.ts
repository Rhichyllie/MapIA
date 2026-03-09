import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "@/src/lib/app-error";
import { GraphSnapshotSchema, ViewportStateSchema } from "@/src/domain";
import { validateGraphSnapshotInvariants } from "@/src/modules/graph/domain";
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

function readRevisionValue(row: { revision?: unknown }) {
  return typeof row.revision === "number" ? row.revision : 1;
}

function parseGraphVersionRow(
  row: NonNullable<GraphVersionRow>,
): WorkingSnapshotRecord {
  const normalizedRow = { ...row, revision: readRevisionValue(row) };
  const snapshot = validateGraphSnapshotInvariants(parseSnapshotBoundary(row.snapshot));
  ViewportStateSchema.parse(row.viewport);

  const parsed = GraphVersionSchema.parse({
    ...normalizedRow,
    snapshot,
    viewport: normalizedRow.viewport,
  });

  return {
    id: parsed.id,
    projectId: parsed.projectId,
    versionNumber: parsed.versionNumber,
    revision: parsed.revision,
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
    const snapshot = validateGraphSnapshotInvariants(
      parseSnapshotBoundary(input.snapshot),
    );
    const viewport = ViewportStateSchema.parse(snapshot.viewport);
    const row = await this.delegate.findUnique({
      where: {
        projectId_versionNumber: {
          projectId: input.projectId,
          versionNumber: 1,
        },
      },
    });

    if (!row) {
      if (
        input.expectedRevision !== undefined &&
        input.expectedRevision !== 0
      ) {
        throw new AppError(
          "Conflito de revisao: snapshot atual diferente da revisao esperada.",
          {
            code: "CONFLICT",
            status: 409,
            details: {
              currentRevision: 0,
              expectedRevision: input.expectedRevision,
            },
          },
        );
      }

      const createdRow = await this.delegate.create({
        data: {
          projectId: input.projectId,
          versionNumber: 1,
          revision: 1,
          label: input.label ?? "fase1-working-v1",
          snapshot: snapshot as unknown as Prisma.InputJsonObject,
          viewport: viewport as unknown as Prisma.InputJsonObject,
          createdByIdentity: input.actorIdentity,
        },
      });

      return parseGraphVersionRow(createdRow);
    }

    const currentRevision = readRevisionValue(row);
    const nextLabel = input.label ?? row.label ?? "fase1-working-v1";

    if (input.expectedRevision !== undefined) {
      const updated = await this.delegate.updateMany({
        where: {
          projectId: input.projectId,
          versionNumber: 1,
          revision: input.expectedRevision,
        },
        data: {
          label: nextLabel,
          snapshot: snapshot as unknown as Prisma.InputJsonObject,
          viewport: viewport as unknown as Prisma.InputJsonObject,
          createdByIdentity: input.actorIdentity,
          revision: {
            increment: 1,
          },
        },
      });

      if (updated.count === 0) {
        const latest = await this.delegate.findUnique({
          where: {
            projectId_versionNumber: {
              projectId: input.projectId,
              versionNumber: 1,
            },
          },
        });

        const latestRevision = latest ? readRevisionValue(latest) : currentRevision;

        throw new AppError(
          "Conflito de revisao: snapshot atual diferente da revisao esperada.",
          {
            code: "CONFLICT",
            status: 409,
            details: {
              currentRevision: latestRevision,
              expectedRevision: input.expectedRevision,
            },
          },
        );
      }

      const persisted = await this.delegate.findUnique({
        where: {
          projectId_versionNumber: {
            projectId: input.projectId,
            versionNumber: 1,
          },
        },
      });

      if (!persisted) {
        throw new AppError("Snapshot de trabalho nao encontrado apos atualizacao.", {
          code: "WORKING_SNAPSHOT_NOT_FOUND",
          status: 404,
        });
      }

      return parseGraphVersionRow(persisted);
    }

    const updatedRow = await this.delegate.update({
      where: {
        projectId_versionNumber: {
          projectId: input.projectId,
          versionNumber: 1,
        },
      },
      data: {
        label: nextLabel,
        snapshot: snapshot as unknown as Prisma.InputJsonObject,
        viewport: viewport as unknown as Prisma.InputJsonObject,
        createdByIdentity: input.actorIdentity,
        revision: {
          increment: 1,
        },
      },
    });

    return parseGraphVersionRow(updatedRow);
  }
}
