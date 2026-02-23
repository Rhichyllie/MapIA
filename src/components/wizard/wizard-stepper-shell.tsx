"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  type WizardDraftPayload,
  type WizardDraftStatus,
  type WizardStep,
  WizardReadyPayloadSchema,
} from "@/src/modules/wizard/domain";

type WizardProjectViewModel = {
  id: string;
  name: string;
  slug: string;
  template: "sitemap" | "flowchart" | "erd" | "graph";
  description?: string;
};

type WizardDraftViewModel = {
  status: WizardDraftStatus;
  currentStep: WizardStep;
  payload: WizardDraftPayload;
  lastError?: string;
};

type WizardStepperShellProps = {
  project: WizardProjectViewModel;
  initialDraft: WizardDraftViewModel;
};

type StepMeta = {
  id: WizardStep;
  title: string;
  description: string;
};

const steps: StepMeta[] = [
  {
    id: "template",
    title: "Template",
    description: "Template-base do projeto.",
  },
  {
    id: "diagram_type",
    title: "Tipo de diagrama",
    description: "View principal a ser gerada.",
  },
  {
    id: "data_source",
    title: "Origem de dados",
    description: "Manual ou importar (placeholder de importador).",
  },
  {
    id: "config",
    title: "Configuracao",
    description: "Nome, descricao e opcoes basicas do snapshot inicial.",
  },
  {
    id: "review",
    title: "Revisao e gerar",
    description: "Validacao final e geracao do snapshot inicial.",
  },
];

const templateOptions = ["graph", "sitemap", "flowchart", "erd"] as const;
const diagramTypeOptions = [
  "graph",
  "tree",
  "sitemap",
  "flowchart",
  "erd",
  "timeline",
] as const;

function getStepIndex(step: WizardStep) {
  return steps.findIndex((item) => item.id === step);
}

function getStepState(
  stepIndex: number,
  currentIndex: number,
  maxUnlockedIndex: number,
) {
  if (stepIndex < currentIndex) return "complete";
  if (stepIndex === currentIndex) return "current";
  if (stepIndex <= maxUnlockedIndex) return "available";
  return "pending";
}

function getValidationMessage(step: WizardStep, payload: WizardDraftPayload) {
  switch (step) {
    case "template":
      return payload.template ? null : "Selecione um template.";
    case "diagram_type":
      return payload.diagramType ? null : "Selecione um tipo de diagrama.";
    case "data_source":
      if (!payload.dataSource) return "Selecione a origem de dados.";
      if (payload.dataSource === "import" && !payload.importKind) {
        return "Selecione o tipo de importacao.";
      }
      return null;
    case "config":
      if (!payload.config?.name?.trim())
        return "Informe o nome do snapshot/projeto.";
      return null;
    case "review":
      try {
        WizardReadyPayloadSchema.parse(payload);
        return null;
      } catch {
        return "Revise os passos anteriores antes de gerar.";
      }
  }
}

function getMaxUnlockedIndex(payload: WizardDraftPayload) {
  let maxIndex = 0;

  for (let index = 0; index < steps.length; index += 1) {
    const message = getValidationMessage(steps[index].id, payload);
    if (message) {
      return maxIndex;
    }
    maxIndex = Math.min(index + 1, steps.length - 1);
  }

  return maxIndex;
}

