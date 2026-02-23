import { z } from "zod";

export const CreateWorkspaceInputSchema = z.object({
  ownerIdentity: z.string().email(),
  name: z.string().min(1).max(120),
  slug: z.string().min(2).max(80).optional(),
});

export const ListWorkspacesForIdentityInputSchema = z.object({
  ownerIdentity: z.string().email(),
});

export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceInputSchema>;
export type ListWorkspacesForIdentityInput = z.infer<
  typeof ListWorkspacesForIdentityInputSchema
>;
