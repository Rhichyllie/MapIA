import { CardOption } from "@/src/components/ui/card-option";
import {
  automationHumanLabels,
  buildDefaultContextForView,
  getDetailLevelLabel,
  getLayoutChoiceLabel,
  type AssistantDraft,
  type DetailLevel,
  type LayoutChoice,
} from "@/src/modules/creation-assistant/domain";
import { DETAIL_LEVELS } from "../shared";

type SettingsStepProps = {
  draft: AssistantDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssistantDraft>>;
  layoutCatalog: {
    recommended: LayoutChoice[];
    advanced: LayoutChoice[];
  };
  contextBlocks: Set<string>;
  showAdvancedLayouts: boolean;
  setShowAdvancedLayouts: React.Dispatch<React.SetStateAction<boolean>>;
  showAdvancedStructure: boolean;
  setShowAdvancedStructure: React.Dispatch<React.SetStateAction<boolean>>;
  selectLayout: (layout: LayoutChoice) => void;
};

export function SettingsStep({
  draft,
  setDraft,
  layoutCatalog,
  contextBlocks,
  showAdvancedLayouts,
  setShowAdvancedLayouts,
  showAdvancedStructure,
  setShowAdvancedStructure,
  selectLayout,
}: SettingsStepProps) {
  return (
    <div className="stack-sm">
      <section className="tile">
        <h3>Estrutura inicial</h3>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={draft.context.setup?.createExamples ?? true}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                context: {
                  ...current.context,
                  setup: {
                    ...(
                      current.context.setup ??
                      buildDefaultContextForView(current.initialView, current.profile).setup ?? {
                        createExamples: true,
                        suggestedBlockCount: 3,
                        createInitialRoot: false,
                        initialRootName: "Nucleo",
                      }
                    ),
                    createExamples: event.target.checked,
                  },
                },
              }))
            }
          />
          Criar exemplos automaticos
        </label>
        <div className="field">
          <label htmlFor="adjust-setup-count">Quantidade inicial de blocos sugeridos</label>
          <input
            id="adjust-setup-count"
            type="range"
            min={1}
            max={12}
            value={draft.context.setup?.suggestedBlockCount ?? 3}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                context: {
                  ...current.context,
                  setup: {
                    ...(
                      current.context.setup ??
                      buildDefaultContextForView(current.initialView, current.profile).setup ?? {
                        createExamples: true,
                        suggestedBlockCount: 3,
                        createInitialRoot: false,
                        initialRootName: "Nucleo",
                      }
                    ),
                    suggestedBlockCount: Number(event.target.value),
                  },
                },
              }))
            }
          />
          <p className="helper">{draft.context.setup?.suggestedBlockCount ?? 3} blocos</p>
        </div>
        <div className="field">
          <button
            className="btn"
            type="button"
            onClick={() => setShowAdvancedStructure((current) => !current)}
          >
            {showAdvancedStructure ? "Ocultar avancado" : "Mostrar avancado"}
          </button>
        </div>
        {showAdvancedStructure ? (
          <div className="dashboard-form">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.context.setup?.createInitialRoot ?? false}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      setup: {
                        ...(
                          current.context.setup ??
                          buildDefaultContextForView(current.initialView, current.profile)
                            .setup ?? {
                            createExamples: true,
                            suggestedBlockCount: 3,
                            createInitialRoot: false,
                            initialRootName: "Nucleo",
                          }
                        ),
                        createInitialRoot: event.target.checked,
                      },
                    },
                  }))
                }
              />
              Criar no raiz inicial
            </label>
            {draft.context.setup?.createInitialRoot ? (
              <div className="field">
                <label htmlFor="adjust-setup-root-name">Nome do no raiz inicial</label>
                <input
                  id="adjust-setup-root-name"
                  value={draft.context.setup.initialRootName ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      context: {
                        ...current.context,
                        setup: {
                          ...(
                            current.context.setup ??
                            buildDefaultContextForView(current.initialView, current.profile)
                              .setup ?? {
                              createExamples: true,
                              suggestedBlockCount: 3,
                              createInitialRoot: true,
                              initialRootName: "Nucleo",
                            }
                          ),
                          initialRootName: event.target.value,
                        },
                      },
                    }))
                  }
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="tile">
        <h3>Layout</h3>
        <div className="field">
          <label>Recomendado</label>
          <div className="grid-tiles">
            {layoutCatalog.recommended.map((layout) => (
              <CardOption
                key={layout}
                title={getLayoutChoiceLabel(layout)}
                description="Recomendado para a visao inicial."
                selected={draft.layout === layout}
                onSelect={() => selectLayout(layout as LayoutChoice)}
              />
            ))}
          </div>
        </div>
        {layoutCatalog.advanced.length > 0 ? (
          <div className="field">
            <button
              className="btn"
              type="button"
              onClick={() => setShowAdvancedLayouts((current) => !current)}
            >
              {showAdvancedLayouts ? "Ocultar avancado" : "Mostrar avancado"}
            </button>
            {showAdvancedLayouts ? (
              <div className="grid-tiles">
                {layoutCatalog.advanced.map((layout) => (
                  <CardOption
                    key={layout}
                    title={getLayoutChoiceLabel(layout)}
                    description="Opcao avancada para casos especificos."
                    selected={draft.layout === layout}
                    onSelect={() => selectLayout(layout as LayoutChoice)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="tile">
        <h3>Nivel de detalhe</h3>
        <div className="grid-tiles">
          {DETAIL_LEVELS.map((level) => (
            <CardOption
              key={level}
              title={getDetailLevelLabel(level as DetailLevel)}
              description="Nivel de profundidade inicial."
              selected={draft.detailLevel === level}
              onSelect={() =>
                setDraft((current) => ({
                  ...current,
                  detailLevel: level,
                }))
              }
            />
          ))}
        </div>
      </section>

      <section className="tile">
        <h3>Automacao</h3>
        <div className="dashboard-form">
          {Object.entries(automationHumanLabels).map(([key, value]) => (
            <label key={key} className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.automation[key as keyof typeof draft.automation]}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    automation: {
                      ...current.automation,
                      [key]: event.target.checked,
                    },
                  }))
                }
              />
              <span>
                <strong>{value.label}</strong>
                <span className="helper"> {value.help}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="tile">
        <h3>Contexto</h3>
        {contextBlocks.has("erd") && draft.initialView === "erd" && draft.context.erd ? (
          <div className="dashboard-form">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.context.erd.useDefaultIdPk}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      erd: current.context.erd
                        ? {
                            ...current.context.erd,
                            useDefaultIdPk: event.target.checked,
                          }
                        : current.context.erd,
                    },
                  }))
                }
              />
              Usar "id" como PK padrao
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.context.erd.autoCreateFk}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      erd: current.context.erd
                        ? {
                            ...current.context.erd,
                            autoCreateFk: event.target.checked,
                          }
                        : current.context.erd,
                    },
                  }))
                }
              />
              Criar FKs automaticamente quando possivel
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.context.erd.suggestAssociativeForNN}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      erd: current.context.erd
                        ? {
                            ...current.context.erd,
                            suggestAssociativeForNN: event.target.checked,
                          }
                        : current.context.erd,
                    },
                  }))
                }
              />
              Sugerir tabela associativa para N:N
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.context.erd.showFieldTypes}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      erd: current.context.erd
                        ? {
                            ...current.context.erd,
                            showFieldTypes: event.target.checked,
                          }
                        : current.context.erd,
                    },
                  }))
                }
              />
              Exibir tipos de campo
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.context.erd.enableDataSemantics}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      erd: current.context.erd
                        ? {
                            ...current.context.erd,
                            enableDataSemantics: event.target.checked,
                          }
                        : current.context.erd,
                    },
                  }))
                }
              />
              Ativar validacao semantica de dados
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.context.erd.generateTimestamps}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      erd: current.context.erd
                        ? {
                            ...current.context.erd,
                            generateTimestamps: event.target.checked,
                          }
                        : current.context.erd,
                    },
                  }))
                }
              />
              Gerar timestamps iniciais (createdAt, updatedAt)
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.context.erd.suggestIndexes}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      erd: current.context.erd
                        ? {
                            ...current.context.erd,
                            suggestIndexes: event.target.checked,
                          }
                        : current.context.erd,
                    },
                  }))
                }
              />
              Sugerir indices iniciais
            </label>
          </div>
        ) : null}

        {contextBlocks.has("flow") && draft.initialView === "flow" && draft.context.flow ? (
          <div className="dashboard-form">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.context.flow.autoCreateStartEnd}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      flow: current.context.flow
                        ? {
                            ...current.context.flow,
                            autoCreateStartEnd: event.target.checked,
                          }
                        : current.context.flow,
                    },
                  }))
                }
              />
              Criar inicio e fim automaticamente
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.context.flow.allowDecisions}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      flow: current.context.flow
                        ? {
                            ...current.context.flow,
                            allowDecisions: event.target.checked,
                          }
                        : current.context.flow,
                    },
                  }))
                }
              />
              Permitir decisoes
            </label>
            <div className="field">
              <label htmlFor="adjust-flow-direction">Direcao do fluxo</label>
              <select
                id="adjust-flow-direction"
                value={draft.context.flow.direction}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    layout: event.target.value === "left-right" ? "horizontal" : "vertical",
                    context: {
                      ...current.context,
                      flow: current.context.flow
                        ? {
                            ...current.context.flow,
                            direction: event.target.value as "left-right" | "top-down",
                          }
                        : current.context.flow,
                    },
                  }))
                }
              >
                <option value="left-right">Horizontal</option>
                <option value="top-down">Vertical</option>
              </select>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.context.flow.allowMultipleOutputs}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      flow: current.context.flow
                        ? {
                            ...current.context.flow,
                            allowMultipleOutputs: event.target.checked,
                          }
                        : current.context.flow,
                    },
                  }))
                }
              />
              Permitir multiplas saidas por etapa
            </label>
          </div>
        ) : null}

        {contextBlocks.has("sitemap") &&
        draft.initialView === "sitemap" &&
        draft.context.sitemap ? (
          <div className="dashboard-form">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.context.sitemap.autoCreateHome}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      sitemap: current.context.sitemap
                        ? {
                            ...current.context.sitemap,
                            autoCreateHome: event.target.checked,
                          }
                        : current.context.sitemap,
                    },
                  }))
                }
              />
              Criar Home automaticamente
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.context.sitemap.generateMainSections}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      sitemap: current.context.sitemap
                        ? {
                            ...current.context.sitemap,
                            generateMainSections: event.target.checked,
                          }
                        : current.context.sitemap,
                    },
                  }))
                }
              />
              Gerar secoes principais
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.context.sitemap.showNavDepth}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      sitemap: current.context.sitemap
                        ? {
                            ...current.context.sitemap,
                            showNavDepth: event.target.checked,
                          }
                        : current.context.sitemap,
                    },
                  }))
                }
              />
              Exibir profundidade de navegacao
            </label>
          </div>
        ) : null}

        {contextBlocks.has("hierarchy") &&
        draft.initialView === "hierarchy" &&
        draft.context.hierarchy ? (
          <div className="dashboard-form">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.context.hierarchy.createRoot}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      hierarchy: current.context.hierarchy
                        ? {
                            ...current.context.hierarchy,
                            createRoot: event.target.checked,
                          }
                        : current.context.hierarchy,
                    },
                  }))
                }
              />
              Criar no raiz
            </label>
            <div className="field">
              <label htmlFor="adjust-hierarchy-direction">Direcao</label>
              <select
                id="adjust-hierarchy-direction"
                value={draft.context.hierarchy.direction}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    layout: event.target.value === "left-right" ? "horizontal" : "vertical",
                    context: {
                      ...current.context,
                      hierarchy: current.context.hierarchy
                        ? {
                            ...current.context.hierarchy,
                            direction: event.target.value as "top-down" | "left-right",
                          }
                        : current.context.hierarchy,
                    },
                  }))
                }
              >
                <option value="top-down">Vertical</option>
                <option value="left-right">Horizontal</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="adjust-hierarchy-depth">Profundidade inicial sugerida</label>
              <input
                id="adjust-hierarchy-depth"
                type="range"
                min={1}
                max={12}
                value={draft.context.hierarchy.initialDepthHint}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      hierarchy: current.context.hierarchy
                        ? {
                            ...current.context.hierarchy,
                            initialDepthHint: Number(event.target.value),
                          }
                        : current.context.hierarchy,
                    },
                  }))
                }
              />
            </div>
          </div>
        ) : null}

        {contextBlocks.has("graph") && draft.initialView === "graph" && draft.context.graph ? (
          <div className="dashboard-form">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.context.graph.autoGroup}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      graph: current.context.graph
                        ? {
                            ...current.context.graph,
                            autoGroup: event.target.checked,
                          }
                        : current.context.graph,
                    },
                  }))
                }
              />
              Agrupar automaticamente
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.context.graph.reduceCrossing}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      graph: current.context.graph
                        ? {
                            ...current.context.graph,
                            reduceCrossing: event.target.checked,
                          }
                        : current.context.graph,
                    },
                  }))
                }
              />
              Reduzir cruzamento de linhas
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.context.graph.showEdgeLabels}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    context: {
                      ...current.context,
                      graph: current.context.graph
                        ? {
                            ...current.context.graph,
                            showEdgeLabels: event.target.checked,
                          }
                        : current.context.graph,
                    },
                  }))
                }
              />
              Exibir rotulos de relacao
            </label>
          </div>
        ) : null}
      </section>
    </div>
  );
}
