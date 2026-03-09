import { z } from "zod";
import { SnapshotVersionOriginSchema } from "@/src/modules/versioning/domain";
import { MIN_SEMANTIC_OVERRIDE_REASON_LENGTH } from "@/src/modules/semantics/domain";

export const CreateSnapshotVersionFromWorkingSnapshotInputSchema = z.object({
  projectId: z.string().uuid(),
  label: z.string().min(1).max(200).optional(),
  origin: SnapshotVersionOriginSchema.optional(),
});

export const ListSnapshotVersionsInputSchema = z.object({
  projectId: z.string().uuid(),
});

export const GetSnapshotVersionByIdInputSchema = z.object({
  projectId: z.string().uuid(),
  versionId: z.string().uuid(),
});

export const DiffWorkingSnapshotAgainstVersionInputSchema = z.object({
  projectId: z.string().uuid(),
  versionId: z.string().uuid(),
});

export const RestoreWorkingSnapshotFromVersionInputSchema = z.object({
  projectId: z.string().uuid(),
  versionId: z.string().uuid(),
  actorIdentity: z.string().min(1).max(255).optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
  semanticMode: z.enum(["operational", "technical"]).optional(),
  allowSemanticOverride: z.boolean().optional(),
  overrideReason: z
    .string()
    .trim()
    .min(MIN_SEMANTIC_OVERRIDE_REASON_LENGTH)
    .max(500)
    .optional(),
});

export type CreateSnapshotVersionFromWorkingSnapshotInput = z.infer<
  typeof CreateSnapshotVersionFromWorkingSnapshotInputSchema
>;
export type ListSnapshotVersionsInput = z.infer<
  typeof ListSnapshotVersionsInputSchema
>;
export type GetSnapshotVersionByIdInput = z.infer<
  typeof GetSnapshotVersionByIdInputSchema
>;
export type DiffWorkingSnapshotAgainstVersionInput = z.infer<
  typeof DiffWorkingSnapshotAgainstVersionInputSchema
>;
export type RestoreWorkingSnapshotFromVersionInput = z.infer<
  typeof RestoreWorkingSnapshotFromVersionInputSchema
>;
