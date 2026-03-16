import type { EdgeKind } from "@/src/domain";
import {
  getEdgeKindDescriptionForDiagram,
  getEdgeKindLabelForDiagram,
} from "../presentation/kinds";
import type {
  ProcessEdgeOverview,
  ProcessInspectorCopy,
} from "../presentation/process-semantics";

type InspectorSectionState = {
  general: boolean;
  relations: boolean;
};

export function ProcessOperationalEdgeInspector({
  copy,
  overview,
  draft,
  edgeKindOptions,
  sections,
  sourceLabel,
  targetLabel,
  edgeReadingKind,
  edgeInspectorErrors,
  edgeInspectorMessage,
  edgeInspectorHasErrors,
  isSaving,
  onToggleSection,
  onLabelChange,
  onKindChange,
  onApply,
  onReset,
  onRemove,
}: {
  copy: ProcessInspectorCopy;
  overview: ProcessEdgeOverview;
  draft: {
    label: string;
    kind: EdgeKind;
  };
  edgeKindOptions: readonly EdgeKind[];
  sections: InspectorSectionState;
  sourceLabel: string;
  targetLabel: string;
  edgeReadingKind: EdgeKind;
  edgeInspectorErrors: {
    label?: string;
    kind?: string;
  };
  edgeInspectorMessage: string | null;
  edgeInspectorHasErrors: boolean;
  isSaving: boolean;
  onToggleSection: (section: keyof InspectorSectionState) => void;
  onLabelChange: (value: string) => void;
  onKindChange: (kind: EdgeKind) => void;
  onApply: () => void;
  onReset: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="stack-sm inspector-process-stack inspector-process-edge">
      <section
        className="tile inspector-context-tile inspector-context-tile--process inspector-process-section"
        data-testid="process-edge-overview"
      >
        <div className="row-actions">
          <span className="badge">{overview.badgeLabel}</span>
          <span className="badge">{overview.transitionTypeLabel}</span>
        </div>
        <h4>Leitura da transicao</h4>
        <p className="helper">{overview.summary}</p>
        <ul className="summary-list">
          {overview.guidance.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </section>

      <div className="row-actions inspector-section-tabs inspector-section-tabs--process">
        <button
          className="btn inspector-section-toggle"
          type="button"
          onClick={() => onToggleSection("general")}
          aria-expanded={sections.general}
          data-testid="inspector-section-general-toggle"
        >
          {copy.edgeGeneralSectionTitle} {sections.general ? "▾" : "▸"}
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
        <section className="tile inspector-process-section inspector-process-section--general">
          <div className="field field--process">
            <label htmlFor="edge-label-operational-input">{copy.edgeLabelLabel}</label>
            <input
              id="edge-label-operational-input"
              value={draft.label}
              onChange={(event) => onLabelChange(event.target.value)}
            />
          </div>

          <div className="field field--process">
            <label htmlFor="edge-kind-operational-input">{copy.edgeKindLabel}</label>
            <select
              id="edge-kind-operational-input"
              value={draft.kind}
              onChange={(event) => onKindChange(event.target.value as EdgeKind)}
            >
              {edgeKindOptions.map((kind) => (
                <option key={kind} value={kind}>
                  {getEdgeKindLabelForDiagram("flow", kind, "operational")}
                </option>
              ))}
            </select>
            <span className="helper">
              {getEdgeKindDescriptionForDiagram("flow", draft.kind)}
            </span>
          </div>
        </section>
      ) : null}

      {sections.relations ? (
        <section className="tile inspector-process-section inspector-process-section--relations">
          <dl className="inspector-meta-list inspector-meta-list--process">
            <div>
              <dt>{copy.edgeSourceLabel}</dt>
              <dd>{sourceLabel}</dd>
            </div>
            <div>
              <dt>{copy.edgeTargetLabel}</dt>
              <dd>{targetLabel}</dd>
            </div>
            <div>
              <dt>Leitura</dt>
              <dd>{getEdgeKindLabelForDiagram("flow", edgeReadingKind, "operational")}</dd>
            </div>
          </dl>
        </section>
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
          onClick={onApply}
          disabled={isSaving}
        >
          Aplicar alteracoes
        </button>
        <button className="btn" type="button" onClick={onReset}>
          Reverter
        </button>
        <button className="btn" type="button" onClick={onRemove} disabled={isSaving}>
          Remover transicao
        </button>
      </div>
    </div>
  );
}
