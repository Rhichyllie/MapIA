"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Stepper } from "@/src/components/ui/stepper";
import { automationHumanLabels, type AssistantDraft } from "@/src/modules/creation-assistant/domain";
import { useCreationAssistantState, useCreationDraftSync, useRecipeRuntime, useSourcePreview, useSourceStatus } from "./hooks";
import { InitialViewStep, OriginStep, ProjectStep, ReviewStep, ScopeStep, SettingsStep } from "./steps";
import { STEPS, type CreationAssistantShellProps } from "./shared";

export function CreationAssistantShell({
  mode,
  fromProjectId,
  initialProject,
  initialSettings,
  initialDraftState,
  snapshotDiagramType,
}: CreationAssistantShellProps) {
  const router = useRouter();

  const state = useCreationAssistantState({
    mode,
    initialProject,
    initialSettings,
    initialDraftState,
    snapshotDiagramType,
  });

  const recipeRuntime = useRecipeRuntime({
    draft: state.draft,
    fromProjectId,
    initialSettings,
    initialDraftSourceConfig: initialDraftState?.draft.sourceConfig,
  });

  const sourcePreview = useSourcePreview(state.draft);
  const sourceStatus = useSourceStatus(state.draft);

  const draftSync = useCreationDraftSync({
    mode,
    fromProjectId,
    draft: state.draft,
    draftVersion: state.draftVersion,
    setDraft: state.setDraft,
    setDraftVersion: state.setDraftVersion,
    setError: state.setError,
    setSuccess: state.setSuccess,
    setIsBusy: state.setIsBusy,
    stepIndex: state.stepIndex,
    setStepIndex: state.setStepIndex,
    setUnlocked: state.setUnlocked,
    onCreated: (redirectUrl) => router.push(redirectUrl),
  });

  const enabledAutomationLabels = useMemo(
    () =>
      Object.entries(state.draft.automation)
        .filter(([, enabled]) => enabled)
        .map(
          ([key]) =>
            automationHumanLabels[key as keyof typeof state.draft.automation].label,
        ),
    [state.draft.automation],
  );

  const currentStep = STEPS[state.stepIndex];
  const progress = ((state.stepIndex + 1) / STEPS.length) * 100;

  return (
    <div className="stepper" data-testid="creation-assistant-shell">
      <div className="tile">
        <div className="row-actions row-actions-between">
          <span className="badge">
            {mode === "new" ? "Novo projeto guiado" : "Configuracao inicial do projeto"}
          </span>
          <div className="row-actions">
            {mode === "existing" && state.draftVersion ? (
              <span className="badge">{`Rascunho v${state.draftVersion}`}</span>
            ) : null}
            <span className="badge">{`Passo ${state.stepIndex + 1} de ${STEPS.length}`}</span>
          </div>
        </div>
        <div className="creation-progress-track" aria-hidden="true">
          <div className="creation-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <Stepper
        ariaLabel="Progresso do Assistente de criacao"
        items={STEPS.map((step, index) => ({
          id: step.id,
          index: index + 1,
          title: step.title,
          description: step.description,
          state:
            index < state.stepIndex
              ? "complete"
              : index === state.stepIndex
                ? "current"
                : index <= state.unlocked
                  ? "available"
                  : "pending",
          disabled: index > state.unlocked,
          onSelect: () => (index <= state.unlocked ? state.setStepIndex(index) : undefined),
        }))}
      />

      <section className="panel">
        <header className="panel-header">
          <div>
            <h3>{currentStep.title}</h3>
            <p>{currentStep.description}</p>
          </div>
        </header>

        <div className="panel-body">
          {currentStep.id === "project" ? (
            <ProjectStep draft={state.draft} setDraft={state.setDraft} />
          ) : null}

          {currentStep.id === "scope" ? (
            <ScopeStep
              draft={state.draft}
              setDraft={state.setDraft}
              synchronizeDirectionalContext={state.synchronizeDirectionalContext}
            />
          ) : null}

          {currentStep.id === "origin" ? (
            <OriginStep
              draft={state.draft}
              setDraft={state.setDraft}
              recommendedStartStrategy={recipeRuntime.recommendedStartStrategy}
              startSources={recipeRuntime.startSources}
              templatePresets={recipeRuntime.templatePresets}
              sourceStatusLabel={sourceStatus.sourceStatusLabel}
              sourceStatusSummary={sourceStatus.sourceStatusSummary}
              isConnectLaterSelected={sourceStatus.isConnectLaterSelected}
              sourcePreview={sourcePreview}
              mode={mode}
              fromProjectId={fromProjectId}
              isBusy={state.isBusy}
              validatePrismaSource={draftSync.validatePrismaSource}
            />
          ) : null}

          {currentStep.id === "view" ? (
            <InitialViewStep
              draft={state.draft}
              recommendedViews={recipeRuntime.recommendedViews}
              selectInitialView={state.selectInitialView}
            />
          ) : null}

          {currentStep.id === "adjustments" ? (
            <SettingsStep
              draft={state.draft}
              setDraft={state.setDraft}
              layoutCatalog={recipeRuntime.layoutCatalog}
              contextBlocks={recipeRuntime.contextBlocks}
              showAdvancedLayouts={state.showAdvancedLayouts}
              setShowAdvancedLayouts={state.setShowAdvancedLayouts}
              showAdvancedStructure={state.showAdvancedStructure}
              setShowAdvancedStructure={state.setShowAdvancedStructure}
              selectLayout={state.selectLayout}
            />
          ) : null}

          {currentStep.id === "review" ? (
            <ReviewStep
              draft={state.draft}
              sourceStatusSummary={sourceStatus.sourceStatusSummary}
              sourceStatusCode={sourceStatus.sourceLifecycle.sourceStatus}
              recommendedStartStrategy={recipeRuntime.recommendedStartStrategy}
              legacyLayoutWarning={state.legacyLayoutWarning}
              enabledAutomationLabels={enabledAutomationLabels}
            />
          ) : null}
        </div>
      </section>

      {state.error ? <div className="error-box">{state.error}</div> : null}
      {state.success ? <div className="success-box">{state.success}</div> : null}

      <nav className="step-nav">
        <button
          className="btn"
          type="button"
          onClick={() => state.setStepIndex((current) => Math.max(0, current - 1))}
          disabled={state.stepIndex === 0 || state.isBusy}
        >
          Voltar
        </button>
        <button
          className="btn"
          type="button"
          onClick={draftSync.saveDraft}
          disabled={state.isBusy}
        >
          Salvar rascunho
        </button>
        {state.stepIndex < STEPS.length - 1 ? (
          <button
            className="btn btn-primary"
            type="button"
            onClick={draftSync.moveNext}
            disabled={state.isBusy}
          >
            Continuar
          </button>
        ) : (
          <button
            className="btn btn-primary"
            type="button"
            onClick={draftSync.finishCreation}
            disabled={state.isBusy}
          >
            {mode === "new" ? "Criar mapa inicial" : "Aplicar e criar mapa inicial"}
          </button>
        )}
      </nav>
    </div>
  );
}
