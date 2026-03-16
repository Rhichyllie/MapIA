import { z } from "zod";
import { ProjectTemplateSchema } from "@/src/modules/projects/domain";
import {
  AnyDiagramTypeSchema,
  DiagramLayoutOptionsSchema,
  DiagramTypeSchema,
} from "@/src/modules/graph/domain";

export const DEFAULT_WIZARD_ROOT_NODE_NAME = "Visao geral";

export const WizardDraftStatusSchema = z.enum([
  "draft",
  "validating",
  "generating",
  "ready",
  "error",
]);

export const WizardStepSchema = z.enum([
  "template",
  "diagram_type",
  "data_source",
  "config",
  "review",
]);

export const WizardDiagramTypeSchema = AnyDiagramTypeSchema;
export const WizardSupportedDiagramTypeSchema = DiagramTypeSchema;

export const WizardDataSourceSchema = z.enum(["manual", "import"]);
export const WizardImportKindSchema = z.enum(["postgres", "prisma"]);

export const WizardDraftConfigSchema = z.object({
  name: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
  generateRootNode: z.boolean().optional(),
  rootNodeName: z.string().max(120).optional(),
  allowReapplyLayout: z.boolean().optional(),
});

export const WizardReadyConfigSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
  generateRootNode: z.boolean().default(true),
  rootNodeName: z.string().max(120).optional(),
  allowReapplyLayout: z.boolean().default(true),
});

export const WizardDraftPayloadSchema = z.object({
  template: ProjectTemplateSchema.optional(),
  diagramType: WizardDiagramTypeSchema.optional(),
  layoutOptions: DiagramLayoutOptionsSchema.optional(),
  dataSource: WizardDataSourceSchema.optional(),
  importKind: WizardImportKindSchema.optional(),
  config: WizardDraftConfigSchema.default({}),
});

export const WizardReadyPayloadSchema = z
  .object({
    template: ProjectTemplateSchema,
    diagramType: WizardSupportedDiagramTypeSchema,
    layoutOptions: DiagramLayoutOptionsSchema.optional(),
    dataSource: WizardDataSourceSchema,
    importKind: WizardImportKindSchema.optional(),
    config: WizardReadyConfigSchema,
  })
  .superRefine((value, ctx) => {
    if (value.layoutOptions && value.layoutOptions.type !== value.diagramType) {
      ctx.addIssue({
        code: "custom",
        path: ["layoutOptions"],
        message: "As opcoes de layout devem corresponder ao tipo de diagrama.",
      });
    }

    if (value.dataSource === "import" && !value.importKind) {
      ctx.addIssue({
        code: "custom",
        path: ["importKind"],
        message: "Selecione o tipo de importacao.",
      });
    }

    if (
      value.config.generateRootNode !== false &&
      !value.config.rootNodeName?.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["config", "rootNodeName"],
        message: "Informe o nome do no raiz inicial.",
      });
    }
  });

export const WizardDraftSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  status: WizardDraftStatusSchema,
  currentStep: WizardStepSchema,
  payload: WizardDraftPayloadSchema,
  lastError: z.string().max(500).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const SaveWizardDraftInputSchema = z.object({
  projectId: z.string().uuid(),
  currentStep: WizardStepSchema,
  payload: WizardDraftPayloadSchema,
  status: WizardDraftStatusSchema.optional(),
});

export const WizardGenerateInputSchema = z.object({
  projectId: z.string().uuid(),
  actorIdentity: z.string().email(),
});

export type WizardDraftStatus = z.infer<typeof WizardDraftStatusSchema>;
export type WizardStep = z.infer<typeof WizardStepSchema>;
export type WizardDiagramType = z.infer<typeof WizardDiagramTypeSchema>;
export type WizardSupportedDiagramType = z.infer<
  typeof WizardSupportedDiagramTypeSchema
>;
export type WizardDataSource = z.infer<typeof WizardDataSourceSchema>;
export type WizardImportKind = z.infer<typeof WizardImportKindSchema>;
export type WizardDraftPayload = z.infer<typeof WizardDraftPayloadSchema>;
export type WizardReadyPayload = z.infer<typeof WizardReadyPayloadSchema>;
export type WizardDraft = z.infer<typeof WizardDraftSchema>;
export type SaveWizardDraftInput = z.infer<typeof SaveWizardDraftInputSchema>;
export type WizardGenerateInput = z.infer<typeof WizardGenerateInputSchema>;
