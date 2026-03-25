import { CardOption } from "@/src/components/ui/card-option";
import {
  buildDefaultSourceConfigForSource,
  getAllowedStartSourcesForProfile,
  getAllowedTemplatePresetsForProfile,
  type AssistantDraft,
  type StartSource,
  type StartStrategyRecommendation,
  type TemplatePreset,
} from "@/src/modules/creation-assistant/domain";
import type { CreationAssistantLabels } from "../creation-assistant-i18n";
import { START_STRATEGY_VALUES } from "../shared";
import { GenericSourceForm } from "../source-forms/generic-source-form";
import { GraphQlSourceForm } from "../source-forms/graph-ql-source-form";
import { OpenApiSourceForm } from "../source-forms/open-api-source-form";
import { PostgresSourceForm } from "../source-forms/postgres-source-form";
import { PrismaSchemaSourceForm } from "../source-forms/prisma-schema-source-form";

type OriginStepProps = {
  draft: AssistantDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssistantDraft>>;
  recommendedStartStrategy: StartStrategyRecommendation;
  startSources: StartSource[];
  templatePresets: TemplatePreset[];
  sourceStatusLabel: string;
  sourceStatusSummary: string;
  isConnectLaterSelected: boolean;
  sourcePreview: NonNullable<
    ReturnType<CreationAssistantLabels["getSourcePreviewCopy"]>
  > | null;
  mode: "new" | "existing";
  fromProjectId?: string;
  isBusy: boolean;
  validatePrismaSource: () => Promise<void>;
  labels: CreationAssistantLabels;
};

