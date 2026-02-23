import type { PrismaClient } from "@prisma/client";
import {
  WizardDraftPayloadSchema,
  WizardDraftSchema,
  type WizardDraft,
} from "@/src/modules/wizard/domain";
import type { WizardDraftRepository } from "@/src/modules/wizard/application";

type PrismaWizardDraftDelegate = PrismaClient["wizardDraft"];

function toDomain(row: {
  id: string;
  projectId: string;
  status: string;
  currentStep: string;
  payload: unknown;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): WizardDraft {
  const payload = WizardDraftPayloadSchema.parse(row.payload);

  return WizardDraftSchema.parse({
    ...row,
    payload,
    lastError: row.lastError ?? undefined,
  });
}

export class PrismaWizardDraftRepository implements WizardDraftRepository {
  constructor(private readonly delegate: PrismaWizardDraftDelegate) {}

  async getByProjectId(projectId: string): Promise<WizardDraft | null> {
    const row = await this.delegate.findUnique({
      where: { projectId },
    });

    return row ? toDomain(row) : null;
  }

  async save(input: {
    projectId: string;
    currentStep:
      | "template"
      | "diagram_type"
      | "data_source"
      | "config"
      | "review";
    status: "draft" | "validating" | "generating" | "ready" | "error";
    payload: WizardDraft["payload"];
    lastError?: string;
  }): Promise<WizardDraft> {
    const payload = WizardDraftPayloadSchema.parse(input.payload);

    const row = await this.delegate.upsert({
      where: { projectId: input.projectId },
      create: {
        projectId: input.projectId,
        currentStep: input.currentStep,
        status: input.status,
        payload,
        lastError: input.lastError,
      },
      update: {
        currentStep: input.currentStep,
        status: input.status,
        payload,
        lastError: input.lastError ?? null,
      },
    });

    return toDomain(row);
  }
}
