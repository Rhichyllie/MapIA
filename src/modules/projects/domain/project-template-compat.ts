import type { CanonicalDiagramType, DiagramView } from "@/src/domain";
import type { ProjectTemplate } from "./project";

// Legacy compatibility boundary for persisted project.template. Authorization,
// snapshots and editor/runtime decisions must use membership data and explicit
// diagram identity contracts instead of reading template directly.
export function resolveDiagramIdentityFromLegacyTemplate(
  template?: ProjectTemplate,
): {
  diagramType: CanonicalDiagramType;
  diagramView: DiagramView;
} {
  if (template === "sitemap") {
    return {
      diagramType: "tree",
      diagramView: "sitemap",
    };
  }

  if (template === "flowchart") {
    return {
      diagramType: "flow",
      diagramView: "flow",
    };
  }

  if (template === "erd") {
    return {
      diagramType: "graph",
      diagramView: "erd",
    };
  }

  return {
    diagramType: "graph",
    diagramView: "graph",
  };
}