export function OriginStep({
  draft,
  setDraft,
  labels,
  recommendedStartStrategy,
  startSources,
  templatePresets,
  sourceStatusLabel,
  sourceStatusSummary,
  isConnectLaterSelected,
  sourcePreview,
  mode,
  fromProjectId,
  isBusy,
  validatePrismaSource,
}: OriginStepProps) {
  return (
    <div className="stack-sm">
      <div className="tile">
        <div className="row-actions row-actions-between">
          <p className="helper">
            {labels.shell.recommendedBecause(
              labels.getStartStrategyRecommendationReason(
                recommendedStartStrategy.reasonCode,
              ),
            )}
          </p>
          {draft.startStrategy !== recommendedStartStrategy.strategy ? (
            <button
              className="btn"
              type="button"
              onClick={() =>
                setDraft((current) => {
                  const strategy = recommendedStartStrategy.strategy;
                  const allowedSources = getAllowedStartSourcesForProfile(current.profile);
                  const allowedTemplates =
                    getAllowedTemplatePresetsForProfile(current.profile);

                  if (strategy === "manual") {
                    return {
                      ...current,
                      startStrategy: "manual",
                      startSource: undefined,
                      sourceConfig: undefined,
                      templatePreset: undefined,
                    };
                  }

                  if (strategy === "template") {
                    return {
                      ...current,
                      startStrategy: "template",
                      startSource: undefined,
                      sourceConfig: undefined,
                      templatePreset: current.templatePreset ?? allowedTemplates[0],
                    };
                  }

                  const source = current.startSource ?? allowedSources[0];
                  return {
                    ...current,
                    startStrategy: strategy,
                    startSource: source,
                    templatePreset:
                      strategy === "import" ? undefined : current.templatePreset,
                    sourceConfig:
                      source && current.sourceConfig?.kind === source
                        ? current.sourceConfig
                        : source
                          ? buildDefaultSourceConfigForSource(source)
                          : undefined,
                  };
                })
              }
            >
              {labels.shell.useRecommended}
            </button>
          ) : (
            <span className="badge">{labels.shell.recommendedActive}</span>
          )}
        </div>
      </div>

      <div className="tile">
        <div className="row-actions row-actions-between">
          <p className="helper">{labels.shell.sourceStatusTitle}</p>
          <span className="badge">{sourceStatusLabel}</span>
        </div>
        <p>{sourceStatusSummary}</p>
      </div>

      <div className="grid-tiles">
        {START_STRATEGY_VALUES.map((strategy) => (
          <CardOption
            key={strategy}
            title={labels.getStartStrategy(strategy).title}
            description={
              strategy === recommendedStartStrategy.strategy
                ? `${labels.getStartStrategy(strategy).description} ${labels.originStep.strategyRecommendedDescription}`
                : labels.getStartStrategy(strategy).description
            }
            selected={draft.startStrategy === strategy}
            dataTestId={`creation-assistant-start-strategy-${strategy}`}
            onSelect={() => {
              const allowedSources = getAllowedStartSourcesForProfile(draft.profile);
              const allowedTemplates = getAllowedTemplatePresetsForProfile(draft.profile);
              if (strategy === "manual") {
                setDraft((current) => ({
                  ...current,
                  startStrategy: "manual",
                  startSource: undefined,
                  sourceConfig: undefined,
                  templatePreset: undefined,
                }));
                return;
              }
              if (strategy === "template") {
                setDraft((current) => ({
                  ...current,
                  startStrategy: "template",
                  startSource: undefined,
                  sourceConfig: undefined,
                  templatePreset:
                    (current.templatePreset as TemplatePreset | undefined) ??
                    allowedTemplates[0],
                }));
                return;
              }
              const source = draft.startSource ?? allowedSources[0];
              setDraft((current) => ({
                ...current,
                startStrategy: strategy,
                startSource: source,
                templatePreset:
                  strategy === "import" ? undefined : current.templatePreset,
                sourceConfig:
                  source && current.sourceConfig?.kind === source
                    ? current.sourceConfig
                    : strategy === "import" && source
                      ? buildDefaultSourceConfigForSource(source)
                      : undefined,
              }));
            }}
          />
        ))}
      </div>

      {draft.startStrategy === "template" ? (
        <div className="grid-tiles">
          {templatePresets.map((preset) => (
            <CardOption
              key={preset}
              title={labels.getTemplatePresetLabel(preset)}
              description={labels.originStep.templatePresetDescription}
              selected={draft.templatePreset === preset}
              dataTestId={`creation-assistant-template-${preset}`}
              onSelect={() =>
                setDraft((current) => ({
                  ...current,
                  templatePreset: preset,
                }))
              }
            />
          ))}
        </div>
      ) : null}

      {draft.startStrategy === "import" || draft.startStrategy === "hybrid" ? (
        <>
          <div className="grid-tiles">
            {startSources.map((source) => (
              <CardOption
                key={source}
                title={labels.getStartSourceLabel(source)}
                description={labels.originStep.sourceDescription}
                selected={draft.startSource === source}
                dataTestId={`creation-assistant-start-source-${source}`}
                onSelect={() =>
                  setDraft((current) => ({
                    ...current,
                    startSource: source,
                    sourceConfig:
                      current.sourceConfig?.kind === source
                        ? current.sourceConfig
                        : current.startStrategy === "import"
                          ? buildDefaultSourceConfigForSource(source)
                          : undefined,
                  }))
                }
              />
            ))}
          </div>
          {draft.startSource ? (
            <div className="tile">
              <div className="row-actions row-actions-between">
                <p className="helper">{labels.shell.sourceConnectionTitle}</p>
                <span className="badge">
                  {isConnectLaterSelected
                    ? labels.shell.connectLater
                    : labels.shell.configureNow}
                </span>
              </div>
              <div className="row-actions">
                <button
                  className="btn"
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      sourceConfig: current.startSource
                        ? buildDefaultSourceConfigForSource(current.startSource)
                        : undefined,
                    }))
                  }
                >
                  {labels.shell.configureSourceNow}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      startStrategy:
                        current.startStrategy === "import"
                          ? "hybrid"
                          : current.startStrategy,
                      sourceConfig: undefined,
                    }))
                  }
                >
                  {labels.shell.connectLaterButton}
                </button>
              </div>
              <p className="helper">{labels.shell.connectLaterDescription}</p>
            </div>
          ) : null}
          {draft.sourceConfig ? (
            <div className="tile">
              {draft.startStrategy === "hybrid" ? (
                <div className="row-actions row-actions-between">
                  <span className="helper">{labels.shell.hybridOptionalConfiguration}</span>
                  <button
                    className="btn"
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        sourceConfig: undefined,
                      }))
                    }
                  >
                    {labels.shell.hybridConnectLater}
                  </button>
                </div>
              ) : null}

              <PrismaSchemaSourceForm
                draft={draft}
                setDraft={setDraft}
                sourcePreview={sourcePreview}
                mode={mode}
                fromProjectId={fromProjectId}
                validatePrismaSource={validatePrismaSource}
                isBusy={isBusy}
                labels={labels}
              />

              <PostgresSourceForm
                draft={draft}
                setDraft={setDraft}
                sourcePreview={sourcePreview}
                labels={labels}
              />

              <OpenApiSourceForm
                draft={draft}
                setDraft={setDraft}
                sourcePreview={sourcePreview}
                labels={labels}
              />

              <GraphQlSourceForm
                draft={draft}
                setDraft={setDraft}
                sourcePreview={sourcePreview}
                labels={labels}
              />

              <GenericSourceForm
                draft={draft}
                setDraft={setDraft}
                sourcePreview={sourcePreview}
                labels={labels}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
