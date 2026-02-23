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
    const parsed = LoadWorkingSnapshotInputSchema.parse(input);
    return this.deps.workingSnapshotRepository.load(parsed.projectId);
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
    });
  }
}
