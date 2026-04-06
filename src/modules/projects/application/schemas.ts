import { z } from "zod";
import { WorkspaceRoleSchema } from "@/src/modules/workspaces/domain";
import { ProjectTemplateSchema } from "@/src/modules/projects/domain";

export const CreateProjectInputSchema = z.object({
  actorUserId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().or(z.literal("")),
  template: ProjectTemplateSchema,
  slug: z.string().min(2).max(80).optional().or(z.literal("")),
});

export const ListProjectsByWorkspaceInputSchema = z.object({
  actorUserId: z.string().uuid(),
  workspaceId: z.string().uuid(),
});

export const GetProjectAccessInputSchema = z.object({
  actorUserId: z.string().uuid(),
  projectId: z.string().uuid(),
  minimumRole: WorkspaceRoleSchema.default("viewer"),
});

export const UpdateProjectMetadataInputSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  template: ProjectTemplateSchema.optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;
export type ListProjectsByWorkspaceInput = z.infer<
  typeof ListProjectsByWorkspaceInputSchema
>;
export type GetProjectAccessInput = z.infer<typeof GetProjectAccessInputSchema>;
export type UpdateProjectMetadataInput = z.infer<
  typeof UpdateProjectMetadataInputSchema
>;
