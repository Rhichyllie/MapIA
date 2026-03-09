import { z } from "zod";
import { GraphSnapshotSchema } from "@/src/domain";

export const SemanticModeSchema = z.enum(["operational", "technical"]);

export const ResolveSemanticPolicyInputSchema = z.object({
  projectId: z.string().uuid(),
  actorIdentity: z.string().email().optional(),
});

export const UpdateSemanticPolicyInputSchema = z.object({
  projectId: z.string().uuid(),
  actorIdentity: z.string().email().optional(),
  diagramType: z.string().trim().min(1).max(80).optional(),
  strictEnabled: z.boolean().optional(),
  enforceOnServer: z.boolean().optional(),
  allowTechOverride: z.boolean().optional(),
  requireOverrideReason: z.boolean().optional(),
  customRulesJson: z.record(z.string(), z.unknown()).optional(),
});

export const ValidateSemanticDraftInputSchema = z.object({
  projectId: z.string().uuid(),
  actorIdentity: z.string().email().optional(),
  mode: SemanticModeSchema.optional(),
  snapshot: GraphSnapshotSchema,
});

export const AuditWorkingSnapshotInputSchema = z.object({
  projectId: z.string().uuid(),
  actorIdentity: z.string().email().optional(),
  mode: SemanticModeSchema.optional(),
});

export type ResolveSemanticPolicyInput = z.infer<
  typeof ResolveSemanticPolicyInputSchema
>;
export type UpdateSemanticPolicyInput = z.infer<
  typeof UpdateSemanticPolicyInputSchema
>;
export type ValidateSemanticDraftInput = z.infer<
  typeof ValidateSemanticDraftInputSchema
>;
export type AuditWorkingSnapshotInput = z.infer<
  typeof AuditWorkingSnapshotInputSchema
>;
