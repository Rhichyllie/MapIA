import { z } from "zod";

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(2).max(80),
  name: z.string().min(1).max(120),
  ownerIdentity: z.string().min(1).max(255).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;
