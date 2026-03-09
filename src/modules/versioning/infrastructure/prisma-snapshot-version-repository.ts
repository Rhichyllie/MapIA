import type { Prisma, PrismaClient } from "@prisma/client";
import { GraphSnapshotSchema } from "@/src/domain";
import { validateGraphSnapshotInvariants } from "@/src/modules/graph/domain";
import {
  EditorSnapshotVersionSchema,
  EditorSnapshotVersionSummarySchema,
  type EditorSnapshotVersion,
  type EditorSnapshotVersionSummary,
} from "@/src/modules/versioning/domain";
import type {
  CreateSnapshotVersionRecordInput,
  SnapshotVersionRepository,
} from "@/src/modules/versioning/application";

type PrismaEditorSnapshotVersionDelegate = PrismaClient["editorSnapshotVersion"];

type EditorSnapshotVersionRow =
  Awaited<ReturnType<PrismaEditorSnapshotVersionDelegate["findFirst"]>> extends infer T
    ? T
    : never;

function parseSnapshotBoundary(snapshot: unknown) {
  return GraphSnapshotSchema.parse(snapshot);
}

function parseEditorSnapshotVersionRow(
  row: NonNullable<EditorSnapshotVersionRow>,
): EditorSnapshotVersion {
  const snapshot = validateGraphSnapshotInvariants(parseSnapshotBoundary(row.snapshot));

  return EditorSnapshotVersionSchema.parse({
    ...row,
    label: row.label ?? undefined,
    snapshot,
  });
}

function toSummary(version: EditorSnapshotVersion): EditorSnapshotVersionSummary {
  return EditorSnapshotVersionSummarySchema.parse({
    id: version.id,
    projectId: version.projectId,
    label: version.label,
    origin: version.origin,
    createdAt: version.createdAt,
  });
}

export class PrismaSnapshotVersionRepository implements SnapshotVersionRepository {
  constructor(private readonly delegate: PrismaEditorSnapshotVersionDelegate) {}

  async create(
    input: CreateSnapshotVersionRecordInput,
  ): Promise<EditorSnapshotVersion> {
    const snapshot = validateGraphSnapshotInvariants(
      parseSnapshotBoundary(input.snapshot),
    );

    const row = await this.delegate.create({
      data: {
        projectId: input.projectId,
        label: input.label,
        origin: input.origin ?? "manual",
        snapshot: snapshot as unknown as Prisma.InputJsonObject,
      },
    });

    return parseEditorSnapshotVersionRow(row);
  }

  async listByProject(projectId: string): Promise<EditorSnapshotVersionSummary[]> {
    const rows = await this.delegate.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    return rows.map((row) => toSummary(parseEditorSnapshotVersionRow(row)));
  }

  async getById(
    projectId: string,
    versionId: string,
  ): Promise<EditorSnapshotVersion | null> {
    const row = await this.delegate.findFirst({
      where: {
        id: versionId,
        projectId,
      },
    });

    return row ? parseEditorSnapshotVersionRow(row) : null;
  }
}
