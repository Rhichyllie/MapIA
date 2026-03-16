import type {
  AssistantCreationSettings,
  AssistantDraft,
} from "@/src/modules/creation-assistant/domain";

export type ProjectCreationDraftState = {
  draft: AssistantDraft;
  version: number;
  updatedAt: Date;
  updatedByIdentity?: string;
};

export type ProjectCreationAppliedState = {
  settings: AssistantCreationSettings;
  version: number;
  appliedAt?: Date;
  appliedByIdentity?: string;
};

export type ProjectCreationSettingsSummary = {
  applied: ProjectCreationAppliedState | null;
  draftExists: boolean;
  draftVersion?: number;
  draftUpdatedAt?: Date;
};

export interface ProjectCreationStateRepository {
  findAppliedByProjectId(
    projectId: string,
  ): Promise<ProjectCreationAppliedState | null>;
  getSettingsSummaryByProjectId(
    projectId: string,
  ): Promise<ProjectCreationSettingsSummary>;
  findDraftByProjectId(projectId: string): Promise<ProjectCreationDraftState | null>;
  saveAppliedByProjectId(input: {
    projectId: string;
    settings: AssistantCreationSettings;
    appliedByIdentity?: string;
  }): Promise<ProjectCreationAppliedState>;
  saveDraftByProjectId(input: {
    projectId: string;
    draft: AssistantDraft;
    expectedVersion?: number;
    updatedByIdentity?: string;
  }): Promise<ProjectCreationDraftState>;
}
