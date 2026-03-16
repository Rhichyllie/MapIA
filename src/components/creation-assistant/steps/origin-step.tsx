import { CardOption } from "@/src/components/ui/card-option";
import {
  buildDefaultSourceConfigForSource,
  getAllowedStartSourcesForProfile,
  getAllowedTemplatePresetsForProfile,
  getStartSourceLabel,
  getTemplatePresetLabel,
  type AssistantDraft,
  type SourceConfigPreview,
  type StartSource,
  type StartStrategyRecommendation,
  type TemplatePreset,
} from "@/src/modules/creation-assistant/domain";
import { START_STRATEGIES } from "../shared";
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
  sourcePreview: SourceConfigPreview | null;
  mode: "new" | "existing";
  fromProjectId?: string;
  isBusy: boolean;
  validatePrismaSource: () => Promise<void>;
};

export function OriginStep({
  draft,
  setDraft,
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
          <p className="helper">Recomendado porque: {recommendedStartStrategy.reason}</p>
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
              Usar recomendado
            </button>
          ) : (
            <span className="badge">Recomendado ativo</span>
          )}
        </div>
      </div>

      <div className="tile">
        <div className="row-actions row-actions-between">
          <p className="helper">Status da fonte</p>
          <span className="badge">{sourceStatusLabel}</span>
        </div>
        <p>{sourceStatusSummary}</p>
      </div>

      <div className="grid-tiles">
        {START_STRATEGIES.map((strategy) => (
          <CardOption
            key={strategy.value}
            title={strategy.title}
            description={
              strategy.value === recommendedStartStrategy.strategy
                ? `${strategy.description} Recomendado para este escopo.`
                : strategy.description
            }
            selected={draft.startStrategy === strategy.value}
            onSelect={() => {
              const allowedSources = getAllowedStartSourcesForProfile(draft.profile);
              const allowedTemplates = getAllowedTemplatePresetsForProfile(draft.profile);
              if (strategy.value === "manual") {
                setDraft((current) => ({
                  ...current,
                  startStrategy: "manual",
                  startSource: undefined,
                  sourceConfig: undefined,
                  templatePreset: undefined,
                }));
                return;
              }
              if (strategy.value === "template") {
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
                startStrategy: strategy.value,
                startSource: source,
                templatePreset:
                  strategy.value === "import" ? undefined : current.templatePreset,
                sourceConfig:
                  source && current.sourceConfig?.kind === source
                    ? current.sourceConfig
                    : strategy.value === "import" && source
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
              title={getTemplatePresetLabel(preset)}
              description="Preset inicial para o perfil escolhido."
              selected={draft.templatePreset === preset}
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
                title={getStartSourceLabel(source)}
                description="Fonte de origem."
                selected={draft.startSource === source}
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
                <p className="helper">Conexao da fonte</p>
                <span className="badge">
                  {isConnectLaterSelected ? "Conectar depois" : "Configurar agora"}
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
                  Configurar fonte agora
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
                  Conectar depois
                </button>
              </div>
              <p className="helper">
                Conectar depois mantem o fluxo honesto: o mapa inicial sera criado sem importar dados automaticamente.
              </p>
            </div>
          ) : null}
          {draft.sourceConfig ? (
            <div className="tile">
              {draft.startStrategy === "hybrid" ? (
                <div className="row-actions row-actions-between">
                  <span className="helper">Configuracao opcional no modo hibrido.</span>
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
                    Conectar depois
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
              />

              <PostgresSourceForm
                draft={draft}
                setDraft={setDraft}
                sourcePreview={sourcePreview}
              />

              <OpenApiSourceForm
                draft={draft}
                setDraft={setDraft}
                sourcePreview={sourcePreview}
              />

              <GraphQlSourceForm
                draft={draft}
                setDraft={setDraft}
                sourcePreview={sourcePreview}
              />

              <GenericSourceForm
                draft={draft}
                setDraft={setDraft}
                sourcePreview={sourcePreview}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
