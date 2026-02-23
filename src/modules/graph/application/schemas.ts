import { z } from "zod";
import { GraphSnapshotSchema } from "@/src/domain";

export const LoadWorkingSnapshotInputSchema = z.object({
  projectId: z.string().uuid(),
});

export const SaveWorkingSnapshotInputSchema = z.object({
  projectId: z.string().uuid(),
  actorIdentity: z.string().email().optional(),
  label: z.string().max(200).optional(),
  snapshot: GraphSnapshotSchema,
});

export type LoadWorkingSnapshotInput = z.infer<
  typeof LoadWorkingSnapshotInputSchema
>;
export type SaveWorkingSnapshotInput = z.infer<
  typeof SaveWorkingSnapshotInputSchema
>;
