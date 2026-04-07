import { resolveDiagramView } from "@/src/domain";
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

const EDITOR_DIAGRAM_MODE_REGISTRY = new Map<
  EditorDiagramModeId,
  EditorDiagramModule
>(EDITOR_DIAGRAM_MODES.map((mode) => [mode.id, mode]));

function trimOptionalValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveModeFromDiagramIdentity(input: {
  diagramType?: string;
  diagramView?: string;
}): {
  mode: EditorDiagramModule;
  source: ResolvedEditorDiagramMode["source"];
} | null {
  const requestedDiagramView = resolveDiagramView({
    diagramType: input.diagramType,
    diagramView: input.diagramView,
  });

  if (!requestedDiagramView) {
    return null;
  }

  const mode = EDITOR_DIAGRAM_MODE_REGISTRY.get(requestedDiagramView);

  if (!mode) {
    return null;
  }

  const rawDiagramView = trimOptionalValue(input.diagramView);
  const rawDiagramType = trimOptionalValue(input.diagramType);
  const source: ResolvedEditorDiagramMode["source"] = rawDiagramView
    ? rawDiagramView === requestedDiagramView
      ? "diagram-view"
      : "legacy-alias"
    : rawDiagramType
      ? rawDiagramType === requestedDiagramView
        ? "diagram-type"
        : "legacy-alias"
      : "default";

  return {
    mode,
    source,
  };
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
  diagramView?: string;
  template?: ProjectTemplate;
  layoutOptions?: unknown;
}): ResolvedEditorDiagramMode {
  const fromDiagramType = resolveModeFromDiagramIdentity(input);

  if (fromDiagramType) {
    return {
      mode: fromDiagramType.mode,
      renderer: fromDiagramType.mode.resolveRenderer({
        diagramView: input.diagramView,
        template: input.template,
        layoutOptions: input.layoutOptions,
      }),
      source: fromDiagramType.source,
      ...(input.diagramView
        ? { requestedDiagramType: input.diagramView }
        : input.diagramType
          ? { requestedDiagramType: input.diagramType }
          : {}),
    };
  }

  const fromTemplate = resolveModeFromTemplate(input.template);

  if (fromTemplate) {
    return {
      mode: fromTemplate,
      renderer: fromTemplate.resolveRenderer({
        diagramView: input.diagramView,
        template: input.template,
        layoutOptions: input.layoutOptions,
      }),
      source: "template",
      ...(input.diagramView
        ? { requestedDiagramType: input.diagramView }
        : input.diagramType
          ? { requestedDiagramType: input.diagramType }
          : {}),
    };
  }

  return {
    mode: graphDiagramMode,
    renderer: graphDiagramMode.resolveRenderer({
      diagramView: input.diagramView,
      template: input.template,
      layoutOptions: input.layoutOptions,
    }),
    source: "default",
    ...(input.diagramView
      ? { requestedDiagramType: input.diagramView }
      : input.diagramType
        ? { requestedDiagramType: input.diagramType }
        : {}),
  };
}
