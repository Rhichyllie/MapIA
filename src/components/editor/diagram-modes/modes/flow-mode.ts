import {
  createContextualActionsStrategy,
  createLayoutStrategy,
  createPresentationStrategy,
  createProcessInspectorStrategy,
  createQuickAddStrategy,
  createRenderStrategy,
  createRendererResolver,
  createSemanticStrategy,
  processQuickAddRoleOptions,
} from "../helpers";
import type { EditorDiagramModule } from "../types";

export const flowDiagramMode: EditorDiagramModule = {
  id: "flow",
  label: "Processo",
  maturity: "active",
  aliases: ["flow"],
  templateFallbacks: [],
  capabilities: [
    "quick-add-roles",
    "specialized-selection-hud",
    "specialized-inspector",
    "specialized-node-relations",
  ],
  resolveRenderer: createRendererResolver("flow"),
  presentation: createPresentationStrategy("flow"),
  contextualActions: createContextualActionsStrategy("flow"),
  quickAdd: createQuickAddStrategy("flow", processQuickAddRoleOptions),
  layout: createLayoutStrategy("flow", {
    reapplyStrategy: "local-reflow",
  }),
  inspector: createProcessInspectorStrategy(),
  semantic: createSemanticStrategy("flow"),
  render: createRenderStrategy("flow"),
  selection: {
    hud: "flow",
    supportsTreeSubtreeVisibility: false,
    supportsEntityFieldAdd: false,
    supportsQuickRelate: false,
  },
};
