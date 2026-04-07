import { z } from "zod";
import {
  AssistantDraftSchema,
  buildDefaultAutomationToggles,
  type AssistantDraft,
  type InitialView,
  type LayoutChoice,
} from "@/src/modules/creation-assistant/domain";
import { resolveCreationContext } from "@/src/modules/projects/domain";

// Compatibility adapter from the deprecated Wizard payload to the canonical
// Creation Assistant draft model.
const LegacyWizardDraftStatusSchema = z.enum([
  "draft",
  "validating",
  "generating",
  "ready",
  "error",
]);

const LegacyWizardStepSchema = z.enum([
  "template",
  "diagram_type",
  "data_source",
  "config",
  "review",
]);

const LegacyWizardDataSourceSchema = z.enum(["manual", "import"]);
const LegacyWizardImportKindSchema = z.enum(["postgres", "prisma"]);

const LegacyWizardLayoutOptionsSchema = z
  .object({
    type: z.enum(["tree", "flow", "mindmap"]),
    direction: z.enum(["top-down", "left-right"]).optional(),
    nodeSpacingX: z.number().finite().min(24).max(2000).optional(),
    nodeSpacingY: z.number().finite().min(24).max(2000).optional(),
    radialSpacing: z.number().finite().min(24).max(2000).optional(),
  })
  .optional();

const LegacyWizardDraftConfigSchema = z.object({
  name: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
  generateRootNode: z.boolean().optional(),
  rootNodeName: z.string().max(120).optional(),
  allowReapplyLayout: z.boolean().optional(),
});

export const LegacyWizardDraftPayloadSchema = z.object({
  template: z.enum(["sitemap", "flowchart", "erd", "graph"]).optional(),
  diagramType: z.enum(["tree", "flow", "mindmap"]).optional(),
  layoutOptions: LegacyWizardLayoutOptionsSchema,
  dataSource: LegacyWizardDataSourceSchema.optional(),
  importKind: LegacyWizardImportKindSchema.optional(),
  config: LegacyWizardDraftConfigSchema.default({}),
});

export const SaveLegacyWizardDraftInputSchema = z.object({
  currentStep: LegacyWizardStepSchema,
  payload: LegacyWizardDraftPayloadSchema,
  status: LegacyWizardDraftStatusSchema.optional(),
});

export type LegacyWizardDraftPayload = z.infer<typeof LegacyWizardDraftPayloadSchema>;
export type LegacyWizardDraftStatus = z.infer<typeof LegacyWizardDraftStatusSchema>;
export type LegacyWizardStep = z.infer<typeof LegacyWizardStepSchema>;

type LegacyWizardProjectInput = {
  name: string;
  description?: string | null;
  template: "sitemap" | "flowchart" | "erd" | "graph";
};

type LegacyWizardDraftViewModel = {
  status: LegacyWizardDraftStatus;
  currentStep: LegacyWizardStep;
  payload: LegacyWizardDraftPayload;
  lastError?: string;
};

function trimOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveLegacyLayoutChoice(input: {
  initialView: InitialView;
  payload: LegacyWizardDraftPayload;
  fallbackLayout: LayoutChoice;
}) {
  const { initialView, payload, fallbackLayout } = input;
  const direction = payload.layoutOptions?.direction;

  if (initialView === "hierarchy") {
    return direction === "left-right" ? "horizontal" : "vertical";
  }

  if (initialView === "flow") {
    return direction === "top-down" ? "vertical" : "horizontal";
  }

  if (initialView === "mindmap") {
    return "radial";
  }

  return fallbackLayout;
}

function resolveLegacyHybridSource(initialView: InitialView) {
  if (initialView === "hierarchy") {
    return "existing-map" as const;
  }

  if (initialView === "flow") {
    return "spreadsheet" as const;
  }

  return "json" as const;
}

