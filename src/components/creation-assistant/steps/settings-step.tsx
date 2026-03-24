import { CardOption } from "@/src/components/ui/card-option";
import {
  type AssistantDraft,
  type DetailLevel,
  type LayoutChoice,
} from "@/src/modules/creation-assistant/domain";
import type { CreationAssistantLabels } from "../creation-assistant-i18n";
import {
  buildLocalizedDefaultContextForView,
  DETAIL_LEVELS,
} from "../shared";

type SettingsStepProps = {
  draft: AssistantDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssistantDraft>>;
  labels: CreationAssistantLabels;
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
  labels,
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
        <h3>{labels.settingsStep.structureTitle}</h3>
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
                      buildLocalizedDefaultContextForView(
                        current.initialView,
                        current.profile,
                        labels.defaults,
                      ).setup ?? {
                        createExamples: true,
                        suggestedBlockCount: 3,
                        createInitialRoot: false,
                        initialRootName: labels.defaults.rootName,
                      }
                    ),
                    createExamples: event.target.checked,
                  },
                },
              }))
            }
          />
          {labels.settingsStep.createExamples}
        </label>
        <div className="field">
          <label htmlFor="adjust-setup-count">
            {labels.settingsStep.suggestedBlocksLabel}
          </label>
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
                      buildLocalizedDefaultContextForView(
                        current.initialView,
                        current.profile,
                        labels.defaults,
                      ).setup ?? {
                        createExamples: true,
                        suggestedBlockCount: 3,
                        createInitialRoot: false,
                        initialRootName: labels.defaults.rootName,
                      }
                    ),
                    suggestedBlockCount: Number(event.target.value),
                  },
                },
              }))
            }
          />
          <p className="helper">
            {labels.settingsStep.suggestedBlocksValue(
              draft.context.setup?.suggestedBlockCount ?? 3,
            )}
          </p>
        </div>
        <div className="field">
          <button
            className="btn"
            type="button"
            onClick={() => setShowAdvancedStructure((current) => !current)}
          >
            {showAdvancedStructure
              ? labels.settingsStep.hideAdvanced
              : labels.settingsStep.showAdvanced}
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
                          buildLocalizedDefaultContextForView(
                            current.initialView,
                            current.profile,
                            labels.defaults,
                          )
                            .setup ?? {
                              createExamples: true,
                              suggestedBlockCount: 3,
                              createInitialRoot: false,
                              initialRootName: labels.defaults.rootName,
                            }
                        ),
                        createInitialRoot: event.target.checked,
                      },
                    },
                  }))
                }
              />
              {labels.settingsStep.createInitialRoot}
            </label>
            {draft.context.setup?.createInitialRoot ? (
              <div className="field">
                <label htmlFor="adjust-setup-root-name">
                  {labels.settingsStep.initialRootNameLabel}
                </label>
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
                            buildLocalizedDefaultContextForView(
                              current.initialView,
                              current.profile,
                              labels.defaults,
                            )
                              .setup ?? {
                                createExamples: true,
                                suggestedBlockCount: 3,
                                createInitialRoot: true,
                                initialRootName: labels.defaults.rootName,
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
        <h3>{labels.settingsStep.layoutTitle}</h3>
        <div className="field">
          <label>{labels.settingsStep.recommendedLayoutsLabel}</label>
          <div className="grid-tiles">
            {layoutCatalog.recommended.map((layout) => (
              <CardOption
                key={layout}
                title={labels.getLayoutChoiceLabel(layout)}
                description={labels.settingsStep.recommendedLayoutDescription}
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
              {showAdvancedLayouts
                ? labels.settingsStep.hideAdvanced
                : labels.settingsStep.showAdvanced}
            </button>
            {showAdvancedLayouts ? (
              <div className="grid-tiles">
                {layoutCatalog.advanced.map((layout) => (
                  <CardOption
                    key={layout}
                    title={labels.getLayoutChoiceLabel(layout)}
                    description={labels.settingsStep.advancedLayoutDescription}
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
        <h3>{labels.settingsStep.detailLevelTitle}</h3>
        <div className="grid-tiles">
          {DETAIL_LEVELS.map((level) => (
            <CardOption
              key={level}
              title={labels.getDetailLevelLabel(level as DetailLevel)}
              description={labels.settingsStep.detailLevelDescription}
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
        <h3>{labels.settingsStep.automationTitle}</h3>
        <div className="dashboard-form">
          {Object.entries(draft.automation).map(([key]) => (
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
                <strong>
                  {labels.getAutomationCopy(key as keyof typeof draft.automation).label}
                </strong>
                <span className="helper">
                  {" "}
                  {labels.getAutomationCopy(key as keyof typeof draft.automation).help}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="tile">
        <h3>{labels.settingsStep.contextTitle}</h3>
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
              {labels.settingsStep.erd.useDefaultIdPk}
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
              {labels.settingsStep.erd.autoCreateFk}
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
              {labels.settingsStep.erd.suggestAssociativeForNN}
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
              {labels.settingsStep.erd.showFieldTypes}
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
              {labels.settingsStep.erd.enableDataSemantics}
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
              {labels.settingsStep.erd.generateTimestamps}
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
              {labels.settingsStep.erd.suggestIndexes}
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
              {labels.settingsStep.flow.autoCreateStartEnd}
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
              {labels.settingsStep.flow.allowDecisions}
            </label>
            <div className="field">
              <label htmlFor="adjust-flow-direction">
                {labels.settingsStep.flow.directionLabel}
              </label>
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
                <option value="left-right">{labels.settingsStep.orientation.horizontal}</option>
                <option value="top-down">{labels.settingsStep.orientation.vertical}</option>
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
              {labels.settingsStep.flow.allowMultipleOutputs}
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
              {labels.settingsStep.sitemap.autoCreateHome}
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
              {labels.settingsStep.sitemap.generateMainSections}
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
              {labels.settingsStep.sitemap.showNavDepth}
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
              {labels.settingsStep.hierarchy.createRoot}
            </label>
            <div className="field">
              <label htmlFor="adjust-hierarchy-direction">
                {labels.settingsStep.hierarchy.directionLabel}
              </label>
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
                <option value="top-down">{labels.settingsStep.orientation.vertical}</option>
                <option value="left-right">{labels.settingsStep.orientation.horizontal}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="adjust-hierarchy-depth">
                {labels.settingsStep.hierarchy.initialDepthHintLabel}
              </label>
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
              {labels.settingsStep.graph.autoGroup}
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
              {labels.settingsStep.graph.reduceCrossing}
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
              {labels.settingsStep.graph.showEdgeLabels}
            </label>
          </div>
        ) : null}
      </section>
    </div>
  );
}
