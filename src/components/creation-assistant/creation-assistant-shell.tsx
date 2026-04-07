"use client";
import { Stepper } from "@/src/components/ui/stepper";
import { useRouter } from "@/src/i18n/navigation";
import { useCreationAssistantLabels } from "./creation-assistant-i18n";
import {
  useCreationAssistantState,
  useCreationDraftSync,
  useRecipeRuntime,
  useSourcePreview,
  useSourceStatus,
} from "./hooks";
import {
  InitialViewStep,
  OriginStep,
  ProjectStep,
  ReviewStep,
  ScopeStep,
  SettingsStep,
} from "./steps";
import { STEP_IDS, type CreationAssistantShellProps } from "./shared";

export function CreationAssistantShell({
  mode,
  fromProjectId,
  initialProject,
  initialSettings,
  initialDraftState,
  snapshotDiagramType,
  snapshotDiagramView,
}: CreationAssistantShellProps) {
  const router = useRouter();
  const labels = useCreationAssistantLabels();

  const state = useCreationAssistantState({
    mode,
    initialProject,
    initialSettings,
    initialDraftState,
    snapshotDiagramType,
    snapshotDiagramView,
    labels: labels.defaults,
  });

  const recipeRuntime = useRecipeRuntime({
    draft: state.draft,
    fromProjectId,
    initialSettings,
    initialDraftSourceConfig: initialDraftState?.draft.sourceConfig,
  });

  const sourcePreview = useSourcePreview(state.draft);
  const sourcePreviewCopy = labels.getSourcePreviewCopy(sourcePreview);
  const sourceStatus = useSourceStatus(state.draft, labels);

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
    copy: labels.hooks,
  });

  const enabledAutomationLabels = Object.entries(state.draft.automation)
    .filter(([, enabled]) => enabled)
    .map(
      ([key]) => labels.getAutomationCopy(key as keyof typeof state.draft.automation).label,
    );

  const steps = STEP_IDS.map((stepId) => ({ id: stepId, ...labels.getStep(stepId) }));
  const currentStep = steps[state.stepIndex];
  const progress = ((state.stepIndex + 1) / steps.length) * 100;

  return (
    <div className="stepper" data-testid="creation-assistant-shell">
      <div className="tile">
        <div className="row-actions row-actions-between">
          <span className="badge">
            {mode === "new"
              ? labels.shell.modeBadge.new
              : labels.shell.modeBadge.existing}
          </span>
          <div className="row-actions">
            {mode === "existing" && state.draftVersion ? (
              <span className="badge">
                {labels.shell.draftVersion(state.draftVersion)}
              </span>
            ) : null}
            <span className="badge">
              {labels.shell.stepCounter(state.stepIndex + 1, steps.length)}
            </span>
          </div>
        </div>
        <div className="creation-progress-track" aria-hidden="true">
          <div className="creation-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <Stepper
        ariaLabel={labels.shell.progressAriaLabel}
        dataTestId="creation-assistant-stepper"
        items={steps.map((step, index) => ({
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

      <section
        className="panel"
        data-testid="creation-assistant-current-panel"
        data-step-id={currentStep.id}
      >
        <header className="panel-header">
          <div>
            <h3>{currentStep.title}</h3>
            <p>{currentStep.description}</p>
          </div>
        </header>

        <div className="panel-body">
          {currentStep.id === "project" ? (
            <ProjectStep draft={state.draft} setDraft={state.setDraft} labels={labels} />
          ) : null}

          {currentStep.id === "scope" ? (
            <ScopeStep
              draft={state.draft}
              setDraft={state.setDraft}
              labels={labels}
              synchronizeDirectionalContext={state.synchronizeDirectionalContext}
            />
          ) : null}

          {currentStep.id === "origin" ? (
            <OriginStep
              draft={state.draft}
              setDraft={state.setDraft}
              labels={labels}
              recommendedStartStrategy={recipeRuntime.recommendedStartStrategy}
              startSources={recipeRuntime.startSources}
              templatePresets={recipeRuntime.templatePresets}
              sourceStatusLabel={sourceStatus.sourceStatusLabel}
              sourceStatusSummary={sourceStatus.sourceStatusSummary}
              isConnectLaterSelected={sourceStatus.isConnectLaterSelected}
              sourcePreview={sourcePreviewCopy}
              mode={mode}
              fromProjectId={fromProjectId}
              isBusy={state.isBusy}
              validatePrismaSource={draftSync.validatePrismaSource}
            />
          ) : null}

          {currentStep.id === "view" ? (
            <InitialViewStep
              draft={state.draft}
              labels={labels}
              recommendedViews={recipeRuntime.recommendedViews}
              selectInitialView={state.selectInitialView}
            />
          ) : null}

          {currentStep.id === "adjustments" ? (
            <SettingsStep
              draft={state.draft}
              setDraft={state.setDraft}
              labels={labels}
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
              labels={labels}
              sourceStatusSummary={sourceStatus.sourceStatusSummary}
              sourceStatusCode={sourceStatus.sourceLifecycle.sourceStatus}
              recommendedStartStrategy={recipeRuntime.recommendedStartStrategy}
              legacyLayoutWarningCode={state.legacyLayoutWarningCode}
              enabledAutomationLabels={enabledAutomationLabels}
            />
          ) : null}
        </div>
      </section>

      {state.error ? (
        <div className="error-box" data-testid="creation-assistant-error">
          {state.error}
        </div>
      ) : null}
      {state.success ? (
        <div className="success-box" data-testid="creation-assistant-success">
          {state.success}
        </div>
      ) : null}

      <nav className="step-nav">
        <button
          className="btn"
          type="button"
          onClick={() => state.setStepIndex((current) => Math.max(0, current - 1))}
          disabled={state.stepIndex === 0 || state.isBusy}
          data-testid="creation-assistant-back-button"
        >
          {labels.shell.back}
        </button>
        <button
          className="btn"
          type="button"
          onClick={draftSync.saveDraft}
          disabled={state.isBusy}
          data-testid="creation-assistant-save-draft-button"
        >
          {labels.shell.saveDraft}
        </button>
        {state.stepIndex < steps.length - 1 ? (
          <button
            className="btn btn-primary"
            type="button"
            onClick={draftSync.moveNext}
            disabled={state.isBusy}
            data-testid="creation-assistant-continue-button"
          >
            {labels.shell.continue}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            type="button"
            onClick={draftSync.finishCreation}
            disabled={state.isBusy}
            data-testid="creation-assistant-finish-button"
          >
            {mode === "new" ? labels.shell.finishNew : labels.shell.finishExisting}
          </button>
        )}
      </nav>
    </div>
  );
}
