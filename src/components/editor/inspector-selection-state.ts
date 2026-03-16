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
): InspectorSelectionState {
  if (input.hasSelectedNode) {
    return {
      nodeSelected: true,
      edgeSelected: false,
      badgeLabel: "Item em foco",
    };
  }

  if (input.hasSelectedEdge) {
    return {
      nodeSelected: false,
      edgeSelected: true,
      badgeLabel: "Conexao em foco",
    };
  }

  return {
    nodeSelected: false,
    edgeSelected: false,
    badgeLabel: "Sem selecao",
  };
}
