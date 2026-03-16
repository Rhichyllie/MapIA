import { z } from "zod";
import {
  AssistantCreationSettingsSchema,
  AssistantDraftSchema,
} from "@/src/modules/creation-assistant/domain";

export const CreateProjectWithAssistantInputSchema = z.object({
  ownerIdentity: z.string().email(),
  draft: AssistantDraftSchema,
});

export const ApplyAssistantDraftToProjectInputSchema = z.object({
  ownerIdentity: z.string().email(),
  projectId: z.string().uuid(),
  draft: AssistantDraftSchema,
});

export const ApplyProjectCreationInputSchema = z.object({
  ownerIdentity: z.string().email(),
  projectId: z.string().uuid(),
  createInitialMap: z.boolean().default(true),
  draft: AssistantDraftSchema.optional(),
});

export const GetProjectCreationSettingsInputSchema = z.object({
  ownerIdentity: z.string().email(),
  projectId: z.string().uuid(),
});

export const GetProjectCreationDraftInputSchema = z.object({
  ownerIdentity: z.string().email(),
  projectId: z.string().uuid(),
});

export const SaveProjectCreationSettingsInputSchema = z.object({
  ownerIdentity: z.string().email(),
  projectId: z.string().uuid(),
  settings: AssistantCreationSettingsSchema,
});

export const SaveProjectCreationDraftInputSchema = z.object({
  ownerIdentity: z.string().email(),
  projectId: z.string().uuid(),
  draft: AssistantDraftSchema,
  expectedVersion: z.number().int().positive().optional(),
});

export type CreateProjectWithAssistantInput = z.infer<
  typeof CreateProjectWithAssistantInputSchema
>;
export type ApplyAssistantDraftToProjectInput = z.infer<
  typeof ApplyAssistantDraftToProjectInputSchema
>;
export type GetProjectCreationSettingsInput = z.infer<
  typeof GetProjectCreationSettingsInputSchema
>;
export type SaveProjectCreationSettingsInput = z.infer<
  typeof SaveProjectCreationSettingsInputSchema
>;
export type GetProjectCreationDraftInput = z.infer<
  typeof GetProjectCreationDraftInputSchema
>;
export type SaveProjectCreationDraftInput = z.infer<
  typeof SaveProjectCreationDraftInputSchema
>;
export type ApplyProjectCreationInput = z.infer<
  typeof ApplyProjectCreationInputSchema
>;
