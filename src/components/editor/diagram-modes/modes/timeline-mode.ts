import {
  createContextualActionsStrategy,
  createDefaultInspectorStrategy,
  createLayoutStrategy,
  createPresentationStrategy,
  createQuickAddStrategy,
  createRenderStrategy,
  createRendererResolver,
  createSemanticStrategy,
  createTimelineQuickAddRoleOptions,
} from "../helpers";
import type { EditorDiagramModule } from "../types";

export const timelineDiagramMode: EditorDiagramModule = {
  id: "timeline",
  label: "Timeline",
  maturity: "prepared",
  aliases: ["timeline"],
  templateFallbacks: [],
  capabilities: ["quick-add-roles"],
  resolveRenderer: createRendererResolver("timeline"),
  presentation: createPresentationStrategy("timeline"),
  contextualActions: createContextualActionsStrategy("timeline"),
  quickAdd: createQuickAddStrategy("timeline", createTimelineQuickAddRoleOptions),
  layout: createLayoutStrategy("timeline", {
    reapplyStrategy: "local-reflow",
  }),
  inspector: createDefaultInspectorStrategy("timeline"),
  semantic: createSemanticStrategy("timeline"),
  render: createRenderStrategy("timeline"),
  selection: {
    hud: "default",
    supportsTreeSubtreeVisibility: false,
    supportsEntityFieldAdd: false,
    supportsQuickRelate: false,
  },
};
