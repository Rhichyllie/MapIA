import type { Dispatch, SetStateAction } from "react";
import type { EdgeKind } from "@/src/domain";
import {
  getFriendlyEdgeKindDescription,
  getFriendlyEdgeKindLabel,
  getFriendlyNodeKindDescription,
  getFriendlyNodeKindLabel,
  type OperationalNodeDraft,
} from "../../editor-inspector-personas";
import type { EdgeInspectorDraft, NodeInspectorDraft } from "../../editor-inspector-schemas";
import type { EditorTranslationFn } from "../../editor-i18n";
import type { RFEdge, RFNode } from "../../editor-graph-mappers";
import type { ContextualDiagramType } from "../../presentation/kinds";
import {
  getEdgeKindDescriptionForDiagram,
  getEdgeKindLabelForDiagram,
  getNodeKindDescriptionForDiagram,
  getNodeKindLabelForDiagram,
} from "../../presentation/kinds";
import type { DiagramScopedNodeKindOption } from "../../presentation/diagram-scoped-options";
import type {
  EditorDiagramInspectorCopy,
  EditorDiagramNodeRelationsView,
} from "../types";
import type { InspectorSelectionState } from "../../inspector-selection-state";
import type {
  InspectorSectionState,
  OperationalEdgeDraft,
  SelectionHudQuickAction,
} from "../../shell/editor-shell-types";
import type { InspectorFieldErrors } from "../../editor-inspector-feedback";
import type {
  GraphEdgeSemanticViewModel,
  GraphNodeSemanticViewModel,
} from "./types";

type GraphLikeOperationalNodeInspectorProps = {
  editorT: EditorTranslationFn;
  diagramType: ContextualDiagramType;
  inspectorCopy: EditorDiagramInspectorCopy;
  inspectorSections: InspectorSectionState;
  inspectorSelectionBadge: string;
  operationalNodeDraft: OperationalNodeDraft;
  setOperationalNodeDraft: Dispatch<SetStateAction<OperationalNodeDraft | null>>;
  nodeKindOptions: DiagramScopedNodeKindOption[];
  nodeInspectorDirty: boolean;
  nodeInspectorErrors: InspectorFieldErrors;
  nodeInspectorMessage: string | null;
  nodeInspectorHasErrors: boolean;
  graphSelectedNodeSemantic: GraphNodeSemanticViewModel | null | undefined;
  graphSelectedNodeKindLabel: string | null;
  graphSelectedNodeKindDescription: string | null;
  selectedNodeRoleLabel: string | null;
  selectedNodeRelations: EditorDiagramNodeRelationsView;
  selectedNodeStructureTips: string[];
  operationalTagPreview: string[];
  quickAction: SelectionHudQuickAction;
  secondarySelectionActions: SelectionHudQuickAction[];
  saveStatus: "idle" | "dirty" | "saving" | "saved" | "error";
  isGraphDiagram: boolean;
  onToggleInspectorSection: (sectionKey: keyof InspectorSectionState) => void;
  onHandleAddContextualNode: (action: SelectionHudQuickAction) => void;
  onOpenRelatedNodeFromRelation: (relationId: string, nodeId: string) => void;
  onOpenTransitionFromRelation: (relationId: string) => void;
  onRemoveRelation: (relationId: string) => void;
  onApplyNodeInspector: () => void;
  onResetNodeInspector: () => void;
};

