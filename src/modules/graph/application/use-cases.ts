import { withTelemetrySpan } from "@/src/lib/telemetry-span";
import type { WorkingSnapshotRecord } from "./ports";
import type { WorkingSnapshotRepository } from "./ports";
import {
  type LoadWorkingSnapshotInput,
  LoadWorkingSnapshotInputSchema,
  type SaveWorkingSnapshotInput,
  SaveWorkingSnapshotInputSchema,
} from "./schemas";
type GraphUseCaseDeps = {
  workingSnapshotRepository: WorkingSnapshotRepository;
};

export class LoadWorkingSnapshotUseCase {
  constructor(private readonly deps: GraphUseCaseDeps) {}

  async execute(
    input: LoadWorkingSnapshotInput,
  ): Promise<WorkingSnapshotRecord | null> {
    return await withTelemetrySpan(
      "graph.snapshot.read",
      {
        attributes: {
          "graph.snapshot.source": "working_snapshot_repository",
        },
      },
      async (span) => {
        const parsed = LoadWorkingSnapshotInputSchema.parse(input);
        span.setAttribute("graph.snapshot.project_id", parsed.projectId);
        const snapshot = await this.deps.workingSnapshotRepository.load(
          parsed.projectId,
        );
        span.setAttribute("graph.snapshot.found", Boolean(snapshot));
        return snapshot;
      },
    );
  }
}

export class SaveWorkingSnapshotUseCase {
  constructor(private readonly deps: GraphUseCaseDeps) {}

  async execute(
    input: SaveWorkingSnapshotInput,
  ): Promise<WorkingSnapshotRecord> {
    const parsed = SaveWorkingSnapshotInputSchema.parse(input);

    return this.deps.workingSnapshotRepository.save({
      projectId: parsed.projectId,
      snapshot: parsed.snapshot,
      actorIdentity: parsed.actorIdentity,
      label: parsed.label,
      expectedRevision: parsed.expectedRevision,
    });
  }
}
