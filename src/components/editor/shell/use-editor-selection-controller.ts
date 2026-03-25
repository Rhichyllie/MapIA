import { useCallback, useMemo, useState } from "react";
import type { RFEdge, RFNode } from "../editor-graph-mappers";

type SelectionGuard = (() => boolean) | undefined;

type UseEditorSelectionControllerInput = {
  nodes: RFNode[];
  edges: RFEdge[];
};

export function useEditorSelectionController({
  nodes,
  edges,
}: UseEditorSelectionControllerInput) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );

  const selectItem = useCallback(
    (
      next: { nodeId: string | null; edgeId: string | null },
      guard?: SelectionGuard,
    ) => {
      if (guard && !guard()) {
        return false;
      }

      setSelectedNodeId(next.nodeId);
      setSelectedEdgeId(next.edgeId);
      return true;
    },
    [],
  );

  const clearSelection = useCallback(
    (guard?: SelectionGuard) =>
      selectItem(
        {
          nodeId: null,
          edgeId: null,
        },
        guard,
      ),
    [selectItem],
  );

  return {
    selectedNodeId,
    setSelectedNodeId,
    selectedEdgeId,
    setSelectedEdgeId,
    selectedNode,
    selectedEdge,
    selectItem,
    clearSelection,
  };
}
