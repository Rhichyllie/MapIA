"use client";

import { useEditorTranslations } from "../use-editor-translations";
import type { EditorTranslationFn } from "../editor-i18n";
import type { OperationalNodeDraft } from "../editor-inspector-personas";
import type {
  ProcessInspectorCopy,
  ProcessNodeOverview,
  ProcessNodeRole,
  ProcessRelationsViewModel,
} from "../presentation/process-semantics";
import {
  getProcessCriticalityOptions,
  getProcessQuickAddRoleOptions,
  getProcessRoleMeta,
} from "../presentation/process-semantics";

type ProcessInspectorAction = {
  id: string;
  label: string;
  onClick: () => void;
};

type ProcessNodeRelation = ProcessRelationsViewModel["preview"][number];

type InspectorSectionState = {
  general: boolean;
  details: boolean;
  relations: boolean;
};

function resolveRelationOpenLabel(
  relation: ProcessNodeRelation,
  t: EditorTranslationFn,
) {
  if (relation.direction === "incoming") {
    return t("processInspector.node.openPrevious");
  }

  if (relation.lane === "branch") {
    return t("processInspector.node.openBranch");
  }

  if (relation.lane === "note") {
    return t("processInspector.node.openNote");
  }

  return t("processInspector.node.openNext");
}

