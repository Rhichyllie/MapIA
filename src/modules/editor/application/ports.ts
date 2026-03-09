import type {
  SaveWorkingSnapshotRecordInput,
  WorkingSnapshotRecord,
} from "@/src/modules/graph/application";

export interface EditorSnapshotQueryPort {
  loadWorkingSnapshot(projectId: string): Promise<WorkingSnapshotRecord | null>;
}

export interface EditorSnapshotCommandPort {
  saveWorkingSnapshot(
    input: SaveWorkingSnapshotRecordInput,
  ): Promise<WorkingSnapshotRecord>;
}

export type EditorSnapshotGateway = EditorSnapshotQueryPort &
  EditorSnapshotCommandPort;
