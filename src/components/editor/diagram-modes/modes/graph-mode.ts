import {
  createContextualActionsStrategy,
  createDefaultInspectorStrategy,
  createLayoutStrategy,
  createPresentationStrategy,
  createQuickAddStrategy,
  createRenderStrategy,
  createRendererResolver,
  createSemanticStrategy,
  graphQuickAddRoleOptions,
} from "../helpers";
import type { EditorDiagramModule } from "../types";

export const graphDiagramMode: EditorDiagramModule = {
  id: "graph",
  label: "Grafo",
  maturity: "active",
  aliases: ["graph", "flowchart"],
  templateFallbacks: ["graph", "flowchart"],
  capabilities: ["quick-add-roles", "graph-semantic-copy"],
  resolveRenderer: createRendererResolver("graph"),
  presentation: createPresentationStrategy("graph"),
  contextualActions: createContextualActionsStrategy("graph"),
  quickAdd: createQuickAddStrategy("graph", graphQuickAddRoleOptions),
  layout: createLayoutStrategy("graph", {
    reapplyStrategy: "local-reflow",
  }),
  inspector: createDefaultInspectorStrategy("graph"),
  semantic: createSemanticStrategy("graph"),
  render: createRenderStrategy("graph"),
  selection: {
    hud: "default",
    supportsTreeSubtreeVisibility: false,
    supportsEntityFieldAdd: false,
    supportsQuickRelate: false,
  },
};
