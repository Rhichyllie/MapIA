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

export const mindmapDiagramMode: EditorDiagramModule = {
  id: "mindmap",
  label: "Mapa mental",
  maturity: "prepared",
  aliases: ["mindmap"],
  templateFallbacks: [],
  capabilities: [],
  resolveRenderer: createRendererResolver("mindmap"),
  presentation: createPresentationStrategy("mindmap"),
  contextualActions: createContextualActionsStrategy("mindmap"),
  quickAdd: createQuickAddStrategy("mindmap"),
  layout: createLayoutStrategy("mindmap", {
    reapplyStrategy: "snapshot-native",
  }),
  inspector: createDefaultInspectorStrategy("mindmap"),
  semantic: createSemanticStrategy("mindmap"),
  render: createRenderStrategy("mindmap"),
  selection: {
    hud: "default",
    supportsTreeSubtreeVisibility: false,
    supportsEntityFieldAdd: false,
    supportsQuickRelate: false,
  },
};