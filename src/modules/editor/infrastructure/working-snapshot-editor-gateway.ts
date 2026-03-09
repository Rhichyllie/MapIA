import type {
  EditorSnapshotGateway,
} from "@/src/modules/editor/application";
import type {
  SaveWorkingSnapshotRecordInput,
  WorkingSnapshotRecord,
  WorkingSnapshotRepository,
} from "@/src/modules/graph/application";

export class WorkingSnapshotEditorGateway implements EditorSnapshotGateway {
  constructor(private readonly repository: WorkingSnapshotRepository) {}

  loadWorkingSnapshot(projectId: string): Promise<WorkingSnapshotRecord | null> {
    return this.repository.load(projectId);
  }

  saveWorkingSnapshot(
    input: SaveWorkingSnapshotRecordInput,
  ): Promise<WorkingSnapshotRecord> {
    return this.repository.save(input);
  }
}