function buildProjectObjective(input: {
  description?: string;
  notes?: string;
  fallbackDescription?: string | null;
}) {
  const description = trimOptional(input.description) ?? trimOptional(input.fallbackDescription);
  const notes = trimOptional(input.notes);
  const value = [description, notes].filter(Boolean).join("\n\n");

  if (!value) {
    return undefined;
  }

  return value.slice(0, 500);
}

export function buildAssistantDraftFromLegacyWizard(input: {
  project: LegacyWizardProjectInput;
  payload: LegacyWizardDraftPayload;
}): AssistantDraft {
  const contextResolution = resolveCreationContext({
    snapshotDiagramType: input.payload.diagramType,
    snapshotDiagramView: input.payload.diagramType,
    template: input.project.template,
  });
  const { effectiveProfile, effectiveInitialView, effectiveContextDefaults, effectiveLayout } =
    contextResolution.context;
  const generateRootNode = input.payload.config.generateRootNode ?? true;
  const rootNodeName =
    trimOptional(input.payload.config.rootNodeName) ??
    trimOptional(effectiveContextDefaults.setup?.initialRootName) ??
    (effectiveInitialView === "hierarchy" ? "No raiz" : "Nucleo");
  const layout = resolveLegacyLayoutChoice({
    initialView: effectiveInitialView,
    payload: input.payload,
    fallbackLayout: effectiveLayout,
  });
  const defaultAutomation = buildDefaultAutomationToggles();
  const projectObjective = buildProjectObjective({
    description: input.payload.config.description,
    notes: input.payload.config.notes,
    fallbackDescription: input.project.description,
  });
  const assistantDraft = AssistantDraftSchema.parse({
    projectName: trimOptional(input.payload.config.name) ?? input.project.name,
    ...(projectObjective
      ? {
          projectObjective,
        }
      : {}),
    profile: effectiveProfile,
    startStrategy:
      input.payload.dataSource === "import" ? "hybrid" : "manual",
    ...(input.payload.dataSource === "import"
      ? { startSource: resolveLegacyHybridSource(effectiveInitialView) }
      : {}),
    initialView: effectiveInitialView,
    layout,
    detailLevel: "intermediate",
    automation: {
      ...defaultAutomation,
      autoOrganizeOnCreate: input.payload.config.allowReapplyLayout ?? true,
    },
    context: {
      ...effectiveContextDefaults,
      setup: {
        ...(effectiveContextDefaults.setup ?? {}),
        createExamples: true,
        suggestedBlockCount: effectiveContextDefaults.setup?.suggestedBlockCount ?? 3,
        createInitialRoot: generateRootNode,
        initialRootName: rootNodeName,
      },
      ...(effectiveInitialView === "hierarchy"
        ? {
            hierarchy: {
              ...(effectiveContextDefaults.hierarchy ?? {
                createRoot: true,
                direction: "top-down" as const,
                initialDepthHint: 2,
              }),
              createRoot: generateRootNode,
              direction:
                input.payload.layoutOptions?.direction === "left-right"
                  ? "left-right"
                  : "top-down",
            },
          }
        : {}),
      ...(effectiveInitialView === "flow"
        ? {
            flow: {
              ...(effectiveContextDefaults.flow ?? {
                autoCreateStartEnd: true,
                allowDecisions: true,
                direction: "left-right" as const,
                allowMultipleOutputs: false,
              }),
              direction:
                input.payload.layoutOptions?.direction === "top-down"
                  ? "top-down"
                  : "left-right",
            },
          }
        : {}),
    },
  });

  return assistantDraft;
}

export function buildLegacyWizardDraftViewModel(input: {
  currentStep: LegacyWizardStep;
  payload: LegacyWizardDraftPayload;
  status?: LegacyWizardDraftStatus;
  lastError?: string;
}): LegacyWizardDraftViewModel {
  return {
    status: input.status ?? "draft",
    currentStep: input.currentStep,
    payload: input.payload,
    ...(input.lastError ? { lastError: input.lastError } : {}),
  };
}
