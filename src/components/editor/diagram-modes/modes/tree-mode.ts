import {
  createContextualActionsStrategy,
  createDefaultInspectorStrategy,
  createLayoutStrategy,
  createPresentationStrategy,
  createQuickAddStrategy,
  createRenderStrategy,
  createRendererResolver,
  createSemanticStrategy,
  createTreeQuickAddRoleOptions,
} from "../helpers";
import type { EditorDiagramModule } from "../types";

export const treeDiagramMode: EditorDiagramModule = {
  id: "tree",
  label: "Hierarquia",
  maturity: "prepared",
  aliases: ["tree"],
  templateFallbacks: [],
  capabilities: ["quick-add-roles", "tree-subtree-visibility"],
  resolveRenderer: createRendererResolver("tree"),
  presentation: createPresentationStrategy("tree"),
  contextualActions: createContextualActionsStrategy("tree"),
  quickAdd: createQuickAddStrategy("tree", createTreeQuickAddRoleOptions),
  layout: createLayoutStrategy("tree", {
    reapplyStrategy: "snapshot-native",
  }),
  inspector: createDefaultInspectorStrategy("tree"),
  semantic: createSemanticStrategy("tree"),
  render: createRenderStrategy("tree"),
  selection: {
    hud: "default",
    supportsTreeSubtreeVisibility: true,
    supportsEntityFieldAdd: false,
    supportsQuickRelate: false,
  },
};
