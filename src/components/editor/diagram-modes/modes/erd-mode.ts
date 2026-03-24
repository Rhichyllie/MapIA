import {
  createContextualActionsStrategy,
  createDefaultInspectorStrategy,
  createLayoutStrategy,
  createPresentationStrategy,
  createQuickAddStrategy,
  createRenderStrategy,
  createRendererResolver,
  createSemanticStrategy,
} from "../helpers";
import type { EditorDiagramModule } from "../types";

export const erdDiagramMode: EditorDiagramModule = {
  id: "erd",
  label: "Modelo de dados (ERD)",
  maturity: "active",
  aliases: ["erd"],
  templateFallbacks: ["erd"],
  capabilities: [
    "contextual-add-field",
    "erd-quick-relate",
    "erd-validation-controls",
    "erd-export-preview",
  ],
  resolveRenderer: createRendererResolver("erd"),
  presentation: createPresentationStrategy("erd"),
  contextualActions: createContextualActionsStrategy("erd"),
  quickAdd: createQuickAddStrategy("erd"),
  layout: createLayoutStrategy("erd", {
    reapplyStrategy: "local-reflow",
  }),
  inspector: createDefaultInspectorStrategy("erd"),
  semantic: createSemanticStrategy("erd"),
  render: createRenderStrategy("erd"),
  selection: {
    hud: "default",
    supportsTreeSubtreeVisibility: false,
    supportsEntityFieldAdd: true,
    supportsQuickRelate: true,
  },
};
