import { z } from "zod";

export const ProjectTemplateSchema = z.enum([
  "sitemap",
  "flowchart",
  "erd",
  "graph",
]);

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  slug: z.string().min(2).max(80),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  // Legacy compatibility only. Canonical diagram identity lives in the
  // working/versioned snapshot via diagramType + diagramView.
  template: ProjectTemplateSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ProjectTemplate = z.infer<typeof ProjectTemplateSchema>;
export type Project = z.infer<typeof ProjectSchema>;