export function ProcessOperationalNodeInspector({
  copy,
  overview,
  relations,
  draft,
  selectedRole,
  sections,
  tagPreview,
  nodeInspectorErrors,
  nodeInspectorMessage,
  nodeInspectorHasErrors,
  isSaving,
  primaryAction,
  secondaryActions,
  onToggleSection,
  onLabelChange,
  onRoleChange,
  onDescriptionChange,
  onTagsChange,
  onOwnerChange,
  onAreaChange,
  onChannelChange,
  onCriticalityChange,
  onSlaChange,
  onRuleChange,
  onExceptionChange,
  onOpenRelatedNode,
  onOpenTransition,
  onRemoveRelation,
  onApply,
  onReset,
}: {
  copy: ProcessInspectorCopy;
  overview: ProcessNodeOverview;
  relations: ProcessRelationsViewModel;
  draft: OperationalNodeDraft;
  selectedRole: ProcessNodeRole;
  sections: InspectorSectionState;
  tagPreview: string[];
  nodeInspectorErrors: {
    label?: string;
    kind?: string;
  };
  nodeInspectorMessage: string | null;
  nodeInspectorHasErrors: boolean;
  isSaving: boolean;
  primaryAction: ProcessInspectorAction;
  secondaryActions: ProcessInspectorAction[];
  onToggleSection: (section: keyof InspectorSectionState) => void;
  onLabelChange: (value: string) => void;
  onRoleChange: (role: ProcessNodeRole) => void;
  onDescriptionChange: (value: string) => void;
  onTagsChange: (value: string) => void;
  onOwnerChange: (value: string) => void;
  onAreaChange: (value: string) => void;
  onChannelChange: (value: string) => void;
  onCriticalityChange: (value: string) => void;
  onSlaChange: (value: string) => void;
  onRuleChange: (value: string) => void;
  onExceptionChange: (value: string) => void;
  onOpenRelatedNode: (relationId: string, otherNodeId: string) => void;
  onOpenTransition: (relationId: string) => void;
  onRemoveRelation: (relationId: string) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  const t = useEditorTranslations() as unknown as EditorTranslationFn;
  const processRoleOptions = getProcessQuickAddRoleOptions(t);
  const criticalityOptions = getProcessCriticalityOptions(t);
  const selectedRoleMeta = getProcessRoleMeta(selectedRole, t);

  return (
    <div className="stack-sm inspector-process-stack inspector-process-node">
      <section
        className="tile inspector-context-tile inspector-context-tile--process inspector-process-overview"
        data-testid="process-inspector-overview"
      >
        <div className="row-actions inspector-process-overview__badges">
          <span className="badge">{overview.badgeLabel}</span>
          <span className="badge">{overview.kindLabel}</span>
          {relations.summaryChips.map((chip) => (
            <span key={chip.id} className="badge">
              {chip.label}: {chip.count}
            </span>
          ))}
        </div>
        <div className="inspector-process-overview__body">
          <div className="inspector-process-overview__copy">
            <h4>{t("processInspector.node.flowReadingTitle")}</h4>
            <p className="helper inspector-process-overview__summary">{overview.summary}</p>
            <div className="row-actions inspector-process-overview__operations">
              {overview.operationalHighlights.length > 0 ? (
                overview.operationalHighlights.map((highlight) => (
                  <span
                    key={highlight.id}
                    className={`badge badge-process-${highlight.tone}`}
                  >
                    {highlight.label}
                  </span>
                ))
              ) : (
                <span className="helper">
                  {copy.operationsSummaryEmpty}
                </span>
              )}
            </div>
          </div>
          <dl className="inspector-meta-list inspector-meta-list--process">
            <div>
              <dt>{t("processInspector.node.positionLabel")}</dt>
              <dd>{overview.positionLabel}</dd>
            </div>
            <div>
              <dt>{t("processInspector.node.connectivityLabel")}</dt>
              <dd>{overview.connectivityLabel}</dd>
            </div>
          </dl>
        </div>
        <ul className="summary-list inspector-process-overview__guidance">
          {overview.guidance.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
        <div
          className="row-actions inspector-process-overview__actions"
          data-testid="process-inspector-context-actions"
        >
          <button className="btn" type="button" onClick={primaryAction.onClick}>
            {primaryAction.label}
          </button>
          {secondaryActions.map((action) => (
            <button
              key={action.id}
              className="btn"
              type="button"
              onClick={action.onClick}
              data-testid={`process-inspector-action-${action.id}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>

      <div className="row-actions inspector-section-tabs inspector-section-tabs--process">
        <button
          className="btn inspector-section-toggle"
          type="button"
          onClick={() => onToggleSection("general")}
          aria-expanded={sections.general}
          data-testid="inspector-section-general-toggle"
        >
          {copy.generalSectionTitle} {sections.general ? "▾" : "▸"}
        </button>
        <button
          className="btn inspector-section-toggle"
          type="button"
          onClick={() => onToggleSection("details")}
          aria-expanded={sections.details}
          data-testid="inspector-section-details-toggle"
        >
          {copy.detailsSectionTitle} {sections.details ? "▾" : "▸"}
        </button>
        <button
          className="btn inspector-section-toggle"
          type="button"
          onClick={() => onToggleSection("relations")}
          aria-expanded={sections.relations}
          data-testid="inspector-section-relations-toggle"
        >
          {copy.relationsSectionTitle} {sections.relations ? "▾" : "▸"}
        </button>
      </div>

      {sections.general ? (
        <section
          className="tile inspector-process-section inspector-process-section--general"
          data-testid="process-inspector-identification"
        >
          <div className="inspector-process-section__header">
            <h4>{copy.generalSectionTitle}</h4>
            <p className="helper">
              {t("processInspector.node.generalHelper")}
            </p>
          </div>

          <div className="field field--process">
            <label htmlFor="node-title-input">{copy.titleLabel}</label>
            <input
              id="node-title-input"
              data-testid="inspector-node-label"
              value={draft.label}
              onChange={(event) => onLabelChange(event.target.value)}
            />
          </div>

          <div className="field field--process">
            <label htmlFor="node-kind-operational-input">{copy.kindLabel}</label>
            <select
              id="node-kind-operational-input"
              data-testid="inspector-node-kind"
              value={selectedRole}
              onChange={(event) =>
                onRoleChange(event.target.value as ProcessNodeRole)
              }
            >
              {processRoleOptions.map((option) => (
                <option key={option.role} value={option.role}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="helper">{selectedRoleMeta.summary}</span>
          </div>
        </section>
      ) : null}

      {sections.details ? (
        <section
          className="tile inspector-process-section inspector-process-section--details"
          data-testid="process-inspector-details"
        >
          <div className="inspector-process-section__header">
            <h4>{copy.detailsSectionTitle}</h4>
            <p className="helper">
              {t("processInspector.node.detailsHelper")}
            </p>
          </div>

          <div className="field field--process">
            <label htmlFor="node-description-operational-input">{copy.descriptionLabel}</label>
            <textarea
              id="node-description-operational-input"
              rows={5}
              value={draft.description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder={copy.descriptionPlaceholder}
              data-testid="inspector-node-description"
            />
          </div>

          <div className="field field--process">
            <label htmlFor="node-tags-operational-input">{copy.tagsLabel}</label>
            <input
              id="node-tags-operational-input"
              value={draft.tagsText}
              onChange={(event) => onTagsChange(event.target.value)}
              placeholder={copy.tagsPlaceholder}
              data-testid="inspector-node-tags"
            />
            <span className="helper">{copy.tagsHelper}</span>
          </div>

          <div className="inspector-process-grid">
            <div className="field field--process">
              <label htmlFor="process-owner-input">{copy.ownerLabel}</label>
              <input
                id="process-owner-input"
                value={draft.owner}
                onChange={(event) => onOwnerChange(event.target.value)}
                placeholder={copy.ownerPlaceholder}
              />
            </div>

            <div className="field field--process">
              <label htmlFor="process-area-input">{copy.areaLabel}</label>
              <input
                id="process-area-input"
                value={draft.area}
                onChange={(event) => onAreaChange(event.target.value)}
                placeholder={copy.areaPlaceholder}
              />
            </div>

            <div className="field field--process">
              <label htmlFor="process-channel-input">{copy.channelLabel}</label>
              <input
                id="process-channel-input"
                value={draft.channel}
                onChange={(event) => onChannelChange(event.target.value)}
                placeholder={copy.channelPlaceholder}
              />
            </div>

            <div className="field field--process">
              <label htmlFor="process-criticality-input">{copy.criticalityLabel}</label>
              <select
                id="process-criticality-input"
                value={draft.criticality}
                onChange={(event) => onCriticalityChange(event.target.value)}
              >
                {criticalityOptions.map((option) => (
                  <option key={option.value || "none"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field field--process">
              <label htmlFor="process-sla-input">{copy.slaLabel}</label>
              <input
                id="process-sla-input"
                value={draft.sla}
                onChange={(event) => onSlaChange(event.target.value)}
                placeholder={copy.slaPlaceholder}
              />
            </div>
          </div>

          <div className="field field--process">
            <label htmlFor="process-rule-input">{copy.ruleLabel}</label>
            <textarea
              id="process-rule-input"
              rows={3}
              value={draft.rule}
              onChange={(event) => onRuleChange(event.target.value)}
              placeholder={copy.rulePlaceholder}
            />
          </div>

          <div className="field field--process">
            <label htmlFor="process-exception-input">{copy.exceptionLabel}</label>
            <textarea
              id="process-exception-input"
              rows={3}
              value={draft.exception}
              onChange={(event) => onExceptionChange(event.target.value)}
              placeholder={copy.exceptionPlaceholder}
            />
          </div>

          {tagPreview.length > 0 ? (
            <div className="row-actions inspector-process-tags-preview">
              {tagPreview.map((tag) => (
                <span key={tag} className="badge">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </section>
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

      {sections.relations ? (
        <section
          className="tile inspector-relations-tile--process inspector-process-section inspector-process-section--relations"
          data-testid="process-relations-panel"
        >
          <div className="inspector-process-section__header">
            <h4>{copy.relationsSectionTitle}</h4>
            <p className="helper">
              {t("processInspector.node.relationsHelper", {
                incomingCount: relations.incomingCount,
                outgoingCount: relations.outgoingCount,
                previewCount: relations.preview.length,
              })}
            </p>
          </div>
          {relations.summaryChips.length > 0 ? (
            <div className="row-actions inspector-relation-summary">
              {relations.summaryChips.map((chip) => (
                <span key={chip.id} className="badge">
                  {chip.label}: {chip.count}
                </span>
              ))}
            </div>
          ) : null}
          {relations.preview.length > 0 ? (
            <ul className="summary-list inspector-relation-list">
              {relations.preview.map((relation) => (
                <li
                  key={relation.id}
                  className={`inspector-relation-item inspector-relation-item--${relation.lane}`}
                  data-testid={`process-relation-item-${relation.id}`}
                >
                  <div className="inspector-relation-item__head">
                    <span className="badge">{relation.laneLabel}</span>
                  </div>
                  <p className="inspector-relation-item__peer">{relation.otherLabel}</p>
                  <p className="helper inspector-relation-item__path">
                    <strong>{relation.transitionLabel}</strong>
                    {relation.relationLabel ? <span>{relation.relationLabel}</span> : null}
                  </p>
                  <p className="helper inspector-relation-item__support">
                    {relation.supportingLabel}
                  </p>
                  <div className="row-actions inspector-relation-item__actions">
                    <button
                      className="btn btn-link"
                      type="button"
                      onClick={() => onOpenRelatedNode(relation.id, relation.otherNodeId)}
                    >
                      {resolveRelationOpenLabel(relation, t)}
                    </button>
                    <button
                      className="btn btn-link"
                      type="button"
                      onClick={() => onOpenTransition(relation.id)}
                    >
                      {t("processInspector.node.openTransition")}
                    </button>
                    <button
                      className="btn btn-link btn-danger"
                      type="button"
                      onClick={() => onRemoveRelation(relation.id)}
                    >
                      {t("selectionHud.remove")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="helper">{copy.relationsEmptyState}</p>
          )}
        </section>
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
          onClick={onApply}
          disabled={isSaving}
          data-testid="inspector-apply-node"
        >
          {t("shell.applyChanges")}
        </button>
        <button
          className="btn"
          type="button"
          onClick={onReset}
          data-testid="inspector-reset-node"
        >
          {t("shell.revert")}
        </button>
      </div>
    </div>
  );
}
