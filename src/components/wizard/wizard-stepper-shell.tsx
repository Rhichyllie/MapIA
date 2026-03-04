"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  type DiagramLayoutOptions,
  resolveDiagramLayoutOptions,
} from "@/src/modules/graph/domain";
import {
  type WizardDraftPayload,
  type WizardDraftStatus,
  type WizardStep,
  type WizardSupportedDiagramType,
  WizardReadyPayloadSchema,
} from "@/src/modules/wizard/domain";
import { CardOption } from "@/src/components/ui/card-option";
import { Stepper } from "@/src/components/ui/stepper";

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
  preselectedDiagramType?: WizardSupportedDiagramType;
};

type StepMeta = {
  id: WizardStep;
  title: string;
  description: string;
};

const steps: StepMeta[] = [
  {
    id: "template",
    title: "1. Tipo",
    description: "Escolha o tipo do diagrama e ajuste o layout inicial.",
  },
  {
    id: "diagram_type",
    title: "2. Origem",
    description: "Defina de onde os dados iniciais virao.",
  },
  {
    id: "data_source",
    title: "3. Configuracao",
    description: "Ajuste nome, no raiz e politicas de edicao.",
  },
  {
    id: "config",
    title: "4. Revisao",
    description: "Confira tudo o que sera criado antes da geracao.",
  },
  {
    id: "review",
    title: "5. Gerar",
    description: "Crie o snapshot inicial e siga para o editor.",
  },
];

const templateOptions = ["graph", "sitemap", "flowchart", "erd"] as const;

const diagramTypeOptions: Array<{
  value: WizardSupportedDiagramType;
  label: string;
  description: string;
}> = [
  {
    value: "tree",
    label: "Tree",
    description: "Estrutura hierarquica em niveis com uma raiz principal.",
  },
  {
    value: "flow",
    label: "Flow",
    description: "Fluxo orientado por etapas para processos e pipelines.",
  },
  {
    value: "mindmap",
    label: "Mindmap",
    description: "Mapa radial para explorar ideias e relacionamentos.",
  },
];

const statusLabels: Record<WizardDraftStatus, string> = {
  draft: "Rascunho",
  validating: "Validando",
  generating: "Gerando",
  ready: "Pronto",
  error: "Erro",
};

function isSupportedDiagramType(
  value: WizardDraftPayload["diagramType"],
): value is WizardSupportedDiagramType {
  return value === "tree" || value === "flow" || value === "mindmap";
}

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

function formatLayoutOptionsSummary(layoutOptions: DiagramLayoutOptions | undefined) {
  if (!layoutOptions) {
    return "Padrao";
  }

  if (layoutOptions.type === "tree") {
    return `Tree: direcao ${layoutOptions.direction === "top-down" ? "vertical" : "horizontal"}, espacamento H ${layoutOptions.nodeSpacingX}px, V ${layoutOptions.nodeSpacingY}px`;
  }

  if (layoutOptions.type === "flow") {
    return `Flow: espacamento H ${layoutOptions.nodeSpacingX}px, V ${layoutOptions.nodeSpacingY}px`;
  }

  return `Mindmap: distancia radial ${layoutOptions.radialSpacing}px`;
}

