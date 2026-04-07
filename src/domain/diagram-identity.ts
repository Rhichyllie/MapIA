import { z } from "zod";

export const CanonicalDiagramTypeSchema = z.enum([
  "graph",
  "tree",
  "flow",
  "mindmap",
]);

export const DiagramViewSchema = z.enum([
  "graph",
  "tree",
  "flow",
  "mindmap",
  "erd",
  "sitemap",
  "timeline",
]);

const DiagramIdentityInputSchema = z.enum([
  "graph",
  "tree",
  "flow",
  "mindmap",
  "erd",
  "sitemap",
  "timeline",
  "flowchart",
]);

export type CanonicalDiagramType = z.infer<typeof CanonicalDiagramTypeSchema>;
export type DiagramView = z.infer<typeof DiagramViewSchema>;
export type DiagramIdentityInput = z.infer<typeof DiagramIdentityInputSchema>;

const COMPATIBLE_VIEWS_BY_TYPE = {
  graph: ["graph", "erd", "timeline"],
  tree: ["tree", "sitemap"],
  flow: ["flow"],
  mindmap: ["mindmap"],
} as const satisfies Record<CanonicalDiagramType, readonly DiagramView[]>;

function parseDiagramIdentityInput(
  value: unknown,
): DiagramIdentityInput | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = DiagramIdentityInputSchema.safeParse(trimmed);
  return parsed.success ? parsed.data : undefined;
}

export function isCanonicalDiagramType(
  value: unknown,
): value is CanonicalDiagramType {
  return CanonicalDiagramTypeSchema.safeParse(value).success;
}

export function isDiagramView(value: unknown): value is DiagramView {
  return DiagramViewSchema.safeParse(value).success;
}

export function resolveCanonicalDiagramTypeFromView(
  diagramView: DiagramView,
): CanonicalDiagramType {
  if (diagramView === "tree" || diagramView === "sitemap") {
    return "tree";
  }

  if (diagramView === "flow") {
    return "flow";
  }

  if (diagramView === "mindmap") {
    return "mindmap";
  }

  return "graph";
}

export function resolveDefaultDiagramView(
  diagramType: CanonicalDiagramType,
): DiagramView {
  return diagramType;
}

export function isDiagramViewCompatibleWithType(
  diagramType: CanonicalDiagramType,
  diagramView: DiagramView,
) {
  return (COMPATIBLE_VIEWS_BY_TYPE[diagramType] as readonly DiagramView[]).includes(
    diagramView,
  );
}

function normalizeLegacyDiagramIdentityInput(
  value: DiagramIdentityInput | undefined,
): { diagramType: CanonicalDiagramType; diagramView: DiagramView } | undefined {
  if (!value) {
    return undefined;
  }

  if (value === "tree" || value === "flow" || value === "mindmap") {
    return {
      diagramType: value,
      diagramView: value,
    };
  }

  if (value === "sitemap") {
    return {
      diagramType: "tree",
      diagramView: "sitemap",
    };
  }

  if (value === "erd") {
    return {
      diagramType: "graph",
      diagramView: "erd",
    };
  }

  if (value === "timeline") {
    return {
      diagramType: "graph",
      diagramView: "timeline",
    };
  }

  if (value === "flowchart") {
    return {
      diagramType: "flow",
      diagramView: "flow",
    };
  }

  return {
    diagramType: "graph",
    diagramView: "graph",
  };
}

export function normalizeDiagramIdentity(input: {
  diagramType?: unknown;
  diagramView?: unknown;
}):
  | {
      ok: true;
      diagramType?: CanonicalDiagramType;
      diagramView?: DiagramView;
      migratedFromLegacy: boolean;
    }
  | {
      ok: false;
      message: string;
    } {
  const rawDiagramType = parseDiagramIdentityInput(input.diagramType);
  const rawDiagramView = parseDiagramIdentityInput(input.diagramView);
  const normalizedFromDiagramType =
    normalizeLegacyDiagramIdentityInput(rawDiagramType);
  const normalizedFromDiagramView =
    normalizeLegacyDiagramIdentityInput(rawDiagramView);

  if (!normalizedFromDiagramType && !normalizedFromDiagramView) {
    return {
      ok: true,
      migratedFromLegacy: false,
    };
  }

  const diagramType =
    normalizedFromDiagramType?.diagramType ??
    normalizedFromDiagramView?.diagramType;
  const diagramView =
    (rawDiagramView && isDiagramView(rawDiagramView)
      ? rawDiagramView
      : normalizedFromDiagramView?.diagramView) ??
    normalizedFromDiagramType?.diagramView ??
    (diagramType ? resolveDefaultDiagramView(diagramType) : undefined);

  if (!diagramType || !diagramView) {
    return {
      ok: false,
      message:
        "Snapshot precisa definir uma identidade canonica coerente para diagramType/diagramView.",
    };
  }

  if (!isDiagramViewCompatibleWithType(diagramType, diagramView)) {
    return {
      ok: false,
      message: `diagramView "${diagramView}" nao e compativel com diagramType "${diagramType}".`,
    };
  }

  return {
    ok: true,
    diagramType,
    diagramView,
    migratedFromLegacy:
      Boolean(rawDiagramType && !isCanonicalDiagramType(rawDiagramType)) ||
      Boolean(rawDiagramView && !isDiagramView(rawDiagramView)),
  };
}

export function resolveCanonicalDiagramType(input: {
  diagramType?: unknown;
  diagramView?: unknown;
}): CanonicalDiagramType | undefined {
  const normalized = normalizeDiagramIdentity(input);
  return normalized.ok ? normalized.diagramType : undefined;
}

export function resolveDiagramView(input: {
  diagramType?: unknown;
  diagramView?: unknown;
}): DiagramView | undefined {
  const normalized = normalizeDiagramIdentity(input);
  return normalized.ok ? normalized.diagramView : undefined;
}
