import type { GraphSnapshot } from "@/src/domain";

export type WorkingSnapshotRecord = {
  id: string;
  projectId: string;
  versionNumber: number;
  label?: string;
  snapshot: GraphSnapshot;
  createdByIdentity?: string;
  createdAt: Date;
};

export type SaveWorkingSnapshotRecordInput = {
  projectId: string;
  snapshot: GraphSnapshot;
  actorIdentity?: string;
  label?: string;
};

export interface WorkingSnapshotRepository {
  load(projectId: string): Promise<WorkingSnapshotRecord | null>;
  save(input: SaveWorkingSnapshotRecordInput): Promise<WorkingSnapshotRecord>;
}