export function GraphLikeOperationalNodeInspector({
  editorT,
  diagramType,
  inspectorCopy,
  inspectorSections,
  inspectorSelectionBadge,
  operationalNodeDraft,
  setOperationalNodeDraft,
  nodeKindOptions,
  nodeInspectorDirty,
  nodeInspectorErrors,
  nodeInspectorMessage,
  nodeInspectorHasErrors,
  graphSelectedNodeSemantic,
  graphSelectedNodeKindLabel,
  graphSelectedNodeKindDescription,
  selectedNodeRoleLabel,
  selectedNodeRelations,
  selectedNodeStructureTips,
  operationalTagPreview,
  quickAction,
  secondarySelectionActions,
  saveStatus,
  isGraphDiagram,
  onToggleInspectorSection,
  onHandleAddContextualNode,
  onOpenRelatedNodeFromRelation,
  onOpenTransitionFromRelation,
  onRemoveRelation,
  onApplyNodeInspector,
  onResetNodeInspector,
}: GraphLikeOperationalNodeInspectorProps) {
  return (
    <div className="stack-sm">
      <div className="row-actions inspector-selection-row">
        <span className="badge">{inspectorSelectionBadge}</span>
        {nodeInspectorDirty ? (
          <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
            {editorT("shell.inspector.draftBadge")}
          </span>
        ) : null}
      </div>

      {graphSelectedNodeSemantic ? (
        <div
          className="tile inspector-context-tile inspector-context-tile--graph"
          data-testid="graph-inspector-overview"
        >
          <div className="row-actions">
            <span className="badge">{graphSelectedNodeSemantic.roleBadgeLabel}</span>
            <span className="badge">{graphSelectedNodeSemantic.kindLabel}</span>
          </div>
          <h4>{editorT("shell.graph.readingTitle")}</h4>
          <p className="helper">{graphSelectedNodeSemantic.summary}</p>
          <dl className="inspector-meta-list">
            <div>
              <dt>{editorT("shell.graph.networkPosition")}</dt>
              <dd>{graphSelectedNodeSemantic.footprintLabel}</dd>
            </div>
            <div>
              <dt>{editorT("shell.inspector.neighborhood")}</dt>
              <dd>{graphSelectedNodeSemantic.connectivityLabel}</dd>
            </div>
          </dl>
          <div className="row-actions" data-testid="graph-inspector-context-actions">
            <button
              className="btn"
              type="button"
              onClick={() => onHandleAddContextualNode(quickAction)}
            >
              {quickAction.label}
            </button>
            {secondarySelectionActions.slice(0, 2).map((action) => (
              <button
                key={action.id}
                className="btn"
                type="button"
                onClick={() => onHandleAddContextualNode(action)}
                data-testid={`graph-inspector-action-${action.id}`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="row-actions inspector-section-tabs">
        <button
          className="btn inspector-section-toggle"
          type="button"
          onClick={() => onToggleInspectorSection("general")}
          aria-expanded={inspectorSections.general}
          data-testid="inspector-section-general-toggle"
        >
          {inspectorCopy.generalSectionTitle} {inspectorSections.general ? "▾" : "▸"}
        </button>
        <button
          className="btn inspector-section-toggle"
          type="button"
          onClick={() => onToggleInspectorSection("details")}
          aria-expanded={inspectorSections.details}
          data-testid="inspector-section-details-toggle"
        >
          {inspectorCopy.detailsSectionTitle} {inspectorSections.details ? "▾" : "▸"}
        </button>
        <button
          className="btn inspector-section-toggle"
          type="button"
          onClick={() => onToggleInspectorSection("relations")}
          aria-expanded={inspectorSections.relations}
          data-testid="inspector-section-relations-toggle"
        >
          {inspectorCopy.relationsSectionTitle} {inspectorSections.relations ? "▾" : "▸"}
        </button>
      </div>

      {inspectorSections.general ? (
        <>
          <div className="field">
            <label htmlFor="node-title-input">{inspectorCopy.nodeTitleLabel}</label>
            <input
              id="node-title-input"
              data-testid="inspector-node-label"
              value={operationalNodeDraft.label}
              onChange={(event) =>
                setOperationalNodeDraft((current) =>
                  current ? { ...current, label: event.target.value } : current,
                )
              }
            />
          </div>

          <div className="field">
            <label htmlFor="node-kind-operational-input">{inspectorCopy.nodeKindLabel}</label>
            <select
              id="node-kind-operational-input"
              data-testid="inspector-node-kind"
              value={operationalNodeDraft.kind}
              onChange={(event) =>
                setOperationalNodeDraft((current) =>
                  current
                    ? {
                        ...current,
                        kind: event.target.value as OperationalNodeDraft["kind"],
                      }
                    : current,
                )
              }
            >
              {nodeKindOptions.map((option) => (
                <option key={option.kind} value={option.kind}>
                  {getNodeKindLabelForDiagram(
                    diagramType,
                    option.kind,
                    "operational",
                    editorT,
                  )}
                  {option.outOfProfile ? editorT("shell.inspector.outOfProfileSuffix") : ""}
                </option>
              ))}
            </select>
            <span className="helper">
              {getNodeKindDescriptionForDiagram(
                diagramType,
                operationalNodeDraft.kind,
                editorT,
              )}
            </span>
          </div>
        </>
      ) : null}

      {inspectorSections.details ? (
        <>
          <div className="field">
            <label htmlFor="node-description-operational-input">
              {inspectorCopy.nodeDescriptionLabel}
            </label>
            <textarea
              id="node-description-operational-input"
              rows={3}
              value={operationalNodeDraft.description}
              onChange={(event) =>
                setOperationalNodeDraft((current) =>
                  current ? { ...current, description: event.target.value } : current,
                )
              }
              placeholder={inspectorCopy.nodeDescriptionPlaceholder}
              data-testid="inspector-node-description"
            />
          </div>

          <div className="field">
            <label htmlFor="node-tags-operational-input">{inspectorCopy.nodeTagsLabel}</label>
            <input
              id="node-tags-operational-input"
              value={operationalNodeDraft.tagsText}
              onChange={(event) =>
                setOperationalNodeDraft((current) =>
                  current ? { ...current, tagsText: event.target.value } : current,
                )
              }
              placeholder={inspectorCopy.nodeTagsPlaceholder}
              data-testid="inspector-node-tags"
            />
            <span className="helper">{inspectorCopy.nodeTagsHelper}</span>
          </div>

          {operationalTagPreview.length > 0 ? (
            <div className="row-actions">
              {operationalTagPreview.map((tag) => (
                <span key={tag} className="badge">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <div
            className={`tile inspector-context-tile ${isGraphDiagram ? "inspector-context-tile--graph" : ""}`}
            data-testid={isGraphDiagram ? "graph-inspector-context" : undefined}
          >
            <h4>{inspectorCopy.nodeContextTitle}</h4>
            <p className="helper">
              {editorT("shell.inspector.currentRole")}{" "}
              <strong>{selectedNodeRoleLabel ?? editorT("shell.roles.undefined")}</strong>
            </p>
            {isGraphDiagram ? (
              <dl className="inspector-meta-list">
                <div>
                  <dt>{editorT("shell.inspector.dominantReading")}</dt>
                  <dd>
                    {graphSelectedNodeKindLabel ??
                      editorT("graph.nodeKinds.entity.labelOperational")}
                  </dd>
                </div>
                <div>
                  <dt>{editorT("shell.inspector.neighborhood")}</dt>
                  <dd>
                    {editorT("shell.inspector.neighborhoodSummary", {
                      incomingCount: selectedNodeRelations.incomingCount,
                      outgoingCount: selectedNodeRelations.outgoingCount,
                    })}
                  </dd>
                </div>
              </dl>
            ) : null}
            {isGraphDiagram && graphSelectedNodeKindDescription ? (
              <p className="helper">{graphSelectedNodeKindDescription}</p>
            ) : null}
            <ul className="summary-list">
              {selectedNodeStructureTips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {nodeInspectorErrors.label ? (
        <span className="helper field-error" role="alert">
          {nodeInspectorErrors.label}
        </span>
      ) : null}
      {nodeInspectorErrors.kind ? (
        <span className="helper field-error" role="alert">
          {nodeInspectorErrors.kind}
        </span>
      ) : null}

      {inspectorSections.relations ? (
        <div className="tile">
          <h4>{inspectorCopy.relationsSectionTitle}</h4>
          <p className="helper">
            {isGraphDiagram
              ? editorT("shell.relations.graphSummary", {
                  incomingCount: selectedNodeRelations.incomingCount,
                  outgoingCount: selectedNodeRelations.outgoingCount,
                })
              : editorT("shell.relations.flowSummary", {
                  incomingCount: selectedNodeRelations.incomingCount,
                  outgoingCount: selectedNodeRelations.outgoingCount,
                })}
          </p>
          {selectedNodeRelations.preview.length > 0 ? (
            <ul className="summary-list inspector-relation-list">
              {selectedNodeRelations.preview.map((relation) => (
                <li
                  key={relation.id}
                  className={`inspector-relation-item ${
                    relation.lane ? `inspector-relation-item--${relation.lane}` : ""
                  }`}
                >
                  <div className="inspector-relation-item__head">
                    <span className="badge">{relation.directionLabel}</span>
                  </div>
                  <p className="inspector-relation-item__peer">{relation.otherLabel}</p>
                  <p className="helper inspector-relation-item__path">
                    {`${relation.sourceLabel} -> ${relation.targetLabel}`}
                  </p>
                  <div className="row-actions inspector-relation-item__actions">
                    <button
                      className="btn btn-link"
                      type="button"
                      onClick={() =>
                        onOpenRelatedNodeFromRelation(relation.id, relation.otherNodeId)
                      }
                    >
                      {isGraphDiagram
                        ? editorT("shell.relations.openComponent")
                        : editorT("shell.relations.openRelatedNode")}
                    </button>
                    <button
                      className="btn btn-link"
                      type="button"
                      onClick={() => onOpenTransitionFromRelation(relation.id)}
                    >
                      {editorT("shell.relations.editConnection")}
                    </button>
                    <button
                      className="btn btn-link btn-danger"
                      type="button"
                      onClick={() => onRemoveRelation(relation.id)}
                    >
                      {editorT("selectionHud.remove")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="helper">
              {isGraphDiagram
                ? editorT("shell.relations.emptyGraph")
                : editorT("shell.relations.empty")}
            </p>
          )}
        </div>
      ) : null}

      {nodeInspectorMessage ? (
        <div
          className={`inspector-feedback ${nodeInspectorHasErrors ? "is-error" : ""}`}
          aria-live="polite"
          data-testid="inspector-node-feedback"
        >
          {nodeInspectorMessage}
        </div>
      ) : null}

      <div className="row-actions inspector-actions">
        <button
          className="btn btn-primary"
          type="button"
          onClick={onApplyNodeInspector}
          disabled={saveStatus === "saving"}
          data-testid="inspector-apply-node"
        >
          {editorT("shell.applyChanges")}
        </button>
        <button
          className="btn"
          type="button"
          onClick={onResetNodeInspector}
          data-testid="inspector-reset-node"
        >
          {editorT("shell.revert")}
        </button>
      </div>
    </div>
  );
}

type TechnicalNodeInspectorProps = {
  editorT: EditorTranslationFn;
  inspectorSections: InspectorSectionState;
  inspectorSelectionBadge: string;
  selectedNode: RFNode;
  nodeInspectorDraft: NodeInspectorDraft;
  setNodeInspectorDraft: Dispatch<SetStateAction<NodeInspectorDraft | null>>;
  nodeKindOptions: DiagramScopedNodeKindOption[];
  nodeInspectorDirty: boolean;
  nodeInspectorErrors: InspectorFieldErrors;
  nodeInspectorMessage: string | null;
  nodeInspectorHasErrors: boolean;
  saveStatus: "idle" | "dirty" | "saving" | "saved" | "error";
  onToggleInspectorSection: (sectionKey: keyof InspectorSectionState) => void;
  onFormatNodeJson: () => void;
  onCopyNodeJson: () => Promise<void>;
  onCopyNodeId: () => Promise<void>;
  onApplyNodeInspector: () => void;
  onResetNodeInspector: () => void;
};

export function TechnicalNodeInspector({
  editorT,
  inspectorSections,
  inspectorSelectionBadge,
  selectedNode,
  nodeInspectorDraft,
  setNodeInspectorDraft,
  nodeKindOptions,
  nodeInspectorDirty,
  nodeInspectorErrors,
  nodeInspectorMessage,
  nodeInspectorHasErrors,
  saveStatus,
  onToggleInspectorSection,
  onFormatNodeJson,
  onCopyNodeJson,
  onCopyNodeId,
  onApplyNodeInspector,
  onResetNodeInspector,
}: TechnicalNodeInspectorProps) {
  return (
    <div className="stack-sm">
      <div className="row-actions inspector-selection-row">
        <span className="badge">{inspectorSelectionBadge}</span>
        {nodeInspectorDirty ? (
          <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
            {editorT("shell.inspector.draftBadge")}
          </span>
        ) : null}
      </div>
      <span className="sr-only" data-testid="inspector-node-id">
        {selectedNode.id}
      </span>

      <div className="row-actions inspector-section-tabs">
        <button
          className="btn inspector-section-toggle"
          type="button"
          onClick={() => onToggleInspectorSection("general")}
          aria-expanded={inspectorSections.general}
          data-testid="inspector-section-general-toggle"
        >
          {editorT("shell.technical.generalSection")} {inspectorSections.general ? "▾" : "▸"}
        </button>
        <button
          className="btn inspector-section-toggle"
          type="button"
          onClick={() => onToggleInspectorSection("details")}
          aria-expanded={inspectorSections.details}
          data-testid="inspector-section-details-toggle"
        >
          {editorT("shell.technical.detailsSection")} {inspectorSections.details ? "▾" : "▸"}
        </button>
        <button
          className="btn inspector-section-toggle"
          type="button"
          onClick={() => onToggleInspectorSection("advanced")}
          aria-expanded={inspectorSections.advanced}
          data-testid="inspector-section-advanced-toggle"
        >
          {editorT("shell.technical.advancedSection")} {inspectorSections.advanced ? "▾" : "▸"}
        </button>
      </div>

      {inspectorSections.general ? (
        <>
          <div className="field">
            <label htmlFor="node-label-input">{editorT("shell.technical.node.label")}</label>
            <input
              id="node-label-input"
              data-testid="inspector-node-label"
              value={nodeInspectorDraft.label}
              onChange={(event) =>
                setNodeInspectorDraft((current) =>
                  current ? { ...current, label: event.target.value } : current,
                )
              }
            />
            {nodeInspectorErrors.label ? (
              <span className="helper field-error" role="alert">
                {nodeInspectorErrors.label}
              </span>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="node-kind-input">{editorT("shell.technical.node.rawKind")}</label>
            <select
              id="node-kind-input"
              data-testid="inspector-node-kind"
              value={nodeInspectorDraft.kind}
              onChange={(event) =>
                setNodeInspectorDraft((current) =>
                  current
                    ? {
                        ...current,
                        kind: event.target.value as NodeInspectorDraft["kind"],
                      }
                    : current,
                )
              }
            >
              {nodeKindOptions.map((option) => (
                <option key={option.kind} value={option.kind}>
                  {option.kind}
                  {option.outOfProfile ? editorT("shell.inspector.outOfProfileSuffix") : ""}
                </option>
              ))}
            </select>
            <span
              className="helper"
              title={getFriendlyNodeKindDescription(nodeInspectorDraft.kind, editorT)}
            >
              {editorT("shell.technical.friendlyLabel", {
                label: getFriendlyNodeKindLabel(nodeInspectorDraft.kind, editorT),
              })}
            </span>
            {nodeInspectorErrors.kind ? (
              <span className="helper field-error" role="alert">
                {nodeInspectorErrors.kind}
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      {inspectorSections.details ? (
        <div className="field">
          <label htmlFor="node-data-json-input">{editorT("shell.technical.node.dataJson")}</label>
          <div className="row-actions">
            <button className="btn" type="button" onClick={onFormatNodeJson}>
              {editorT("shell.technical.formatJson")}
            </button>
            <button className="btn" type="button" onClick={() => void onCopyNodeJson()}>
              {editorT("shell.technical.copyJson")}
            </button>
          </div>
          <textarea
            id="node-data-json-input"
            rows={8}
            className="mono"
            data-testid="inspector-node-data-json"
            value={nodeInspectorDraft.dataJson}
            onChange={(event) =>
              setNodeInspectorDraft((current) =>
                current ? { ...current, dataJson: event.target.value } : current,
              )
            }
          />
          {nodeInspectorErrors.dataJson ? (
            <span className="helper field-error" role="alert">
              {nodeInspectorErrors.dataJson}
            </span>
          ) : null}
        </div>
      ) : null}

      {nodeInspectorMessage ? (
        <div
          className={`inspector-feedback ${nodeInspectorHasErrors ? "is-error" : ""}`}
          aria-live="polite"
          data-testid="inspector-node-feedback"
        >
          {nodeInspectorMessage}
        </div>
      ) : null}

      <div className="row-actions inspector-actions">
        <button
          className="btn btn-primary"
          type="button"
          onClick={onApplyNodeInspector}
          disabled={saveStatus === "saving"}
          data-testid="inspector-apply-node"
        >
          {editorT("shell.applyChanges")}
        </button>
        <button
          className="btn"
          type="button"
          onClick={onResetNodeInspector}
          data-testid="inspector-reset-node"
        >
          {editorT("shell.revert")}
        </button>
      </div>

      {inspectorSections.advanced ? (
        <>
          <div className="row-actions">
            <span className="badge mono" data-testid="inspector-node-id">
              {selectedNode.id}
            </span>
            <button className="btn" type="button" onClick={() => void onCopyNodeId()}>
              {editorT("shell.technical.copyId")}
            </button>
          </div>
          <dl className="inspector-meta-list">
            <div>
              <dt>{editorT("shell.technical.position")}</dt>
              <dd data-testid="inspector-node-position">
                {Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)}
              </dd>
            </div>
          </dl>
        </>
      ) : null}
    </div>
  );
}

type GraphLikeOperationalEdgeInspectorProps = {
  editorT: EditorTranslationFn;
  diagramType: ContextualDiagramType;
  inspectorCopy: EditorDiagramInspectorCopy;
  inspectorSections: InspectorSectionState;
  inspectorSelectionState: InspectorSelectionState;
  selectedEdgeSourceLabel: string;
  selectedEdgeTargetLabel: string;
  operationalEdgeDraft: OperationalEdgeDraft;
  setOperationalEdgeDraft: Dispatch<SetStateAction<OperationalEdgeDraft | null>>;
  edgeKindOptions: EdgeKind[];
  edgeInspectorDirty: boolean;
  edgeInspectorErrors: InspectorFieldErrors;
  edgeInspectorMessage: string | null;
  edgeInspectorHasErrors: boolean;
  graphSelectedEdgeSemantic: GraphEdgeSemanticViewModel | null | undefined;
  saveStatus: "idle" | "dirty" | "saving" | "saved" | "error";
  onToggleInspectorSection: (sectionKey: keyof InspectorSectionState) => void;
  onApplyEdgeInspector: () => void;
  onResetEdgeInspector: () => void;
  onRemoveSelected: () => void;
};

export function GraphLikeOperationalEdgeInspector({
  editorT,
  diagramType,
  inspectorCopy,
  inspectorSections,
  inspectorSelectionState,
  selectedEdgeSourceLabel,
  selectedEdgeTargetLabel,
  operationalEdgeDraft,
  setOperationalEdgeDraft,
  edgeKindOptions,
  edgeInspectorDirty,
  edgeInspectorErrors,
  edgeInspectorMessage,
  edgeInspectorHasErrors,
  graphSelectedEdgeSemantic,
  saveStatus,
  onToggleInspectorSection,
  onApplyEdgeInspector,
  onResetEdgeInspector,
  onRemoveSelected,
}: GraphLikeOperationalEdgeInspectorProps) {
  return (
    <div className="stack-sm">
      <div className="row-actions inspector-selection-row">
        <span className="badge">
          {inspectorSelectionState.edgeSelected
            ? inspectorSelectionState.badgeLabel
            : editorT("shell.selection.edgeFocused")}
        </span>
        {edgeInspectorDirty ? (
          <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
            {editorT("shell.inspector.draftBadge")}
          </span>
        ) : null}
      </div>

      <div className="row-actions inspector-section-tabs">
        <button
          className="btn inspector-section-toggle"
          type="button"
          onClick={() => onToggleInspectorSection("general")}
          aria-expanded={inspectorSections.general}
          data-testid="inspector-section-general-toggle"
        >
          {inspectorCopy.edgeGeneralSectionTitle} {inspectorSections.general ? "▾" : "▸"}
        </button>
        <button
          className="btn inspector-section-toggle"
          type="button"
          onClick={() => onToggleInspectorSection("relations")}
          aria-expanded={inspectorSections.relations}
          data-testid="inspector-section-relations-toggle"
        >
          {inspectorCopy.relationsSectionTitle} {inspectorSections.relations ? "▾" : "▸"}
        </button>
      </div>

      {graphSelectedEdgeSemantic ? (
        <div
          className="tile inspector-context-tile inspector-context-tile--graph"
          data-testid="graph-edge-overview"
        >
          <div className="row-actions">
            <span className="badge">{graphSelectedEdgeSemantic.labelOperational}</span>
            <span className="badge">{graphSelectedEdgeSemantic.defaultVerbLabel}</span>
          </div>
          <h4>{editorT("shell.graph.edgeReadingTitle")}</h4>
          <p className="helper">
            {selectedEdgeSourceLabel} {" -> "} {selectedEdgeTargetLabel}
          </p>
          <p className="helper">{graphSelectedEdgeSemantic.description}</p>
        </div>
      ) : null}

      {inspectorSections.general ? (
        <>
          <div className="field">
            <label htmlFor="edge-label-operational-input">{inspectorCopy.edgeLabelLabel}</label>
            <input
              id="edge-label-operational-input"
              value={operationalEdgeDraft.label}
              onChange={(event) =>
                setOperationalEdgeDraft((current) =>
                  current ? { ...current, label: event.target.value } : current,
                )
              }
            />
          </div>

          <div className="field">
            <label htmlFor="edge-kind-operational-input">{inspectorCopy.edgeKindLabel}</label>
            <select
              id="edge-kind-operational-input"
              value={operationalEdgeDraft.kind}
              onChange={(event) =>
                setOperationalEdgeDraft((current) =>
                  current
                    ? {
                        ...current,
                        kind: event.target.value as OperationalEdgeDraft["kind"],
                      }
                    : current,
                )
              }
            >
              {edgeKindOptions.map((kind) => (
                <option key={kind} value={kind}>
                  {getEdgeKindLabelForDiagram(diagramType, kind, "operational", editorT)}
                </option>
              ))}
            </select>
            <span className="helper">
              {getEdgeKindDescriptionForDiagram(diagramType, operationalEdgeDraft.kind, editorT)}
            </span>
          </div>
        </>
      ) : null}

      {inspectorSections.relations ? (
        <dl className="inspector-meta-list">
          <div>
            <dt>{inspectorCopy.edgeSourceLabel}</dt>
            <dd>{selectedEdgeSourceLabel}</dd>
          </div>
          <div>
            <dt>{inspectorCopy.edgeTargetLabel}</dt>
            <dd>{selectedEdgeTargetLabel}</dd>
          </div>
        </dl>
      ) : null}

      {edgeInspectorErrors.label ? (
        <span className="helper field-error" role="alert">
          {edgeInspectorErrors.label}
        </span>
      ) : null}
      {edgeInspectorErrors.kind ? (
        <span className="helper field-error" role="alert">
          {edgeInspectorErrors.kind}
        </span>
      ) : null}

      {edgeInspectorMessage ? (
        <div
          className={`inspector-feedback ${edgeInspectorHasErrors ? "is-error" : ""}`}
          aria-live="polite"
          data-testid="inspector-edge-feedback"
        >
          {edgeInspectorMessage}
        </div>
      ) : null}

      <div className="row-actions inspector-actions">
        <button
          className="btn btn-primary"
          type="button"
          onClick={onApplyEdgeInspector}
          disabled={saveStatus === "saving"}
        >
          {editorT("shell.applyChanges")}
        </button>
        <button className="btn" type="button" onClick={onResetEdgeInspector}>
          {editorT("shell.revert")}
        </button>
        <button
          className="btn"
          type="button"
          onClick={onRemoveSelected}
          disabled={saveStatus === "saving"}
        >
          {editorT("shell.edgeActions.remove")}
        </button>
      </div>
    </div>
  );
}

type TechnicalEdgeInspectorProps = {
  editorT: EditorTranslationFn;
  inspectorSections: InspectorSectionState;
  inspectorSelectionState: InspectorSelectionState;
  selectedEdge: RFEdge;
  edgeInspectorDraft: EdgeInspectorDraft;
  setEdgeInspectorDraft: Dispatch<SetStateAction<EdgeInspectorDraft | null>>;
  edgeKindOptions: EdgeKind[];
  edgeInspectorDirty: boolean;
  edgeInspectorErrors: InspectorFieldErrors;
  edgeInspectorMessage: string | null;
  edgeInspectorHasErrors: boolean;
  saveStatus: "idle" | "dirty" | "saving" | "saved" | "error";
  onToggleInspectorSection: (sectionKey: keyof InspectorSectionState) => void;
  onFormatEdgeJson: () => void;
  onCopyEdgeJson: () => Promise<void>;
  onCopyEdgeId: () => Promise<void>;
  onApplyEdgeInspector: () => void;
  onResetEdgeInspector: () => void;
  onRemoveSelected: () => void;
};

export function TechnicalEdgeInspector({
  editorT,
  inspectorSections,
  inspectorSelectionState,
  selectedEdge,
  edgeInspectorDraft,
  setEdgeInspectorDraft,
  edgeKindOptions,
  edgeInspectorDirty,
  edgeInspectorErrors,
  edgeInspectorMessage,
  edgeInspectorHasErrors,
  saveStatus,
  onToggleInspectorSection,
  onFormatEdgeJson,
  onCopyEdgeJson,
  onCopyEdgeId,
  onApplyEdgeInspector,
  onResetEdgeInspector,
  onRemoveSelected,
}: TechnicalEdgeInspectorProps) {
  return (
    <div className="stack-sm">
      <div className="row-actions inspector-selection-row">
        <span className="badge">
          {inspectorSelectionState.edgeSelected
            ? inspectorSelectionState.badgeLabel
            : editorT("shell.selection.edgeFocused")}
        </span>
        {edgeInspectorDirty ? (
          <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
            {editorT("shell.inspector.draftBadge")}
          </span>
        ) : null}
      </div>

      <div className="row-actions inspector-section-tabs">
        <button
          className="btn inspector-section-toggle"
          type="button"
          onClick={() => onToggleInspectorSection("general")}
          aria-expanded={inspectorSections.general}
          data-testid="inspector-section-general-toggle"
        >
          {editorT("shell.technical.generalSection")} {inspectorSections.general ? "▾" : "▸"}
        </button>
        <button
          className="btn inspector-section-toggle"
          type="button"
          onClick={() => onToggleInspectorSection("details")}
          aria-expanded={inspectorSections.details}
          data-testid="inspector-section-details-toggle"
        >
          {editorT("shell.technical.detailsSection")} {inspectorSections.details ? "▾" : "▸"}
        </button>
        <button
          className="btn inspector-section-toggle"
          type="button"
          onClick={() => onToggleInspectorSection("advanced")}
          aria-expanded={inspectorSections.advanced}
          data-testid="inspector-section-advanced-toggle"
        >
          {editorT("shell.technical.advancedSection")} {inspectorSections.advanced ? "▾" : "▸"}
        </button>
      </div>

      {inspectorSections.general ? (
        <>
          <div className="field">
            <label htmlFor="edge-label-input">{editorT("shell.technical.edge.label")}</label>
            <input
              id="edge-label-input"
              value={edgeInspectorDraft.label}
              onChange={(event) =>
                setEdgeInspectorDraft((current) =>
                  current ? { ...current, label: event.target.value } : current,
                )
              }
            />
            {edgeInspectorErrors.label ? (
              <span className="helper field-error" role="alert">
                {edgeInspectorErrors.label}
              </span>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="edge-kind-input">{editorT("shell.technical.edge.rawKind")}</label>
            <select
              id="edge-kind-input"
              value={edgeInspectorDraft.kind}
              onChange={(event) =>
                setEdgeInspectorDraft((current) =>
                  current
                    ? {
                        ...current,
                        kind: event.target.value as EdgeInspectorDraft["kind"],
                      }
                    : current,
                )
              }
            >
              {edgeKindOptions.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
            <span
              className="helper"
              title={getFriendlyEdgeKindDescription(edgeInspectorDraft.kind, editorT)}
            >
              {editorT("shell.technical.friendlyLabel", {
                label: getFriendlyEdgeKindLabel(edgeInspectorDraft.kind, editorT),
              })}
            </span>
            {edgeInspectorErrors.kind ? (
              <span className="helper field-error" role="alert">
                {edgeInspectorErrors.kind}
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      {inspectorSections.details ? (
        <div className="field">
          <label htmlFor="edge-data-json-input">{editorT("shell.technical.edge.dataJson")}</label>
          <div className="row-actions">
            <button className="btn" type="button" onClick={onFormatEdgeJson}>
              {editorT("shell.technical.formatJson")}
            </button>
            <button className="btn" type="button" onClick={() => void onCopyEdgeJson()}>
              {editorT("shell.technical.copyJson")}
            </button>
          </div>
          <textarea
            id="edge-data-json-input"
            rows={8}
            className="mono"
            value={edgeInspectorDraft.dataJson}
            onChange={(event) =>
              setEdgeInspectorDraft((current) =>
                current ? { ...current, dataJson: event.target.value } : current,
              )
            }
          />
          {edgeInspectorErrors.dataJson ? (
            <span className="helper field-error" role="alert">
              {edgeInspectorErrors.dataJson}
            </span>
          ) : null}
        </div>
      ) : null}

      {edgeInspectorMessage ? (
        <div
          className={`inspector-feedback ${edgeInspectorHasErrors ? "is-error" : ""}`}
          aria-live="polite"
          data-testid="inspector-edge-feedback"
        >
          {edgeInspectorMessage}
        </div>
      ) : null}

      <div className="row-actions inspector-actions">
        <button
          className="btn btn-primary"
          type="button"
          onClick={onApplyEdgeInspector}
          disabled={saveStatus === "saving"}
        >
          {editorT("shell.applyChanges")}
        </button>
        <button className="btn" type="button" onClick={onResetEdgeInspector}>
          {editorT("shell.revert")}
        </button>
        <button
          className="btn"
          type="button"
          onClick={onRemoveSelected}
          disabled={saveStatus === "saving"}
        >
          {editorT("shell.edgeActions.remove")}
        </button>
      </div>

      {inspectorSections.advanced ? (
        <>
          <div className="row-actions">
            <span className="badge mono">{selectedEdge.id}</span>
            <button className="btn" type="button" onClick={() => void onCopyEdgeId()}>
              {editorT("shell.technical.copyId")}
            </button>
          </div>
          <dl className="inspector-meta-list">
            <div>
              <dt>{editorT("shell.technical.link")}</dt>
              <dd>
                {selectedEdge.source} -&gt; {selectedEdge.target}
              </dd>
            </div>
          </dl>
        </>
      ) : null}
    </div>
  );
}
