import { ProcessOperationalEdgeInspector } from "../../process-inspector/process-operational-edge-inspector";
import { ProcessOperationalNodeInspector } from "../../process-inspector/process-operational-node-inspector";
import { resolveProcessNodeShapeForRole } from "../../presentation/process-semantics";
import {
  TechnicalEdgeInspector,
  TechnicalNodeInspector,
} from "./shared-mode-inspectors";
import type { EditorDiagramInspectorAdapterProps } from "./types";

export function FlowInspectorAdapter(props: EditorDiagramInspectorAdapterProps) {
  if (
    props.selectedNode &&
    props.inspectorMode === "operational" &&
    props.operationalNodeDraft &&
    props.processNodeInspectorModel &&
    props.processSelectedNodeRelations
  ) {
    return (
      <ProcessOperationalNodeInspector
        copy={props.processNodeInspectorModel.copy}
        overview={props.processNodeInspectorModel.overview}
        relations={props.processSelectedNodeRelations}
        draft={props.operationalNodeDraft}
        selectedRole={props.processNodeInspectorModel.role}
        sections={{
          general: props.inspectorSections.general,
          details: props.inspectorSections.details,
          relations: props.inspectorSections.relations,
        }}
        tagPreview={props.operationalTagPreview}
        nodeInspectorErrors={props.nodeInspectorErrors}
        nodeInspectorMessage={props.nodeInspectorMessage}
        nodeInspectorHasErrors={props.nodeInspectorHasErrors}
        isSaving={props.saveStatus === "saving"}
        primaryAction={{
          id: props.quickAction.id,
          label: props.quickAction.label,
          onClick: () => props.onHandleAddContextualNode(props.quickAction),
        }}
        secondaryActions={props.secondarySelectionActions.slice(0, 2).map((action) => ({
          id: action.id,
          label: action.label,
          onClick: () => props.onHandleAddContextualNode(action),
        }))}
        onToggleSection={props.onToggleInspectorSection}
        onLabelChange={(value) =>
          props.setOperationalNodeDraft((current) =>
            current ? { ...current, label: value } : current,
          )
        }
        onRoleChange={(role) =>
          props.setOperationalNodeDraft((current) =>
            current
              ? {
                  ...current,
                  ...resolveProcessNodeShapeForRole(role),
                }
              : current,
          )
        }
        onDescriptionChange={(value) =>
          props.setOperationalNodeDraft((current) =>
            current ? { ...current, description: value } : current,
          )
        }
        onTagsChange={(value) =>
          props.setOperationalNodeDraft((current) =>
            current ? { ...current, tagsText: value } : current,
          )
        }
        onOwnerChange={(value) =>
          props.setOperationalNodeDraft((current) =>
            current ? { ...current, owner: value } : current,
          )
        }
        onAreaChange={(value) =>
          props.setOperationalNodeDraft((current) =>
            current ? { ...current, area: value } : current,
          )
        }
        onChannelChange={(value) =>
          props.setOperationalNodeDraft((current) =>
            current ? { ...current, channel: value } : current,
          )
        }
        onCriticalityChange={(value) =>
          props.setOperationalNodeDraft((current) =>
            current
              ? {
                  ...current,
                  criticality: value as typeof current.criticality,
                }
              : current,
          )
        }
        onSlaChange={(value) =>
          props.setOperationalNodeDraft((current) =>
            current ? { ...current, sla: value } : current,
          )
        }
        onRuleChange={(value) =>
          props.setOperationalNodeDraft((current) =>
            current ? { ...current, rule: value } : current,
          )
        }
        onExceptionChange={(value) =>
          props.setOperationalNodeDraft((current) =>
            current ? { ...current, exception: value } : current,
          )
        }
        onOpenRelatedNode={props.onOpenRelatedNodeFromRelation}
        onOpenTransition={props.onOpenTransitionFromRelation}
        onRemoveRelation={props.onRemoveRelation}
        onApply={props.onApplyNodeInspector}
        onReset={props.onResetNodeInspector}
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
    props.processEdgeInspectorModel &&
    props.selectedEdgeSourceLabel &&
    props.selectedEdgeTargetLabel
  ) {
    return (
      <ProcessOperationalEdgeInspector
        copy={props.processEdgeInspectorModel.copy}
        overview={props.processEdgeInspectorModel.overview}
        draft={props.operationalEdgeDraft}
        edgeKindOptions={props.edgeKindOptions}
        sections={{
          general: props.inspectorSections.general,
          relations: props.inspectorSections.relations,
        }}
        sourceLabel={props.selectedEdgeSourceLabel}
        targetLabel={props.selectedEdgeTargetLabel}
        edgeReadingKind={props.selectedEdge.data?.kind ?? "flows-to"}
        edgeInspectorErrors={props.edgeInspectorErrors}
        edgeInspectorMessage={props.edgeInspectorMessage}
        edgeInspectorHasErrors={props.edgeInspectorHasErrors}
        isSaving={props.saveStatus === "saving"}
        onToggleSection={props.onToggleInspectorSection}
        onLabelChange={(value) =>
          props.setOperationalEdgeDraft((current) =>
            current ? { ...current, label: value } : current,
          )
        }
        onKindChange={(kind) =>
          props.setOperationalEdgeDraft((current) =>
            current ? { ...current, kind } : current,
          )
        }
        onApply={props.onApplyEdgeInspector}
        onReset={props.onResetEdgeInspector}
        onRemove={props.onRemoveSelected}
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
