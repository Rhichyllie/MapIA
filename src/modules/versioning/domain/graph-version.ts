import { z } from "zod";
import {
  GraphSnapshotSchema,
  ViewportSchema,
} from "@/src/modules/graph/domain";

export const GraphVersionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  label: z.string().max(200).optional(),
  snapshot: GraphSnapshotSchema,
  viewport: ViewportSchema,
  createdByIdentity: z.string().min(1).max(255).optional(),
  createdAt: z.date(),
});

export type GraphVersion = z.infer<typeof GraphVersionSchema>;
