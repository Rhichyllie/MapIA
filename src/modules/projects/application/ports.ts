import type { Project } from "@/src/modules/projects/domain";

export type CreateProjectRecord = {
  workspaceId: string;
  slug: string;
  name: string;
  description?: string;
  template: Project["template"];
};

export type UpdateProjectRecord = {
  projectId: string;
  name?: string;
  description?: string;
  template?: Project["template"];
};

export interface ProjectRepository {
  create(input: CreateProjectRecord): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  findByWorkspaceIdAndSlug(
    workspaceId: string,
    slug: string,
  ): Promise<Project | null>;
  listByWorkspaceId(workspaceId: string): Promise<Project[]>;
  updateMetadata(input: UpdateProjectRecord): Promise<Project>;
}
