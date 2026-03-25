import {
  erdCardinalityFromPreset,
  erdCardinalityToPreset,
  type ErdCardinalityPreset,
} from "@/src/modules/erd/domain";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  getSemanticSeverityLabel,
  normalizeErdEntityPayloadFromNode,
  readIssueSuggestedFixes,
} from "../../shell/editor-shell-utils";
import {
  ERD_CARDINALITY_PRESETS,
  ERD_FIELD_FLAGS,
  ERD_LOGICAL_TYPES,
} from "../../shell/editor-shell-types";
import {
  GraphLikeOperationalEdgeInspector,
  GraphLikeOperationalNodeInspector,
  TechnicalEdgeInspector,
  TechnicalNodeInspector,
} from "./shared-mode-inspectors";
import type { EditorDiagramInspectorAdapterProps } from "./types";

function handleErdFieldEnter(
  event: ReactKeyboardEvent<HTMLInputElement>,
  fieldId: string,
  nextFieldId: string | undefined,
  props: EditorDiagramInspectorAdapterProps,
) {
  props.onErdFieldShortcut(event, fieldId);
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  props.onCommitErdFieldDraft(fieldId);
  if (nextFieldId) {
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLInputElement>(`[data-erd-field-input="${nextFieldId}:name"]`)
        ?.focus();
    });
    return;
  }

  props.onAddErdField();
}