function buildDiagramPreview(diagramType: WizardSupportedDiagramType) {
  if (diagramType === "tree") {
    return (
      <svg width="100%" viewBox="0 0 180 78" role="img" aria-label="Preview tree">
        <line x1="90" y1="18" x2="45" y2="48" stroke="rgba(21,26,32,0.4)" />
        <line x1="90" y1="18" x2="90" y2="48" stroke="rgba(21,26,32,0.4)" />
        <line x1="90" y1="18" x2="135" y2="48" stroke="rgba(21,26,32,0.4)" />
        <rect x="75" y="8" width="30" height="18" rx="5" fill="rgba(15,118,110,0.18)" />
        <rect x="30" y="48" width="30" height="18" rx="5" fill="rgba(15,118,110,0.12)" />
        <rect x="75" y="48" width="30" height="18" rx="5" fill="rgba(15,118,110,0.12)" />
        <rect x="120" y="48" width="30" height="18" rx="5" fill="rgba(15,118,110,0.12)" />
      </svg>
    );
  }

  if (diagramType === "flow") {
    return (
      <svg width="100%" viewBox="0 0 180 78" role="img" aria-label="Preview flow">
        <rect x="10" y="30" width="34" height="18" rx="5" fill="rgba(15,118,110,0.12)" />
        <rect x="73" y="30" width="34" height="18" rx="5" fill="rgba(15,118,110,0.16)" />
        <rect x="136" y="30" width="34" height="18" rx="5" fill="rgba(15,118,110,0.12)" />
        <line x1="44" y1="39" x2="73" y2="39" stroke="rgba(21,26,32,0.45)" />
        <line x1="107" y1="39" x2="136" y2="39" stroke="rgba(21,26,32,0.45)" />
      </svg>
    );
  }

  return (
    <svg width="100%" viewBox="0 0 180 78" role="img" aria-label="Preview mindmap">
      <circle cx="90" cy="39" r="12" fill="rgba(15,118,110,0.2)" />
      <circle cx="35" cy="39" r="8" fill="rgba(15,118,110,0.12)" />
      <circle cx="145" cy="39" r="8" fill="rgba(15,118,110,0.12)" />
      <circle cx="90" cy="10" r="8" fill="rgba(15,118,110,0.12)" />
      <circle cx="90" cy="68" r="8" fill="rgba(15,118,110,0.12)" />
      <line x1="78" y1="39" x2="43" y2="39" stroke="rgba(21,26,32,0.45)" />
      <line x1="102" y1="39" x2="137" y2="39" stroke="rgba(21,26,32,0.45)" />
      <line x1="90" y1="27" x2="90" y2="18" stroke="rgba(21,26,32,0.45)" />
      <line x1="90" y1="51" x2="90" y2="60" stroke="rgba(21,26,32,0.45)" />
    </svg>
  );
}

function getValidationMessage(
  step: WizardStep,
  payload: WizardDraftPayload,
  rootNodeName: string,
) {
  switch (step) {
    case "template":
      if (!isSupportedDiagramType(payload.diagramType)) {
        return "Selecione o tipo de diagrama para continuar.";
      }
      return payload.template ? null : "Selecione um template legado.";
    case "diagram_type":
      if (!payload.dataSource) {
        return "Selecione a origem de dados.";
      }
      if (payload.dataSource === "import" && !payload.importKind) {
        return "Selecione o tipo de importacao.";
      }
      return null;
    case "data_source":
      if (!payload.config?.name?.trim()) {
        return "Informe o nome do projeto/diagrama.";
      }
      if (payload.config.generateRootNode !== false && !rootNodeName.trim()) {
        return "Defina o nome do no raiz inicial.";
      }
      return null;
    case "config":
    case "review":
      try {
        WizardReadyPayloadSchema.parse(payload);
        return null;
      } catch {
        return "Revise os campos obrigatorios antes de gerar o snapshot.";
      }
  }
}

function getMaxUnlockedIndex(payload: WizardDraftPayload, rootNodeName: string) {
  let maxIndex = 0;

  for (let index = 0; index < steps.length; index += 1) {
    const message = getValidationMessage(steps[index].id, payload, rootNodeName);
    if (message) {
      return maxIndex;
    }
    maxIndex = Math.min(index + 1, steps.length - 1);
  }

  return maxIndex;
}

function getPredictedNodesCount(payload: WizardDraftPayload) {
  const includeGeneratedRoot = payload.config?.generateRootNode !== false;
  const includeNotesNode = Boolean(payload.config?.notes?.trim());
  return 2 + (includeGeneratedRoot ? 1 : 0) + (includeNotesNode ? 1 : 0);
}