export function WizardStepperShell({
  project,
  initialDraft,
}: WizardStepperShellProps) {
  const router = useRouter();
  const [payload, setPayload] = useState<WizardDraftPayload>(() => ({
    ...initialDraft.payload,
    template: initialDraft.payload.template ?? project.template,
    config: {
      ...initialDraft.payload.config,
      name: initialDraft.payload.config?.name ?? project.name,
      description:
        initialDraft.payload.config?.description ??
        project.description ??
        undefined,
      generateRootNode: initialDraft.payload.config?.generateRootNode ?? true,
    },
  }));
  const [currentStep, setCurrentStep] = useState<WizardStep>(
    initialDraft.currentStep,
  );
  const [status, setStatus] = useState<WizardDraftStatus>(initialDraft.status);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialDraft.lastError ?? null,
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentIndex = getStepIndex(currentStep);
  const currentMeta = steps[currentIndex];
  const maxUnlockedIndex = useMemo(
    () => getMaxUnlockedIndex(payload),
    [payload],
  );
  const currentValidationMessage = getValidationMessage(currentStep, payload);
  const canGoNext =
    currentIndex < steps.length - 1 && !currentValidationMessage;
  const canGenerate = !getValidationMessage("review", payload);

  async function saveDraft(
    nextStep: WizardStep,
    nextStatus?: WizardDraftStatus,
  ) {
    const response = await fetch(`/api/projects/${project.id}/wizard-draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentStep: nextStep,
        status: nextStatus,
        payload,
      }),
    });
    const result = (await response.json()) as {
      data?: { draft?: WizardDraftViewModel };
      message?: string;
    };

    if (!response.ok || !result.data?.draft) {
      throw new Error(result.message ?? "Nao foi possivel salvar o rascunho.");
    }

    setStatus(result.data.draft.status);
    setCurrentStep(result.data.draft.currentStep);
    setErrorMessage(result.data.draft.lastError ?? null);
    return result.data.draft;
  }

  function handleGoToStep(step: WizardStep) {
    const targetIndex = getStepIndex(step);

    if (targetIndex > maxUnlockedIndex) {
      return;
    }

    setCurrentStep(step);
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  function handleNext() {
    if (!canGoNext) {
      setErrorMessage(currentValidationMessage ?? "Revise o passo atual.");
      return;
    }

    const nextStep = steps[currentIndex + 1].id;
    startTransition(async () => {
      setErrorMessage(null);
      setSuccessMessage(null);
      try {
        await saveDraft(nextStep, "draft");
        setSuccessMessage("Rascunho salvo.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Erro ao salvar rascunho.",
        );
      }
    });
  }

  function handleBack() {
    if (currentIndex === 0) return;
    setCurrentStep(steps[currentIndex - 1].id);
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  function handleSaveDraft() {
    startTransition(async () => {
      setErrorMessage(null);
      setSuccessMessage(null);
      try {
        await saveDraft(currentStep, "draft");
        setSuccessMessage("Rascunho persistido com sucesso.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Erro ao salvar rascunho.",
        );
      }
    });
  }

  function handleGenerate() {
    if (!canGenerate) {
      setErrorMessage("Preencha os passos obrigatorios antes de gerar.");
      return;
    }

    startTransition(async () => {
      setStatus("generating");
      setErrorMessage(null);
      setSuccessMessage(null);

      try {
        await saveDraft("review", "validating");
        const response = await fetch(
          `/api/projects/${project.id}/wizard-generate`,
          {
            method: "POST",
          },
        );
        const payloadResponse = (await response.json()) as {
          data?: { projectId?: string };
          message?: string;
        };

        if (!response.ok) {
          throw new Error(
            payloadResponse.message ?? "Falha ao gerar snapshot inicial.",
          );
        }

        setStatus("ready");
        setSuccessMessage("Snapshot inicial gerado. Abrindo editor...");
        router.push(`/editor?projectId=${project.id}`);
      } catch (error) {
        setStatus("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Falha ao gerar snapshot inicial.",
        );
      }
    });
  }

  return (
    <div className="stepper" aria-label="Stepper de criacao de projeto">
      <div className="row-actions">
        <span className="badge">
          <span className="badge-dot" aria-hidden="true" />
          Passo {currentIndex + 1}/{steps.length}
        </span>
        <span className="badge">{status}</span>
        <span className="muted">
          Projeto: <code className="mono">{project.slug}</code>
        </span>
      </div>

      <ol className="stepper-list">
        {steps.map((step, index) => {
          const state = getStepState(index, currentIndex, maxUnlockedIndex);
          const isDisabled = index > maxUnlockedIndex;

          return (
            <li
              key={step.id}
              className="step-item"
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="step-index">{index + 1}</span>
              <div>
                <div className="step-title">{step.title}</div>
                <div className="step-description">{step.description}</div>
              </div>
              <button
                className="btn"
                type="button"
                disabled={isDisabled}
                onClick={() => handleGoToStep(step.id)}
              >
                {state === "current" ? "Atual" : "Ir"}
              </button>
            </li>
          );
        })}
      </ol>

      <section className="panel" aria-labelledby="wizard-current-step">
        <header className="panel-header">
          <div>
            <h3 id="wizard-current-step">{currentMeta.title}</h3>
            <p>{currentMeta.description}</p>
          </div>
        </header>
        <div className="panel-body">
          {currentStep === "template" ? (
            <div className="field">
              <label htmlFor="wizard-template">Template do projeto</label>
              <select
                id="wizard-template"
                value={payload.template ?? ""}
                onChange={(event) =>
                  setPayload((current) => ({
                    ...current,
                    template:
                      (event.target.value as WizardDraftPayload["template"]) ||
                      undefined,
                  }))
                }
              >
                <option value="">Selecione...</option>
                {templateOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {currentStep === "diagram_type" ? (
            <div className="field">
              <label htmlFor="wizard-diagram-type">Tipo de diagrama</label>
              <select
                id="wizard-diagram-type"
                value={payload.diagramType ?? ""}
                onChange={(event) =>
                  setPayload((current) => ({
                    ...current,
                    diagramType:
                      (event.target
                        .value as WizardDraftPayload["diagramType"]) ||
                      undefined,
                  }))
                }
              >
                <option value="">Selecione...</option>
                {diagramTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {currentStep === "data_source" ? (
            <div className="stack-sm">
              <div className="field">
                <label htmlFor="wizard-data-source">Origem de dados</label>
                <select
                  id="wizard-data-source"
                  value={payload.dataSource ?? ""}
                  onChange={(event) =>
                    setPayload((current) => {
                      const nextDataSource =
                        (event.target
                          .value as WizardDraftPayload["dataSource"]) ||
                        undefined;
                      return {
                        ...current,
                        dataSource: nextDataSource,
                        importKind:
                          nextDataSource === "import"
                            ? current.importKind
                            : undefined,
                      };
                    })
                  }
                >
                  <option value="">Selecione...</option>
                  <option value="manual">manual</option>
                  <option value="import">importar</option>
                </select>
              </div>

              {payload.dataSource === "import" ? (
                <div className="field">
                  <label htmlFor="wizard-import-kind">Tipo de importacao</label>
                  <select
                    id="wizard-import-kind"
                    value={payload.importKind ?? ""}
                    onChange={(event) =>
                      setPayload((current) => ({
                        ...current,
                        importKind:
                          (event.target
                            .value as WizardDraftPayload["importKind"]) ||
                          undefined,
                      }))
                    }
                  >
                    <option value="">Selecione...</option>
                    <option value="postgres">postgres</option>
                    <option value="prisma">prisma</option>
                  </select>
                </div>
              ) : null}
            </div>
          ) : null}

          {currentStep === "config" ? (
            <div className="dashboard-form">
              <div className="field">
                <label htmlFor="wizard-config-name">Nome</label>
                <input
                  id="wizard-config-name"
                  value={payload.config?.name ?? ""}
                  onChange={(event) =>
                    setPayload((current) => ({
                      ...current,
                      config: {
                        ...current.config,
                        name: event.target.value,
                      },
                    }))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="wizard-config-description">Descricao</label>
                <textarea
                  id="wizard-config-description"
                  rows={3}
                  value={payload.config?.description ?? ""}
                  onChange={(event) =>
                    setPayload((current) => ({
                      ...current,
                      config: {
                        ...current.config,
                        description: event.target.value,
                      },
                    }))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="wizard-config-notes">Notas (opcional)</label>
                <textarea
                  id="wizard-config-notes"
                  rows={3}
                  value={payload.config?.notes ?? ""}
                  onChange={(event) =>
                    setPayload((current) => ({
                      ...current,
                      config: {
                        ...current.config,
                        notes: event.target.value,
                      },
                    }))
                  }
                />
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={payload.config?.generateRootNode ?? true}
                  onChange={(event) =>
                    setPayload((current) => ({
                      ...current,
                      config: {
                        ...current.config,
                        generateRootNode: event.target.checked,
                      },
                    }))
                  }
                />
                Incluir no auxiliar para o seed do snapshot
              </label>
            </div>
          ) : null}

          {currentStep === "review" ? (
            <div className="stack-sm">
              <div className="tile">
                <h3>Resumo</h3>
                <p>
                  Template: <strong>{payload.template ?? "-"}</strong>
                </p>
                <p>
                  Diagrama: <strong>{payload.diagramType ?? "-"}</strong>
                </p>
                <p>
                  Fonte:{" "}
                  <strong>
                    {payload.dataSource ?? "-"}
                    {payload.importKind ? ` / ${payload.importKind}` : ""}
                  </strong>
                </p>
                <p>
                  Nome: <strong>{payload.config?.name ?? "-"}</strong>
                </p>
              </div>
              <p className="helper">
                Ao gerar, o projeto eh atualizado com nome/descricao do wizard e
                o snapshot de trabalho v1 (temporariamente mutavel na Fase 1) eh
                salvo.
              </p>
            </div>
          ) : null}

          {currentValidationMessage ? (
            <p className="helper" style={{ marginTop: "0.85rem" }}>
              {currentValidationMessage}
            </p>
          ) : null}
        </div>
      </section>

      {errorMessage ? <div className="error-box">{errorMessage}</div> : null}
      {successMessage ? (
        <div className="success-box">{successMessage}</div>
      ) : null}

      <nav className="step-nav" aria-label="Navegacao do wizard">
        <button
          className="btn"
          type="button"
          disabled={currentIndex === 0 || isPending}
          onClick={handleBack}
        >
          Voltar
        </button>
        <button
          className="btn"
          type="button"
          disabled={isPending}
          onClick={handleSaveDraft}
        >
          {isPending ? "Processando..." : "Salvar rascunho"}
        </button>
        {currentStep !== "review" ? (
          <button
            className="btn btn-primary"
            type="button"
            disabled={!canGoNext || isPending}
            onClick={handleNext}
          >
            Proximo
          </button>
        ) : (
          <button
            className="btn btn-primary"
            type="button"
            disabled={!canGenerate || isPending}
            onClick={handleGenerate}
          >
            {isPending ? "Gerando..." : "Gerar snapshot inicial"}
          </button>
        )}
      </nav>
    </div>
  );
}
