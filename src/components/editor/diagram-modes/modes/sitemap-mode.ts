import {
  createContextualActionsStrategy,
  createDefaultInspectorStrategy,
  createLayoutStrategy,
  createPresentationStrategy,
  createQuickAddStrategy,
  createRenderStrategy,
  createRendererResolver,
  createSemanticStrategy,
  createSitemapQuickAddRoleOptions,
} from "../helpers";
import type { EditorDiagramModule } from "../types";

export const sitemapDiagramMode: EditorDiagramModule = {
  id: "sitemap",
  label: "Sitemap",
  maturity: "prepared",
  aliases: ["sitemap"],
  templateFallbacks: ["sitemap"],
  capabilities: ["quick-add-roles"],
  resolveRenderer: createRendererResolver("sitemap"),
  presentation: createPresentationStrategy("sitemap"),
  contextualActions: createContextualActionsStrategy("sitemap"),
  quickAdd: createQuickAddStrategy("sitemap", createSitemapQuickAddRoleOptions),
  layout: createLayoutStrategy("sitemap", {
    reapplyStrategy: "local-reflow",
  }),
  inspector: createDefaultInspectorStrategy("sitemap"),
  semantic: createSemanticStrategy("sitemap"),
  render: createRenderStrategy("sitemap"),
  selection: {
    hud: "default",
    supportsTreeSubtreeVisibility: false,
    supportsEntityFieldAdd: false,
    supportsQuickRelate: false,
  },
};