export function ErdInspectorAdapter(props: EditorDiagramInspectorAdapterProps) {
  if (
    props.selectedNode &&
    props.inspectorMode === "operational" &&
    props.selectedNode.data.kind === "entity" &&
    props.selectedErdEntityPayload
  ) {
    const selectedEntityPayload = props.selectedErdEntityPayload;

    return (
      <div className="stack-sm erd-entity-inspector">
        <div className="row-actions inspector-selection-row">
          <span className="badge">{props.editorT("shell.erd.entity.badge")}</span>
          {props.nodeInspectorDirty ? (
            <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
              {props.editorT("shell.inspector.draftBadge")}
            </span>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="erd-entity-label-input">{props.editorT("shell.erd.entity.nameLabel")}</label>
          <input
            id="erd-entity-label-input"
            value={props.operationalNodeDraft?.label ?? props.selectedNode.data.label}
            onChange={(event) =>
              props.setOperationalNodeDraft((current) =>
                current ? { ...current, label: event.target.value } : current,
              )
            }
            data-testid="erd-entity-label-input"
          />
        </div>

        <div className="field">
          <label htmlFor="erd-entity-table-name-input">
            {props.editorT("shell.erd.entity.tableNameLabel")}
          </label>
          <input
            id="erd-entity-table-name-input"
            defaultValue={selectedEntityPayload.tableName ?? ""}
            key={`erd-table-name-${props.selectedNode.id}-${selectedEntityPayload.tableName ?? ""}`}
            onBlur={(event) => {
              const tableName = event.target.value.trim();
              props.onUpdateSelectedErdEntityPayload((payload) => ({
                ...payload,
                ...(tableName ? { tableName } : { tableName: undefined }),
              }));
            }}
            placeholder={props.editorT("shell.erd.entity.tableNamePlaceholder")}
            data-testid="erd-entity-table-name-input"
          />
        </div>

        <div className="field">
          <label htmlFor="erd-entity-description-input">
            {props.editorT("shell.erd.entity.descriptionLabel")}
          </label>
          <textarea
            id="erd-entity-description-input"
            rows={2}
            defaultValue={selectedEntityPayload.description ?? ""}
            key={`erd-description-${props.selectedNode.id}-${selectedEntityPayload.description ?? ""}`}
            onBlur={(event) => {
              const description = event.target.value.trim();
              props.onUpdateSelectedErdEntityPayload((payload) => ({
                ...payload,
                ...(description ? { description } : { description: undefined }),
              }));
            }}
            data-testid="erd-entity-description-input"
          />
        </div>

        <div className="erd-fields-grid" data-testid="erd-entity-fields-grid">
          <div className="erd-fields-grid-header">
            <span>{props.editorT("shell.erd.entity.grid.name")}</span>
            <span>{props.editorT("shell.erd.entity.grid.type")}</span>
            <span>{props.editorT("shell.erd.entity.grid.flags")}</span>
            <span>{props.editorT("shell.erd.entity.grid.actions")}</span>
          </div>
          {selectedEntityPayload.fields.map((field, index) => {
            const draft = props.erdFieldDrafts[field.id] ?? {
              name: field.name,
              type: field.type,
            };
            const nextField = selectedEntityPayload.fields[index + 1];

            return (
              <div
                key={field.id}
                className="erd-fields-grid-row"
                data-testid={`erd-field-row-${field.id}`}
              >
                <input
                  value={draft.name}
                  onChange={(event) =>
                    props.onUpdateErdFieldDraft(field.id, { name: event.target.value })
                  }
                  onBlur={() => props.onCommitErdFieldDraft(field.id)}
                  onKeyDown={(event) =>
                    handleErdFieldEnter(event, field.id, nextField?.id, props)
                  }
                  data-erd-field-input={`${field.id}:name`}
                  data-testid={`erd-field-name-input-${index}`}
                />
                <input
                  value={draft.type}
                  onChange={(event) =>
                    props.onUpdateErdFieldDraft(field.id, { type: event.target.value })
                  }
                  onBlur={() => props.onCommitErdFieldDraft(field.id)}
                  onKeyDown={(event) =>
                    handleErdFieldEnter(event, field.id, nextField?.id, props)
                  }
                  list="erd-logical-types"
                  data-erd-field-input={`${field.id}:type`}
                  data-testid={`erd-field-type-input-${index}`}
                />
                <div className="row-actions erd-field-flags">
                  {ERD_FIELD_FLAGS.map((flag) => (
                    <button
                      key={flag}
                      className={`btn btn-link erd-field-flag-chip ${
                        field.flags.includes(flag) ? "is-active" : ""
                      }`}
                      type="button"
                      onClick={() => props.onToggleErdFieldFlag(field.id, flag)}
                      data-testid={`erd-field-flag-${flag.toLowerCase()}-${index}`}
                    >
                      {flag === "NOT_NULL" ? "N" : flag}
                    </button>
                  ))}
                </div>
                <div className="row-actions">
                  <button
                    className="btn"
                    type="button"
                    onClick={() => props.onMoveErdField(field.id, "up")}
                    disabled={index === 0}
                    data-testid={`erd-field-move-up-${index}`}
                  >
                    ↑
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => props.onMoveErdField(field.id, "down")}
                    disabled={index === selectedEntityPayload.fields.length - 1}
                    data-testid={`erd-field-move-down-${index}`}
                  >
                    ↓
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => props.onRemoveErdField(field.id)}
                    data-testid={`erd-field-remove-${index}`}
                  >
                    {props.editorT("selectionHud.remove")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <datalist id="erd-logical-types">
          {ERD_LOGICAL_TYPES.map((type) => (
            <option key={type} value={type} />
          ))}
        </datalist>

        <div className="row-actions">
          <button
            className="btn"
            type="button"
            onClick={props.onAddErdField}
            data-testid="erd-fields-add-button"
          >
            {props.editorT("shell.erd.entity.addField")}
          </button>
          <span className="helper">{props.editorT("shell.erd.entity.keyboardHint")}</span>
        </div>

        {props.nodeInspectorMessage ? (
          <div
            className={`inspector-feedback ${props.nodeInspectorHasErrors ? "is-error" : ""}`}
            aria-live="polite"
            data-testid="inspector-node-feedback"
          >
            {props.nodeInspectorMessage}
          </div>
        ) : null}

        <div className="row-actions inspector-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={props.onApplyNodeInspector}
            disabled={props.saveStatus === "saving"}
            data-testid="inspector-apply-node"
          >
            {props.editorT("shell.applyChanges")}
          </button>
          <button
            className="btn"
            type="button"
            onClick={props.onResetNodeInspector}
            data-testid="inspector-reset-node"
          >
            {props.editorT("shell.revert")}
          </button>
        </div>
      </div>
    );
  }

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
        isGraphDiagram={false}
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
    (props.selectedEdge.data?.kind ?? "flows-to") === "references" &&
    props.selectedErdRelationPayload &&
    props.selectedEdgeSourceLabel &&
    props.selectedEdgeTargetLabel
  ) {
    return (
      <div className="stack-sm erd-relation-inspector">
        <div className="row-actions inspector-selection-row">
          <span className="badge">{props.editorT("shell.erd.relation.badge")}</span>
          {props.edgeInspectorDirty ? (
            <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
              {props.editorT("shell.inspector.draftBadge")}
            </span>
          ) : null}
        </div>

        <section className="inspector-section-body">
          <h4>{props.editorT("shell.erd.relation.sections.general")}</h4>
          <div className="field">
            <label htmlFor="erd-relation-name-input">
              {props.editorT("shell.erd.relation.nameLabel")}
            </label>
            <input
              id="erd-relation-name-input"
              defaultValue={props.selectedErdRelationPayload.name ?? ""}
              key={`erd-relation-name-${props.selectedEdge.id}-${props.selectedErdRelationPayload.name ?? ""}`}
              onBlur={(event) => {
                props.onUpdateSelectedErdRelationName(event.target.value);
              }}
              placeholder={props.editorT("shell.erd.relation.optionalPlaceholder")}
              data-testid="erd-relation-name-input"
            />
          </div>
          <div className="field">
            <label htmlFor="erd-relation-description-input">
              {props.editorT("shell.erd.relation.descriptionLabel")}
            </label>
            <textarea
              id="erd-relation-description-input"
              rows={2}
              defaultValue={props.selectedErdRelationPayload.description ?? ""}
              key={`erd-relation-description-${props.selectedEdge.id}-${props.selectedErdRelationPayload.description ?? ""}`}
              onBlur={(event) => {
                const description = event.target.value.trim();
                props.onUpdateSelectedErdRelationPayload((payload) => ({
                  ...payload,
                  ...(description ? { description } : { description: undefined }),
                }));
              }}
              data-testid="erd-relation-description-input"
            />
          </div>
          <dl className="inspector-meta-list">
            <div>
              <dt>{props.editorT("shell.erd.relation.source")}</dt>
              <dd>{props.selectedEdgeSourceLabel}</dd>
            </div>
            <div>
              <dt>{props.editorT("shell.erd.relation.target")}</dt>
              <dd>{props.selectedEdgeTargetLabel}</dd>
            </div>
          </dl>
          <div className="row-actions">
            <button
              className="btn"
              type="button"
              onClick={props.onSwapSelectedErdRelationDirection}
              data-testid="erd-relation-swap-direction"
            >
              {props.editorT("shell.erd.relation.swapDirection")}
            </button>
          </div>
        </section>

        <section className="inspector-section-body">
          <h4>{props.editorT("shell.erd.relation.sections.cardinality")}</h4>
          <div className="row-actions">
            {ERD_CARDINALITY_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`btn ${
                  erdCardinalityToPreset(props.selectedErdRelationPayload?.cardinality) === preset
                    ? "btn-primary"
                    : ""
                }`}
                onClick={() =>
                  props.onUpdateSelectedErdRelationPayload((payload) => ({
                    ...payload,
                    cardinality: erdCardinalityFromPreset(preset as ErdCardinalityPreset),
                  }))
                }
                data-testid={`erd-relation-cardinality-preset-${preset.replace(":", "-")}`}
              >
                {preset}
              </button>
            ))}
          </div>
          <div className="erd-cardinality-advanced">
            {(() => {
              const cardinality =
                props.selectedErdRelationPayload?.cardinality ??
                erdCardinalityFromPreset("1:N");

              return (
                <>
                  <label>
                    {props.editorT("shell.erd.relation.minSource")}
                    <select
                      value={String(cardinality.minSource)}
                      onChange={(event) =>
                        props.onUpdateSelectedErdRelationPayload((payload) => ({
                          ...payload,
                          cardinality: {
                            ...(payload.cardinality ?? cardinality),
                            minSource: event.target.value === "1" ? 1 : 0,
                          },
                        }))
                      }
                      data-testid="erd-cardinality-min-source"
                    >
                      <option value="0">0</option>
                      <option value="1">1</option>
                    </select>
                  </label>
                  <label>
                    {props.editorT("shell.erd.relation.maxSource")}
                    <select
                      value={String(cardinality.maxSource)}
                      onChange={(event) =>
                        props.onUpdateSelectedErdRelationPayload((payload) => ({
                          ...payload,
                          cardinality: {
                            ...(payload.cardinality ?? cardinality),
                            maxSource: event.target.value === "N" ? "N" : 1,
                          },
                        }))
                      }
                      data-testid="erd-cardinality-max-source"
                    >
                      <option value="1">1</option>
                      <option value="N">N</option>
                    </select>
                  </label>
                  <label>
                    {props.editorT("shell.erd.relation.minTarget")}
                    <select
                      value={String(cardinality.minTarget)}
                      onChange={(event) =>
                        props.onUpdateSelectedErdRelationPayload((payload) => ({
                          ...payload,
                          cardinality: {
                            ...(payload.cardinality ?? cardinality),
                            minTarget: event.target.value === "1" ? 1 : 0,
                          },
                        }))
                      }
                      data-testid="erd-cardinality-min-target"
                    >
                      <option value="0">0</option>
                      <option value="1">1</option>
                    </select>
                  </label>
                  <label>
                    {props.editorT("shell.erd.relation.maxTarget")}
                    <select
                      value={String(cardinality.maxTarget)}
                      onChange={(event) =>
                        props.onUpdateSelectedErdRelationPayload((payload) => ({
                          ...payload,
                          cardinality: {
                            ...(payload.cardinality ?? cardinality),
                            maxTarget: event.target.value === "N" ? "N" : 1,
                          },
                        }))
                      }
                      data-testid="erd-cardinality-max-target"
                    >
                      <option value="1">1</option>
                      <option value="N">N</option>
                    </select>
                  </label>
                  <label className="erd-cardinality-checkbox">
                    <input
                      type="checkbox"
                      checked={cardinality.minSource === 0}
                      onChange={(event) =>
                        props.onUpdateSelectedErdRelationPayload((payload) => ({
                          ...payload,
                          cardinality: {
                            ...(payload.cardinality ?? cardinality),
                            minSource: event.target.checked ? 0 : 1,
                          },
                        }))
                      }
                      data-testid="erd-cardinality-optional-source"
                    />
                    {props.editorT("shell.erd.relation.optionalSource")}
                  </label>
                  <label className="erd-cardinality-checkbox">
                    <input
                      type="checkbox"
                      checked={cardinality.minTarget === 0}
                      onChange={(event) =>
                        props.onUpdateSelectedErdRelationPayload((payload) => ({
                          ...payload,
                          cardinality: {
                            ...(payload.cardinality ?? cardinality),
                            minTarget: event.target.checked ? 0 : 1,
                          },
                        }))
                      }
                      data-testid="erd-cardinality-optional-target"
                    />
                    {props.editorT("shell.erd.relation.optionalTarget")}
                  </label>
                </>
              );
            })()}
          </div>
        </section>

        <section className="inspector-section-body">
          <h4>{props.editorT("shell.erd.relation.sections.roles")}</h4>
          <div className="field">
            <label htmlFor="erd-role-source-input">sourceRole</label>
            <input
              id="erd-role-source-input"
              defaultValue={props.selectedErdRelationPayload.roles?.sourceRole ?? ""}
              key={`erd-role-source-${props.selectedEdge.id}-${props.selectedErdRelationPayload.roles?.sourceRole ?? ""}`}
              onBlur={(event) => {
                const sourceRole = event.target.value.trim();
                props.onUpdateSelectedErdRelationPayload((payload) => ({
                  ...payload,
                  roles: {
                    ...(payload.roles ?? {}),
                    ...(sourceRole ? { sourceRole } : { sourceRole: undefined }),
                  },
                }));
              }}
              data-testid="erd-role-source-input"
            />
          </div>
          <div className="field">
            <label htmlFor="erd-role-target-input">targetRole</label>
            <input
              id="erd-role-target-input"
              defaultValue={props.selectedErdRelationPayload.roles?.targetRole ?? ""}
              key={`erd-role-target-${props.selectedEdge.id}-${props.selectedErdRelationPayload.roles?.targetRole ?? ""}`}
              onBlur={(event) => {
                const targetRole = event.target.value.trim();
                props.onUpdateSelectedErdRelationPayload((payload) => ({
                  ...payload,
                  roles: {
                    ...(payload.roles ?? {}),
                    ...(targetRole ? { targetRole } : { targetRole: undefined }),
                  },
                }));
              }}
              data-testid="erd-role-target-input"
            />
          </div>
          <p className="helper" data-testid="erd-role-preview">
            {props.selectedEdgeSourceLabel}{" "}
            {props.selectedErdRelationPayload.roles?.sourceRole ??
              props.editorT("shell.erd.relation.roleFallback")}
            {" / "}
            {props.selectedEdgeTargetLabel}{" "}
            {props.selectedErdRelationPayload.roles?.targetRole ??
              props.editorT("shell.erd.relation.roleFallback")}
          </p>
        </section>

        <section className="inspector-section-body">
          <h4>{props.editorT("shell.erd.relation.sections.materialization")}</h4>
          <p className="helper">
            {props.editorT("shell.erd.relation.currentState")}{" "}
            {props.selectedErdRelationPayload.materialization?.mode === "fk"
              ? props.editorT("shell.erd.relation.materialization.fk")
              : props.selectedErdRelationPayload.materialization?.mode === "associative"
                ? props.editorT("shell.erd.relation.materialization.associative")
                : props.editorT("shell.erd.relation.materialization.conceptual")}
          </p>
          <div className="erd-materialization-controls">
            <label>
              {props.editorT("shell.erd.relation.dependentSide")}
              <select
                value={props.erdMaterializeDependentSide}
                onChange={(event) =>
                  props.setErdMaterializeDependentSide(
                    event.target.value as "source" | "target",
                  )
                }
                data-testid="erd-materialize-dependent-side"
              >
                <option value="source">{props.editorT("shell.erd.relation.source")}</option>
                <option value="target">{props.editorT("shell.erd.relation.target")}</option>
              </select>
            </label>
            {(() => {
              const dependentEntityNode =
                props.erdMaterializeDependentSide === "source"
                  ? props.selectedErdSourceEntityNode
                  : props.selectedErdTargetEntityNode;
              const dependentFields = dependentEntityNode
                ? normalizeErdEntityPayloadFromNode(dependentEntityNode).fields
                : [];

              return (
                <label>
                  {props.editorT("shell.erd.relation.fkField")}
                  <select
                    value={props.erdMaterializeExistingFieldId}
                    onChange={(event) =>
                      props.setErdMaterializeExistingFieldId(event.target.value)
                    }
                    data-testid="erd-materialize-field-select"
                  >
                    <option value="__new__">
                      {props.editorT("shell.erd.relation.createNewField")}
                    </option>
                    {dependentFields.map((field) => (
                      <option key={field.id} value={field.id}>
                        {field.name}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })()}
            <label className="erd-cardinality-checkbox">
              <input
                type="checkbox"
                checked={props.erdMaterializeUnique}
                onChange={(event) => props.setErdMaterializeUnique(event.target.checked)}
                data-testid="erd-materialize-unique-toggle"
              />
              {props.editorT("shell.erd.relation.uniqueOnFk")}
            </label>
          </div>
          <div className="row-actions">
            <button
              className="btn"
              type="button"
              onClick={props.onMaterializeSelectedErdRelationAsFk}
              data-testid="erd-materialize-fk-button"
            >
              {props.editorT("shell.erd.relation.materializeFk")}
            </button>
            <button
              className="btn"
              type="button"
              onClick={props.onApplySelectedErdOneToOneUniqueFix}
              data-testid="erd-materialize-apply-unique-button"
            >
              {props.editorT("shell.erd.relation.applyUnique")}
            </button>
            <button
              className="btn"
              type="button"
              onClick={props.onConvertSelectedErdRelationToAssociative}
              disabled={
                erdCardinalityToPreset(props.selectedErdRelationPayload.cardinality) !== "N:N"
              }
              data-testid="erd-convert-associative-button"
            >
              {props.editorT("shell.erd.relation.convertAssociative")}
            </button>
            <button
              className="btn"
              type="button"
              onClick={props.onMarkSelectedErdRelationConceptual}
              disabled={!props.erdPolicy.allowConceptualRelations}
              data-testid="erd-mark-conceptual-button"
            >
              {props.editorT("shell.erd.relation.markConceptual")}
            </button>
          </div>
        </section>

        <section className="inspector-section-body">
          <h4>{props.editorT("shell.erd.relation.sections.referentialIntegrity")}</h4>
          <div className="erd-cardinality-advanced">
            <label>
              onDelete
              <select
                value={props.selectedErdRelationPayload.referentialActions?.onDelete ?? ""}
                onChange={(event) =>
                  props.onUpdateSelectedErdRelationPayload((payload) => ({
                    ...payload,
                    referentialActions: {
                      ...(payload.referentialActions ?? {}),
                      ...(event.target.value
                        ? {
                            onDelete: event.target.value as
                              | "restrict"
                              | "cascade"
                              | "setNull"
                              | "noAction",
                          }
                        : { onDelete: undefined }),
                    },
                  }))
                }
                data-testid="erd-referential-on-delete"
              >
                <option value="">{props.editorT("shell.erd.relation.defaultOption")}</option>
                <option value="restrict">restrict</option>
                <option value="cascade">cascade</option>
                <option value="setNull">setNull</option>
                <option value="noAction">noAction</option>
              </select>
            </label>
            <label>
              onUpdate
              <select
                value={props.selectedErdRelationPayload.referentialActions?.onUpdate ?? ""}
                onChange={(event) =>
                  props.onUpdateSelectedErdRelationPayload((payload) => ({
                    ...payload,
                    referentialActions: {
                      ...(payload.referentialActions ?? {}),
                      ...(event.target.value
                        ? {
                            onUpdate: event.target.value as
                              | "restrict"
                              | "cascade"
                              | "setNull"
                              | "noAction",
                          }
                        : { onUpdate: undefined }),
                    },
                  }))
                }
                data-testid="erd-referential-on-update"
              >
                <option value="">{props.editorT("shell.erd.relation.defaultOption")}</option>
                <option value="restrict">restrict</option>
                <option value="cascade">cascade</option>
                <option value="setNull">setNull</option>
                <option value="noAction">noAction</option>
              </select>
            </label>
          </div>
        </section>

        <section className="inspector-section-body">
          <h4>{props.editorT("shell.erd.relation.sections.diagnostics")}</h4>
          {props.selectedErdRelationIssues.length > 0 ? (
            <ul className="summary-list">
              {props.selectedErdRelationIssues.map((issue) => (
                <li key={issue.id}>
                  <span>
                    {getSemanticSeverityLabel(issue.severity, props.editorT)}: {issue.message}
                  </span>
                  <div className="row-actions">
                    <button
                      className="btn btn-link"
                      type="button"
                      onClick={() => props.onFocusSemanticIssue(issue)}
                      data-testid={`erd-relation-issue-goto-${issue.id}`}
                    >
                      {props.editorT("shell.audit.goToIssue")}
                    </button>
                    {readIssueSuggestedFixes(issue).map((fix) => (
                      <button
                        key={fix.id}
                        className="btn"
                        type="button"
                        onClick={() => props.onApplyErdSuggestedFix(fix.commands)}
                        data-testid={`erd-relation-issue-fix-${fix.id}`}
                      >
                        {fix.label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="helper">{props.editorT("shell.erd.relation.diagnosticsEmpty")}</p>
          )}
        </section>

        {props.edgeInspectorMessage ? (
          <div
            className={`inspector-feedback ${props.edgeInspectorHasErrors ? "is-error" : ""}`}
            aria-live="polite"
            data-testid="inspector-edge-feedback"
          >
            {props.edgeInspectorMessage}
          </div>
        ) : null}

        <div className="row-actions inspector-actions">
          <button
            className="btn"
            type="button"
            onClick={props.onRemoveSelected}
            disabled={props.saveStatus === "saving"}
            data-testid="erd-relation-remove-button"
          >
            {props.editorT("shell.erd.relation.remove")}
          </button>
        </div>
      </div>
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
