import {
  buildWhatWillBeCreatedSummary,
  getDetailLevelLabel,
  getInitialViewLabel,
  getLayoutChoiceLabel,
  getProjectProfileLabel,
  getStartSourceLabel,
  getStartStrategyLabel,
  getTemplatePresetLabel,
  type AssistantDraft,
  type StartStrategyRecommendation,
} from "@/src/modules/creation-assistant/domain";

type ReviewStepProps = {
  draft: AssistantDraft;
  sourceStatusSummary: string;
  sourceStatusCode: AssistantDraft["sourceStatus"];
  recommendedStartStrategy: StartStrategyRecommendation;
  legacyLayoutWarning: string | null;
  enabledAutomationLabels: string[];
};

export function ReviewStep({
  draft,
  sourceStatusSummary,
  sourceStatusCode,
  recommendedStartStrategy,
  legacyLayoutWarning,
  enabledAutomationLabels,
}: ReviewStepProps) {
  return (
    <div className="stack-sm">
      <section className="tile">
        <ul className="summary-list">
          <li>
            <strong>Nome:</strong> {draft.projectName}
          </li>
          <li>
            <strong>Perfil:</strong> {getProjectProfileLabel(draft.profile)}
          </li>
          <li>
            <strong>Origem:</strong> {getStartStrategyLabel(draft.startStrategy)}
          </li>
          <li>
            <strong>Visao:</strong> {getInitialViewLabel(draft.initialView)}
          </li>
          <li>
            <strong>Layout:</strong> {getLayoutChoiceLabel(draft.layout)}
          </li>
          <li>
            <strong>Detalhe:</strong> {getDetailLevelLabel(draft.detailLevel)}
          </li>
          <li>
            <strong>Blocos sugeridos:</strong> {draft.context.setup?.suggestedBlockCount ?? 3}
          </li>
          <li>
            <strong>No raiz inicial:</strong>{" "}
            {draft.context.setup?.createInitialRoot
              ? (draft.context.setup.initialRootName ?? "Ativo")
              : "Desativado"}
          </li>
          <li>
            <strong>Automacao:</strong>{" "}
            {enabledAutomationLabels.length > 0
              ? enabledAutomationLabels.join(", ")
              : "Sem automacoes ativas"}
          </li>
          <li>
            <strong>Fonte:</strong>{" "}
            {draft.startStrategy === "template"
              ? draft.templatePreset
                ? getTemplatePresetLabel(draft.templatePreset)
                : "Nao selecionado"
              : draft.startSource
                ? getStartSourceLabel(draft.startSource)
                : "Nao selecionada"}
          </li>
          <li>
            <strong>Status da fonte:</strong> {sourceStatusSummary}
          </li>
          <li>
            <strong>Estrategia recomendada:</strong>{" "}
            {getStartStrategyLabel(recommendedStartStrategy.strategy)}
          </li>
        </ul>
        {legacyLayoutWarning ? <p className="helper">{legacyLayoutWarning}</p> : null}
        <p>
          {buildWhatWillBeCreatedSummary({
            profile: draft.profile,
            initialView: draft.initialView,
            layout: draft.layout,
            automation: draft.automation,
            sourceStatus: sourceStatusCode,
          })}
        </p>
      </section>
    </div>
  );
}
