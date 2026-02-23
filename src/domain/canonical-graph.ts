import { z } from "zod";

export const ExternalSystemSchema = z.enum(["manual", "postgres", "prisma"]);

export const ExternalRefSchema = z.object({
  id: z.string().uuid(),
  system: ExternalSystemSchema,
  externalId: z.string().min(1).max(255),
  locator: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const NodeKindSchema = z.enum([
  "workspace",
  "project",
  "entity",
  "page",
  "flow-step",
  "note",
]);

export const NodeSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  kind: NodeKindSchema,
  label: z.string().min(1).max(200),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: z.record(z.string(), z.unknown()).default({}),
  externalRefs: z.array(ExternalRefSchema).default([]),
});

export const EdgeKindSchema = z.enum([
  "contains",
  "references",
  "depends-on",
  "flows-to",
  "relates-to",
]);

export const EdgeSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  sourceNodeId: z.string().uuid(),
  targetNodeId: z.string().uuid(),
  kind: EdgeKindSchema,
  label: z.string().max(200).optional(),
  data: z.record(z.string(), z.unknown()).default({}),
  externalRefs: z.array(ExternalRefSchema).default([]),
});

export const ViewportStateSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number().positive(),
});

// Backward-compatible alias used by early Fase 0 modules.
export const ViewportSchema = ViewportStateSchema;

export const GraphSnapshotSchema = z.object({
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  viewport: ViewportStateSchema,
});

export type ExternalSystem = z.infer<typeof ExternalSystemSchema>;
export type ExternalRef = z.infer<typeof ExternalRefSchema>;
export type NodeKind = z.infer<typeof NodeKindSchema>;
export type EdgeKind = z.infer<typeof EdgeKindSchema>;
export type Node = z.infer<typeof NodeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type ViewportState = z.infer<typeof ViewportStateSchema>;
export type Viewport = ViewportState;
export type GraphSnapshot = z.infer<typeof GraphSnapshotSchema>;
