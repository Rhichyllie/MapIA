import {
  translateEditor,
  type EditorTranslationFn,
} from "./editor-i18n";

export type InspectorSelectionInput = {
  hasSelectedNode: boolean;
  hasSelectedEdge: boolean;
};

export type InspectorSelectionState = {
  nodeSelected: boolean;
  edgeSelected: boolean;
  badgeLabel: string;
};

export function resolveInspectorSelectionState(
  input: InspectorSelectionInput,
  t?: EditorTranslationFn,
): InspectorSelectionState {
  if (input.hasSelectedNode) {
    return {
      nodeSelected: true,
      edgeSelected: false,
      badgeLabel: translateEditor(t, "shell.selection.nodeFocused"),
    };
  }

  if (input.hasSelectedEdge) {
    return {
      nodeSelected: false,
      edgeSelected: true,
      badgeLabel: translateEditor(t, "shell.selection.edgeFocused"),
    };
  }

  return {
    nodeSelected: false,
    edgeSelected: false,
    badgeLabel: translateEditor(t, "shell.selection.none"),
  };
}
