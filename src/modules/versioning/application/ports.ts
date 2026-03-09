import type { GraphSnapshot } from "@/src/domain";
import type {
  EditorSnapshotVersion,
  EditorSnapshotVersionSummary,
  SnapshotVersionOrigin,
} from "@/src/modules/versioning/domain";

export type CreateSnapshotVersionRecordInput = {
  projectId: string;
  snapshot: GraphSnapshot;
  label?: string;
  origin?: SnapshotVersionOrigin;
};

export interface SnapshotVersionRepository {
  create(input: CreateSnapshotVersionRecordInput): Promise<EditorSnapshotVersion>;
  listByProject(projectId: string): Promise<EditorSnapshotVersionSummary[]>;
  getById(
    projectId: string,
    versionId: string,
  ): Promise<EditorSnapshotVersion | null>;
}
