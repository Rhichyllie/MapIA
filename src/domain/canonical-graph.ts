import { z } from "zod";
import {
  normalizeDiagramIdentity,
  type CanonicalDiagramType,
  type DiagramView,
} from "./diagram-identity";

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

const GraphSnapshotRawSchema = z.object({
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  viewport: ViewportStateSchema,
  // Canonical structural identity of the snapshot. Legacy payloads are
  // normalized at parse time and should stop writing ambiguous values here.
  diagramType: z.string().trim().min(1).max(80).optional(),
  // Explicit visual projection for the current snapshot. This is not the
  // canonical model identity and exists to keep presentation separate.
  diagramView: z.string().trim().min(1).max(80).optional(),
  layoutOptions: z.record(z.string(), z.unknown()).optional(),
  rootNodeName: z.string().max(120).optional(),
  allowReapplyLayout: z.boolean().optional(),
});

export const GraphSnapshotSchema = GraphSnapshotRawSchema.superRefine(
  (value, ctx) => {
    const normalizedIdentity = normalizeDiagramIdentity({
      diagramType: value.diagramType,
      diagramView: value.diagramView,
    });

    if (!normalizedIdentity.ok) {
      ctx.addIssue({
        code: "custom",
        path: ["diagramType"],
        message: normalizedIdentity.message,
      });
    }
  },
).transform((value) => {
  const normalizedIdentity = normalizeDiagramIdentity({
    diagramType: value.diagramType,
    diagramView: value.diagramView,
  });

  if (!normalizedIdentity.ok) {
    throw new Error(normalizedIdentity.message);
  }

  const output: {
    nodes: z.infer<typeof NodeSchema>[];
    edges: z.infer<typeof EdgeSchema>[];
    viewport: z.infer<typeof ViewportStateSchema>;
    layoutOptions?: Record<string, unknown>;
    rootNodeName?: string;
    allowReapplyLayout?: boolean;
    diagramType?: CanonicalDiagramType;
    diagramView?: DiagramView;
  } = {
    nodes: value.nodes,
    edges: value.edges,
    viewport: value.viewport,
    ...(value.layoutOptions ? { layoutOptions: value.layoutOptions } : {}),
    ...(value.rootNodeName ? { rootNodeName: value.rootNodeName } : {}),
    ...(value.allowReapplyLayout !== undefined
      ? { allowReapplyLayout: value.allowReapplyLayout }
      : {}),
  };

  if (normalizedIdentity.diagramType) {
    output.diagramType = normalizedIdentity.diagramType;
  }

  if (normalizedIdentity.diagramView) {
    output.diagramView = normalizedIdentity.diagramView;
  }

  return output;
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
