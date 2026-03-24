import type { ProjectTemplate } from "@/src/modules/projects/domain";
import { erdDiagramMode } from "./modes/erd-mode";
import { flowDiagramMode } from "./modes/flow-mode";
import { graphDiagramMode } from "./modes/graph-mode";
import { mindmapDiagramMode } from "./modes/mindmap-mode";
import { sitemapDiagramMode } from "./modes/sitemap-mode";
import { timelineDiagramMode } from "./modes/timeline-mode";
import { treeDiagramMode } from "./modes/tree-mode";
import type {
  EditorDiagramCapability,
  EditorDiagramModeId,
  EditorDiagramModule,
  ResolvedEditorDiagramMode,
} from "./types";

const EDITOR_DIAGRAM_MODES = [
  flowDiagramMode,
  graphDiagramMode,
  erdDiagramMode,
  treeDiagramMode,
  sitemapDiagramMode,
  mindmapDiagramMode,
  timelineDiagramMode,
] as const satisfies readonly EditorDiagramModule[];

const EDITOR_DIAGRAM_MODE_REGISTRY = new Map<EditorDiagramModeId, EditorDiagramModule>(
  EDITOR_DIAGRAM_MODES.map((mode) => [mode.id, mode]),
);

function resolveModeFromDiagramType(
  diagramType: string | undefined,
): {
  mode: EditorDiagramModule;
  source: ResolvedEditorDiagramMode["source"];
} | null {
  if (!diagramType) {
    return null;
  }

  for (const mode of EDITOR_DIAGRAM_MODES) {
    if (mode.id === diagramType) {
      return {
        mode,
        source: "diagram-type",
      };
    }

    if (mode.aliases.includes(diagramType)) {
      return {
        mode,
        source: "legacy-alias",
      };
    }
  }

  return null;
}

function resolveModeFromTemplate(
  template: ProjectTemplate | undefined,
): EditorDiagramModule | null {
  if (!template) {
    return null;
  }

  for (const mode of EDITOR_DIAGRAM_MODES) {
    if (mode.templateFallbacks.includes(template)) {
      return mode;
    }
  }

  return null;
}

export function getEditorDiagramModes() {
  return [...EDITOR_DIAGRAM_MODES];
}

export function getEditorDiagramMode(modeId: EditorDiagramModeId) {
  const mode = EDITOR_DIAGRAM_MODE_REGISTRY.get(modeId);

  if (!mode) {
    throw new Error(`Editor diagram mode "${modeId}" is not registered.`);
  }

  return mode;
}

export function hasEditorDiagramCapability(
  mode: EditorDiagramModule,
  capability: EditorDiagramCapability,
) {
  return mode.capabilities.includes(capability);
}

export function resolveEditorDiagramMode(input: {
  diagramType?: string;
  template?: ProjectTemplate;
  layoutOptions?: unknown;
}): ResolvedEditorDiagramMode {
  const fromDiagramType = resolveModeFromDiagramType(input.diagramType);

  if (fromDiagramType) {
    return {
      mode: fromDiagramType.mode,
      renderer: fromDiagramType.mode.resolveRenderer({
        template: input.template,
        layoutOptions: input.layoutOptions,
      }),
      source: fromDiagramType.source,
      ...(input.diagramType ? { requestedDiagramType: input.diagramType } : {}),
    };
  }

  const fromTemplate = resolveModeFromTemplate(input.template);

  if (fromTemplate) {
    return {
      mode: fromTemplate,
      renderer: fromTemplate.resolveRenderer({
        template: input.template,
        layoutOptions: input.layoutOptions,
      }),
      source: "template",
      ...(input.diagramType ? { requestedDiagramType: input.diagramType } : {}),
    };
  }

  return {
    mode: graphDiagramMode,
    renderer: graphDiagramMode.resolveRenderer({
      template: input.template,
      layoutOptions: input.layoutOptions,
    }),
    source: "default",
    ...(input.diagramType ? { requestedDiagramType: input.diagramType } : {}),
  };
}
