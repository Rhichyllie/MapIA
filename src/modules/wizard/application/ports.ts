import type {
  WizardDraft,
  WizardDraftPayload,
  WizardDraftStatus,
  WizardStep,
} from "@/src/modules/wizard/domain";

export type SaveWizardDraftRecord = {
  projectId: string;
  currentStep: WizardStep;
  status: WizardDraftStatus;
  payload: WizardDraftPayload;
  lastError?: string;
};

export interface WizardDraftRepository {
  getByProjectId(projectId: string): Promise<WizardDraft | null>;
  save(input: SaveWizardDraftRecord): Promise<WizardDraft>;
}
