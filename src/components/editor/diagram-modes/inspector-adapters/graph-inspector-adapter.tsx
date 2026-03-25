import {
  GraphLikeOperationalEdgeInspector,
  GraphLikeOperationalNodeInspector,
  TechnicalEdgeInspector,
  TechnicalNodeInspector,
} from "./shared-mode-inspectors";
import type { EditorDiagramInspectorAdapterProps } from "./types";

export function GraphInspectorAdapter(props: EditorDiagramInspectorAdapterProps) {
  if (
    props.selectedNode &&
    props.inspectorMode === "operational" &&
    props.operationalNodeDraft
  ) {
    return (
      <GraphLikeOperationalNodeInspector
        editorT={props.editorT}
        diagramType={props.diagramType}
        inspectorCopy={props.inspectorCopy}
        inspectorSections={props.inspectorSections}
        inspectorSelectionBadge={props.inspectorSelectionBadge}
        operationalNodeDraft={props.operationalNodeDraft}
        setOperationalNodeDraft={props.setOperationalNodeDraft}
        nodeKindOptions={props.nodeKindOptions}
        nodeInspectorDirty={props.nodeInspectorDirty}
        nodeInspectorErrors={props.nodeInspectorErrors}
        nodeInspectorMessage={props.nodeInspectorMessage}
        nodeInspectorHasErrors={props.nodeInspectorHasErrors}
        graphSelectedNodeSemantic={props.graphSelectedNodeSemantic}
        graphSelectedNodeKindLabel={props.graphSelectedNodeKindLabel}
        graphSelectedNodeKindDescription={props.graphSelectedNodeKindDescription}
        selectedNodeRoleLabel={props.selectedNodeRoleLabel}
        selectedNodeRelations={props.selectedNodeRelations}
        selectedNodeStructureTips={props.selectedNodeStructureTips}
        operationalTagPreview={props.operationalTagPreview}
        quickAction={props.quickAction}
        secondarySelectionActions={props.secondarySelectionActions}
        saveStatus={props.saveStatus}
        isGraphDiagram
        onToggleInspectorSection={props.onToggleInspectorSection}
        onHandleAddContextualNode={props.onHandleAddContextualNode}
        onOpenRelatedNodeFromRelation={props.onOpenRelatedNodeFromRelation}
        onOpenTransitionFromRelation={props.onOpenTransitionFromRelation}
        onRemoveRelation={props.onRemoveRelation}
        onApplyNodeInspector={props.onApplyNodeInspector}
        onResetNodeInspector={props.onResetNodeInspector}
      />
    );
  }

  if (props.selectedNode && props.inspectorMode === "technical" && props.nodeInspectorDraft) {
    return (
      <TechnicalNodeInspector
        editorT={props.editorT}
        inspectorSections={props.inspectorSections}
        inspectorSelectionBadge={props.inspectorSelectionBadge}
        selectedNode={props.selectedNode}
        nodeInspectorDraft={props.nodeInspectorDraft}
        setNodeInspectorDraft={props.setNodeInspectorDraft}
        nodeKindOptions={props.nodeKindOptions}
        nodeInspectorDirty={props.nodeInspectorDirty}
        nodeInspectorErrors={props.nodeInspectorErrors}
        nodeInspectorMessage={props.nodeInspectorMessage}
        nodeInspectorHasErrors={props.nodeInspectorHasErrors}
        saveStatus={props.saveStatus}
        onToggleInspectorSection={props.onToggleInspectorSection}
        onFormatNodeJson={props.onFormatNodeJson}
        onCopyNodeJson={props.onCopyNodeJson}
        onCopyNodeId={props.onCopyNodeId}
        onApplyNodeInspector={props.onApplyNodeInspector}
        onResetNodeInspector={props.onResetNodeInspector}
      />
    );
  }

  if (
    props.selectedEdge &&
    props.inspectorMode === "operational" &&
    props.operationalEdgeDraft &&
    props.selectedEdgeSourceLabel &&
    props.selectedEdgeTargetLabel
  ) {
    return (
      <GraphLikeOperationalEdgeInspector
        editorT={props.editorT}
        diagramType={props.diagramType}
        inspectorCopy={props.inspectorCopy}
        inspectorSections={props.inspectorSections}
        inspectorSelectionState={props.inspectorSelectionState}
        selectedEdgeSourceLabel={props.selectedEdgeSourceLabel}
        selectedEdgeTargetLabel={props.selectedEdgeTargetLabel}
        operationalEdgeDraft={props.operationalEdgeDraft}
        setOperationalEdgeDraft={props.setOperationalEdgeDraft}
        edgeKindOptions={props.edgeKindOptions}
        edgeInspectorDirty={props.edgeInspectorDirty}
        edgeInspectorErrors={props.edgeInspectorErrors}
        edgeInspectorMessage={props.edgeInspectorMessage}
        edgeInspectorHasErrors={props.edgeInspectorHasErrors}
        graphSelectedEdgeSemantic={props.graphSelectedEdgeSemantic}
        saveStatus={props.saveStatus}
        onToggleInspectorSection={props.onToggleInspectorSection}
        onApplyEdgeInspector={props.onApplyEdgeInspector}
        onResetEdgeInspector={props.onResetEdgeInspector}
        onRemoveSelected={props.onRemoveSelected}
      />
    );
  }

  if (props.selectedEdge && props.inspectorMode === "technical" && props.edgeInspectorDraft) {
    return (
      <TechnicalEdgeInspector
        editorT={props.editorT}
        inspectorSections={props.inspectorSections}
        inspectorSelectionState={props.inspectorSelectionState}
        selectedEdge={props.selectedEdge}
        edgeInspectorDraft={props.edgeInspectorDraft}
        setEdgeInspectorDraft={props.setEdgeInspectorDraft}
        edgeKindOptions={props.edgeKindOptions}
        edgeInspectorDirty={props.edgeInspectorDirty}
        edgeInspectorErrors={props.edgeInspectorErrors}
        edgeInspectorMessage={props.edgeInspectorMessage}
        edgeInspectorHasErrors={props.edgeInspectorHasErrors}
        saveStatus={props.saveStatus}
        onToggleInspectorSection={props.onToggleInspectorSection}
        onFormatEdgeJson={props.onFormatEdgeJson}
        onCopyEdgeJson={props.onCopyEdgeJson}
        onCopyEdgeId={props.onCopyEdgeId}
        onApplyEdgeInspector={props.onApplyEdgeInspector}
        onResetEdgeInspector={props.onResetEdgeInspector}
        onRemoveSelected={props.onRemoveSelected}
      />
    );
  }

  return null;
}