export function WizardStepperShell({
  project,
  initialDraft,
  preselectedDiagramType,
}: WizardStepperShellProps) {
  const router = useRouter();
  const initialDraftDiagramType = isSupportedDiagramType(
    initialDraft.payload.diagramType,
  )
    ? initialDraft.payload.diagramType
    : undefined;
  const initialDiagramType = initialDraftDiagramType ?? preselectedDiagramType;

  const [payload, setPayload] = useState<WizardDraftPayload>(() => ({
    ...initialDraft.payload,
    template: initialDraft.payload.template ?? project.template,
    diagramType: initialDiagramType,
    layoutOptions: initialDiagramType
      ? resolveDiagramLayoutOptions(initialDiagramType, initialDraft.payload.layoutOptions)
      : undefined,
    config: {
      ...initialDraft.payload.config,
      name: initialDraft.payload.config?.name ?? project.name,
      description:
        initialDraft.payload.config?.description ?? project.description ?? undefined,
      generateRootNode: initialDraft.payload.config?.generateRootNode ?? true,
    },
  }));
  const [currentStep, setCurrentStep] = useState<WizardStep>(
    initialDraft.currentStep,
  );
  const [status, setStatus] = useState<WizardDraftStatus>(initialDraft.status);
  const [rootNodeName, setRootNodeName] = useState("No raiz");
  const [allowReapplyLayout, setAllowReapplyLayout] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialDraft.lastError ?? null,
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentIndex = getStepIndex(currentStep);
  const currentMeta = steps[currentIndex];
  const maxUnlockedIndex = useMemo(
    () => getMaxUnlockedIndex(payload, rootNodeName),
    [payload, rootNodeName],
  );
  const currentValidationMessage = getValidationMessage(
    currentStep,
    payload,
    rootNodeName,
  );
  const canGoNext = currentIndex < steps.length - 1 && !currentValidationMessage;
  const canGenerate = !getValidationMessage("review", payload, rootNodeName);
  const selectedDiagramType = isSupportedDiagramType(payload.diagramType)
    ? payload.diagramType
    : undefined;
  const selectedLayoutOptions = selectedDiagramType
    ? resolveDiagramLayoutOptions(selectedDiagramType, payload.layoutOptions)
    : undefined;
  const predictedNodesCount = useMemo(() => getPredictedNodesCount(payload), [payload]);

  function selectDiagramType(diagramType: WizardSupportedDiagramType) {
    setPayload((current) => ({
      ...current,
      diagramType,
      layoutOptions: resolveDiagramLayoutOptions(diagramType, current.layoutOptions),
    }));
  }

  function updateTreeLayoutOption(
    option: "direction" | "nodeSpacingX" | "nodeSpacingY",
    value: string | number,
  ) {
    setPayload((current) => {
      if (current.diagramType !== "tree") {
        return current;
      }

      const currentOptions = resolveDiagramLayoutOptions(
        "tree",
        current.layoutOptions,
      );
      const nextOptions: DiagramLayoutOptions = {
        ...currentOptions,
        ...(option === "direction"
          ? { direction: value as "top-down" | "left-right" }
          : { [option]: value }),
      };

      return {
        ...current,
        layoutOptions: nextOptions,
      };
    });
  }

  function updateFlowLayoutOption(
    option: "nodeSpacingX" | "nodeSpacingY",
    value: number,
  ) {
    setPayload((current) => {
      if (current.diagramType !== "flow") {
        return current;
      }

      const currentOptions = resolveDiagramLayoutOptions(
        "flow",
        current.layoutOptions,
      );

      return {
        ...current,
        layoutOptions: {
          ...currentOptions,
          [option]: value,
        },
      };
    });
  }

  function updateMindmapLayoutOption(value: number) {
    setPayload((current) => {
      if (current.diagramType !== "mindmap") {
        return current;
      }

      const currentOptions = resolveDiagramLayoutOptions(
        "mindmap",
        current.layoutOptions,
      );

      return {
        ...current,
        layoutOptions: {
          ...currentOptions,
          radialSpacing: value,
        },
      };
    });
  }

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
        const response = await fetch(`/api/projects/${project.id}/wizard-generate`, {
          method: "POST",
        });
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
        setSuccessMessage("Snapshot inicial criado com sucesso.");
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
    <div
      className="stepper"
      aria-label="Fluxo de criacao de snapshot inicial"
      data-testid="wizard-stepper"
    >
      <div className="row-actions">
        <span className="badge">
          <span className="badge-dot" aria-hidden="true" />
          Passo {currentIndex + 1}/{steps.length}
        </span>
        <span className="badge" data-testid="wizard-status-badge">
          {statusLabels[status]}
        </span>
        <span className="muted">Projeto: {project.name}</span>
      </div>

      <Stepper
        ariaLabel="Progresso do wizard"
        items={steps.map((step, index) => {
          const state = getStepState(index, currentIndex, maxUnlockedIndex);
          return {
            id: step.id,
            index: index + 1,
            title: step.title,
            description: step.description,
            state,
            disabled: index > maxUnlockedIndex,
            onSelect: () => handleGoToStep(step.id),
          };
        })}
      />

      <section
        className="panel"
        aria-labelledby="wizard-current-step"
        data-testid="wizard-current-panel"
      >
        <header className="panel-header">
          <div>
            <h3 id="wizard-current-step">{currentMeta.title}</h3>
            <p>{currentMeta.description}</p>
          </div>
        </header>
        <div className="panel-body">
          {currentStep === "template" ? (
            <div className="stack-sm">
              <div className="field">
                <label>Tipo de diagrama</label>
                <div className="grid-tiles">
                  {diagramTypeOptions.map((option) => (
                    <CardOption
                      key={option.value}
                      title={option.label}
                      description={option.description}
                      selected={selectedDiagramType === option.value}
                      preview={buildDiagramPreview(option.value)}
                      onSelect={() => selectDiagramType(option.value)}
                      dataTestId={`wizard-diagram-type-${option.value}`}
                    />
                  ))}
                </div>
                <p className="helper">
                  Selecione o tipo principal para calcular o layout inicial.
                </p>
              </div>

              {selectedDiagramType === "tree" && selectedLayoutOptions?.type === "tree" ? (
                <div className="dashboard-form">
                  <div className="field">
                    <label htmlFor="wizard-tree-direction">Direcao</label>
                    <select
                      id="wizard-tree-direction"
                      data-testid="wizard-tree-direction-select"
                      value={selectedLayoutOptions.direction}
                      onChange={(event) =>
                        updateTreeLayoutOption(
                          "direction",
                          event.target.value as "top-down" | "left-right",
                        )
                      }
                    >
                      <option value="top-down">Vertical (cima para baixo)</option>
                      <option value="left-right">
                        Horizontal (esquerda para direita)
                      </option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="wizard-tree-spacing-x">
                      Espacamento horizontal
                    </label>
                    <input
                      id="wizard-tree-spacing-x"
                      type="number"
                      min={24}
                      step={8}
                      data-testid="wizard-tree-spacing-x-input"
                      value={selectedLayoutOptions.nodeSpacingX}
                      onChange={(event) => {
                        if (!Number.isFinite(event.target.valueAsNumber)) {
                          return;
                        }
                        updateTreeLayoutOption(
                          "nodeSpacingX",
                          Math.max(24, event.target.valueAsNumber),
                        );
                      }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="wizard-tree-spacing-y">
                      Espacamento vertical
                    </label>
                    <input
                      id="wizard-tree-spacing-y"
                      type="number"
                      min={24}
                      step={8}
                      data-testid="wizard-tree-spacing-y-input"
                      value={selectedLayoutOptions.nodeSpacingY}
                      onChange={(event) => {
                        if (!Number.isFinite(event.target.valueAsNumber)) {
                          return;
                        }
                        updateTreeLayoutOption(
                          "nodeSpacingY",
                          Math.max(24, event.target.valueAsNumber),
                        );
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {selectedDiagramType === "flow" && selectedLayoutOptions?.type === "flow" ? (
                <div className="dashboard-form">
                  <div className="field">
                    <label htmlFor="wizard-flow-spacing-x">
                      Espacamento horizontal
                    </label>
                    <input
                      id="wizard-flow-spacing-x"
                      type="number"
                      min={24}
                      step={8}
                      data-testid="wizard-flow-spacing-x-input"
                      value={selectedLayoutOptions.nodeSpacingX}
                      onChange={(event) => {
                        if (!Number.isFinite(event.target.valueAsNumber)) {
                          return;
                        }
                        updateFlowLayoutOption(
                          "nodeSpacingX",
                          Math.max(24, event.target.valueAsNumber),
                        );
                      }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="wizard-flow-spacing-y">
                      Espacamento vertical
                    </label>
                    <input
                      id="wizard-flow-spacing-y"
                      type="number"
                      min={24}
                      step={8}
                      data-testid="wizard-flow-spacing-y-input"
                      value={selectedLayoutOptions.nodeSpacingY}
                      onChange={(event) => {
                        if (!Number.isFinite(event.target.valueAsNumber)) {
                          return;
                        }
                        updateFlowLayoutOption(
                          "nodeSpacingY",
                          Math.max(24, event.target.valueAsNumber),
                        );
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {selectedDiagramType === "mindmap" &&
              selectedLayoutOptions?.type === "mindmap" ? (
                <div className="field">
                  <label htmlFor="wizard-mindmap-radial-spacing">
                    Distancia radial
                  </label>
                  <input
                    id="wizard-mindmap-radial-spacing"
                    type="number"
                    min={24}
                    step={8}
                    data-testid="wizard-mindmap-radial-spacing-input"
                    value={selectedLayoutOptions.radialSpacing}
                    onChange={(event) => {
                      if (!Number.isFinite(event.target.valueAsNumber)) {
                        return;
                      }
                      updateMindmapLayoutOption(
                        Math.max(24, event.target.valueAsNumber),
                      );
                    }}
                  />
                </div>
              ) : null}

              <details className="tile">
                <summary>Avancado: template legado do projeto</summary>
                <div className="field">
                  <label htmlFor="wizard-template">Template legado</label>
                  <select
                    id="wizard-template"
                    data-testid="wizard-template-select"
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
                    {templateOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <p className="helper">
                    Use apenas para compatibilidade com fluxos legados.
                  </p>
                </div>
              </details>
            </div>
          ) : null}

          {currentStep === "diagram_type" ? (
            <div className="stack-sm">
              <div className="field">
                <label htmlFor="wizard-data-source">Origem de dados</label>
                <select
                  id="wizard-data-source"
                  data-testid="wizard-data-source-select"
                  value={payload.dataSource ?? ""}
                  onChange={(event) =>
                    setPayload((current) => {
                      const nextDataSource =
                        (event.target.value as WizardDraftPayload["dataSource"]) ||
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
                  <option value="manual">Manual</option>
                  <option value="import">Importacao</option>
                </select>
                <p className="helper">
                  Voce pode iniciar manualmente ou trazer uma base existente.
                </p>
              </div>

              {payload.dataSource === "import" ? (
                <div className="field">
                  <label htmlFor="wizard-import-kind">Fonte da importacao</label>
                  <select
                    id="wizard-import-kind"
                    data-testid="wizard-import-kind-select"
                    value={payload.importKind ?? ""}
                    onChange={(event) =>
                      setPayload((current) => ({
                        ...current,
                        importKind:
                          (event.target.value as WizardDraftPayload["importKind"]) ||
                          undefined,
                      }))
                    }
                  >
                    <option value="">Selecione...</option>
                    <option value="postgres">PostgreSQL</option>
                    <option value="prisma">Schema Prisma</option>
                  </select>
                </div>
              ) : null}
            </div>
          ) : null}

          {currentStep === "data_source" ? (
            <div className="dashboard-form">
              <div className="field">
                <label htmlFor="wizard-config-name">Nome do diagrama</label>
                <input
                  id="wizard-config-name"
                  data-testid="wizard-config-name-input"
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
                <label htmlFor="wizard-config-description">
                  Finalidade (opcional)
                </label>
                <textarea
                  id="wizard-config-description"
                  data-testid="wizard-config-description-input"
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
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  data-testid="wizard-config-generate-root-checkbox"
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
                Gerar no raiz inicial
              </label>

              {payload.config?.generateRootNode !== false ? (
                <div className="field">
                  <label htmlFor="wizard-config-root-node-name">
                    Nome do no raiz
                  </label>
                  <input
                    id="wizard-config-root-node-name"
                    data-testid="wizard-config-root-node-name-input"
                    value={rootNodeName}
                    onChange={(event) => setRootNodeName(event.target.value)}
                    placeholder="Ex.: Visao geral do projeto"
                  />
                </div>
              ) : null}

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  data-testid="wizard-config-allow-relayout-checkbox"
                  checked={allowReapplyLayout}
                  onChange={(event) => setAllowReapplyLayout(event.target.checked)}
                />
                Permitir reaplicar layout depois no editor
              </label>

              <div className="field">
                <label htmlFor="wizard-config-notes">Notas (opcional)</label>
                <textarea
                  id="wizard-config-notes"
                  data-testid="wizard-config-notes-input"
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
                  placeholder="Contexto adicional para o snapshot inicial."
                />
              </div>
            </div>
          ) : null}

          {currentStep === "config" ? (
            <div className="stack-sm">
              <div className="tile">
                <h3>Resumo da geracao</h3>
                <p>
                  <strong>Projeto:</strong> {payload.config?.name ?? "-"}
                </p>
                <p>
                  <strong>Tipo:</strong> {selectedDiagramType ?? "-"}
                </p>
                <p>
                  <strong>Layout:</strong>{" "}
                  {formatLayoutOptionsSummary(selectedLayoutOptions)}
                </p>
                <p>
                  <strong>Origem:</strong>{" "}
                  {payload.dataSource === "manual"
                    ? "Manual"
                    : payload.dataSource === "import"
                      ? `Importacao (${payload.importKind ?? "a definir"})`
                      : "-"}
                </p>
                <p>
                  <strong>No raiz:</strong>{" "}
                  {payload.config?.generateRootNode !== false
                    ? rootNodeName || "No raiz"
                    : "Nao sera gerado"}
                </p>
                <p>
                  <strong>Auto-layout no editor:</strong>{" "}
                  {allowReapplyLayout ? "Permitido" : "Nao permitido"}
                </p>
                <p>
                  <strong>Nos iniciais previstos:</strong> {predictedNodesCount}
                </p>
              </div>
              <p className="helper">
                Ao confirmar, o MapIA cria o snapshot inicial persistido deste
                projeto para edicao no Editor.
              </p>
            </div>
          ) : null}

          {currentStep === "review" ? (
            <div className="stack-sm">
              <div className="tile">
                <h3>Pronto para gerar</h3>
                <p>
                  Clique em <strong>Gerar snapshot inicial</strong> para criar a
                  base do editor com as configuracoes escolhidas.
                </p>
                {status === "generating" ? (
                  <p className="helper">Gerando snapshot inicial...</p>
                ) : null}
                {status === "ready" ? (
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => router.push(`/editor?projectId=${project.id}`)}
                      data-testid="wizard-open-editor-button"
                    >
                      Abrir Editor
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {currentValidationMessage ? (
            <p className="helper" style={{ marginTop: "0.85rem" }}>
              {currentValidationMessage}
            </p>
          ) : null}
        </div>
      </section>

      {errorMessage ? (
        <div className="error-box" data-testid="wizard-error">
          {errorMessage}
        </div>
      ) : null}
      {successMessage ? (
        <div className="success-box" data-testid="wizard-success">
          {successMessage}
        </div>
      ) : null}

      <nav className="step-nav" aria-label="Navegacao do wizard">
        <button
          className="btn"
          type="button"
          disabled={currentIndex === 0 || isPending}
          onClick={handleBack}
          data-testid="wizard-back-button"
        >
          Voltar
        </button>
        <button
          className="btn"
          type="button"
          disabled={isPending}
          onClick={handleSaveDraft}
          data-testid="wizard-save-draft-button"
        >
          {isPending ? "Processando..." : "Salvar rascunho"}
        </button>
        {currentStep !== "review" ? (
          <button
            className="btn btn-primary"
            type="button"
            disabled={!canGoNext || isPending}
            onClick={handleNext}
            data-testid="wizard-next-button"
          >
            Proximo
          </button>
        ) : (
          <button
            className="btn btn-primary"
            type="button"
            disabled={!canGenerate || isPending || status === "ready"}
            onClick={handleGenerate}
            data-testid="wizard-generate-button"
          >
            {isPending ? "Gerando..." : "Gerar snapshot inicial"}
          </button>
        )}
      </nav>
    </div>
  );
}
