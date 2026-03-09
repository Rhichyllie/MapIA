import { z } from "zod";
import { GraphSnapshotSchema } from "@/src/domain";

export const SnapshotVersionOriginSchema = z.enum(["manual"]);

export const EditorSnapshotVersionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  snapshot: GraphSnapshotSchema,
  label: z.string().min(1).max(200).optional(),
  origin: SnapshotVersionOriginSchema,
  createdAt: z.date(),
});

export const EditorSnapshotVersionSummarySchema = EditorSnapshotVersionSchema.omit({
  snapshot: true,
});

export type SnapshotVersionOrigin = z.infer<typeof SnapshotVersionOriginSchema>;
export type EditorSnapshotVersion = z.infer<typeof EditorSnapshotVersionSchema>;
export type EditorSnapshotVersionSummary = z.infer<
  typeof EditorSnapshotVersionSummarySchema
>;
