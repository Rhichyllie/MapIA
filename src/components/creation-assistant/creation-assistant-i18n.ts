import { createTranslator, useLocale, useMessages } from "next-intl";
import {
  getViewCompatibilityRank,
  type AutomationToggles,
  type CreationAssistantValidationIssueCode,
  type DetailLevel,
  type InitialView,
  type LayoutNormalizationWarningCode,
  type LayoutChoice,
  type MessageDescriptor,
  type ProjectProfile,
  type RecipeStrictValidationIssueCode,
  type SourceConfigPreview,
  type SourceLifecycleSummaryCode,
  type SourcePreviewDetailCode,
  type SourcePreviewSummaryCode,
  type SourcePrecheckResult,
  type SourceStatus,
  type StartStrategyRecommendationReason,
  type StartSource,
  type StartStrategy,
  type TemplatePreset,
} from "@/src/modules/creation-assistant/domain";
import type { AppMessages } from "@/src/i18n/messages";
import type { AppLocale } from "@/src/i18n/routing";
import type { StepId } from "./shared";

type CreateMessages = Pick<AppMessages, "Create">;

const stepPaths = {
  project: {
    title: "steps.project.title",
    description: "steps.project.description",
  },
  scope: {
    title: "steps.scope.title",
    description: "steps.scope.description",
  },
  origin: {
    title: "steps.origin.title",
    description: "steps.origin.description",
  },
  view: {
    title: "steps.view.title",
    description: "steps.view.description",
  },
  adjustments: {
    title: "steps.adjustments.title",
    description: "steps.adjustments.description",
  },
  review: {
    title: "steps.review.title",
    description: "steps.review.description",
  },
} as const satisfies Record<
  StepId,
  { title: string; description: string }
>;

const projectProfilePaths = {
  blank: {
    title: "labels.projectProfiles.blank.title",
    description: "labels.projectProfiles.blank.description",
    summary: "labels.projectProfiles.blank.summary",
  },
  "information-structure": {
    title: "labels.projectProfiles.information-structure.title",
    description: "labels.projectProfiles.information-structure.description",
    summary: "labels.projectProfiles.information-structure.summary",
  },
  process: {
    title: "labels.projectProfiles.process.title",
    description: "labels.projectProfiles.process.description",
    summary: "labels.projectProfiles.process.summary",
  },
  "data-model": {
    title: "labels.projectProfiles.data-model.title",
    description: "labels.projectProfiles.data-model.description",
    summary: "labels.projectProfiles.data-model.summary",
  },
  "system-architecture": {
    title: "labels.projectProfiles.system-architecture.title",
    description: "labels.projectProfiles.system-architecture.description",
    summary: "labels.projectProfiles.system-architecture.summary",
  },
  "documents-governance": {
    title: "labels.projectProfiles.documents-governance.title",
    description: "labels.projectProfiles.documents-governance.description",
    summary: "labels.projectProfiles.documents-governance.summary",
  },
  mixed: {
    title: "labels.projectProfiles.mixed.title",
    description: "labels.projectProfiles.mixed.description",
    summary: "labels.projectProfiles.mixed.summary",
  },
} as const satisfies Record<
  ProjectProfile,
  { title: string; description: string; summary: string }
>;

const startStrategyPaths = {
  manual: {
    title: "labels.startStrategies.manual.title",
    description: "labels.startStrategies.manual.description",
  },
  import: {
    title: "labels.startStrategies.import.title",
    description: "labels.startStrategies.import.description",
  },
  template: {
    title: "labels.startStrategies.template.title",
    description: "labels.startStrategies.template.description",
  },
  hybrid: {
    title: "labels.startStrategies.hybrid.title",
    description: "labels.startStrategies.hybrid.description",
  },
} as const satisfies Record<
  StartStrategy,
  { title: string; description: string }
>;

const startSourcePaths = {
  postgres: "labels.startSources.postgres",
  mysql: "labels.startSources.mysql",
  sqlserver: "labels.startSources.sqlserver",
  "prisma-schema": "labels.startSources.prisma-schema",
  "sql-file": "labels.startSources.sql-file",
  "relational-json": "labels.startSources.relational-json",
  openapi: "labels.startSources.openapi",
  graphql: "labels.startSources.graphql",
  "code-routes": "labels.startSources.code-routes",
  "folder-structure": "labels.startSources.folder-structure",
  events: "labels.startSources.events",
  "yaml-json": "labels.startSources.yaml-json",
  csv: "labels.startSources.csv",
  json: "labels.startSources.json",
  spreadsheet: "labels.startSources.spreadsheet",
  "cms-export": "labels.startSources.cms-export",
  "existing-map": "labels.startSources.existing-map",
  "document-repository": "labels.startSources.document-repository",
  "custom-import": "labels.startSources.custom-import",
} as const satisfies Record<StartSource, string>;

const templatePresetPaths = {
  "erd-basic": "labels.templatePresets.erd-basic",
  "process-basic": "labels.templatePresets.process-basic",
  "sitemap-basic": "labels.templatePresets.sitemap-basic",
  "architecture-basic": "labels.templatePresets.architecture-basic",
  "blank-canvas": "labels.templatePresets.blank-canvas",
} as const satisfies Record<TemplatePreset, string>;

const initialViewPaths = {
  free: {
    label: "labels.initialViews.free.label",
    description: "labels.initialViews.free.description",
  },
  hierarchy: {
    label: "labels.initialViews.hierarchy.label",
    description: "labels.initialViews.hierarchy.description",
  },
  flow: {
    label: "labels.initialViews.flow.label",
    description: "labels.initialViews.flow.description",
  },
  graph: {
    label: "labels.initialViews.graph.label",
    description: "labels.initialViews.graph.description",
  },
  erd: {
    label: "labels.initialViews.erd.label",
    description: "labels.initialViews.erd.description",
  },
  sitemap: {
    label: "labels.initialViews.sitemap.label",
    description: "labels.initialViews.sitemap.description",
  },
  timeline: {
    label: "labels.initialViews.timeline.label",
    description: "labels.initialViews.timeline.description",
  },
  mindmap: {
    label: "labels.initialViews.mindmap.label",
    description: "labels.initialViews.mindmap.description",
  },
} as const satisfies Record<
  InitialView,
  { label: string; description: string }
>;

const layoutChoicePaths = {
  auto: "labels.layouts.auto",
  vertical: "labels.layouts.vertical",
  horizontal: "labels.layouts.horizontal",
  radial: "labels.layouts.radial",
  relational: "labels.layouts.relational",
  free: "labels.layouts.free",
} as const satisfies Record<LayoutChoice, string>;

const detailLevelPaths = {
  essential: "labels.detailLevels.essential",
  intermediate: "labels.detailLevels.intermediate",
  detailed: "labels.detailLevels.detailed",
} as const satisfies Record<DetailLevel, string>;

const automationPaths = {
  inferRelations: {
    label: "labels.automation.inferRelations.label",
    help: "labels.automation.inferRelations.help",
  },
  createLinkFields: {
    label: "labels.automation.createLinkFields.label",
    help: "labels.automation.createLinkFields.help",
  },
  applySuggestedNames: {
    label: "labels.automation.applySuggestedNames.label",
    help: "labels.automation.applySuggestedNames.help",
  },
  autoOrganizeOnCreate: {
    label: "labels.automation.autoOrganizeOnCreate.label",
    help: "labels.automation.autoOrganizeOnCreate.help",
  },
  detectInconsistenciesEarly: {
    label: "labels.automation.detectInconsistenciesEarly.label",
    help: "labels.automation.detectInconsistenciesEarly.help",
  },
} as const satisfies Record<
  keyof AutomationToggles,
  { label: string; help: string }
>;

const sourceStatusPaths = {
  not_configured: "labels.sourceStatus.not_configured",
  configured: "labels.sourceStatus.configured",
  precheck_ok: "labels.sourceStatus.precheck_ok",
  ready_to_attempt_import: "labels.sourceStatus.ready_to_attempt_import",
  imported: "labels.sourceStatus.imported",
  failed: "labels.sourceStatus.failed",
} as const satisfies Record<SourceStatus, string>;

const startStrategyRecommendationReasonPaths = {
  existing_project_previous_source:
    "labels.startStrategyRecommendationReasons.existing_project_previous_source",
  data_model_structural_import:
    "labels.startStrategyRecommendationReasons.data_model_structural_import",
  data_model_configurable_import:
    "labels.startStrategyRecommendationReasons.data_model_configurable_import",
  data_model_preview_hybrid:
    "labels.startStrategyRecommendationReasons.data_model_preview_hybrid",
  data_model_template:
    "labels.startStrategyRecommendationReasons.data_model_template",
  system_architecture_import:
    "labels.startStrategyRecommendationReasons.system_architecture_import",
  system_architecture_hybrid:
    "labels.startStrategyRecommendationReasons.system_architecture_hybrid",
  system_architecture_template:
    "labels.startStrategyRecommendationReasons.system_architecture_template",
  information_structure_import:
    "labels.startStrategyRecommendationReasons.information_structure_import",
  information_structure_hybrid:
    "labels.startStrategyRecommendationReasons.information_structure_hybrid",
  information_structure_template:
    "labels.startStrategyRecommendationReasons.information_structure_template",
  process_template:
    "labels.startStrategyRecommendationReasons.process_template",
  mixed_hybrid: "labels.startStrategyRecommendationReasons.mixed_hybrid",
  mixed_manual_preview:
    "labels.startStrategyRecommendationReasons.mixed_manual_preview",
  mixed_manual_blank:
    "labels.startStrategyRecommendationReasons.mixed_manual_blank",
  blank_manual: "labels.startStrategyRecommendationReasons.blank_manual",
} as const satisfies Record<StartStrategyRecommendationReason, string>;

const layoutWarningPaths = {
  legacy_layout_normalized_to_auto:
    "labels.layoutWarnings.legacy_layout_normalized_to_auto",
} as const satisfies Record<LayoutNormalizationWarningCode, string>;

const strictValidationIssuePaths = {
  import_source_not_ready: "labels.strictValidationIssues.import_source_not_ready",
  process_auto_start_end_requires_examples:
    "labels.strictValidationIssues.process_auto_start_end_requires_examples",
  sitemap_auto_home_requires_examples:
    "labels.strictValidationIssues.sitemap_auto_home_requires_examples",
  hierarchy_root_requires_examples:
    "labels.strictValidationIssues.hierarchy_root_requires_examples",
  system_graph_requires_examples:
    "labels.strictValidationIssues.system_graph_requires_examples",
} as const satisfies Record<RecipeStrictValidationIssueCode, string>;

type CatalogBackedSourcePreviewDetailCode = Exclude<
  SourcePreviewDetailCode,
  "legacy_runtime_text"
>;

type CatalogBackedSourceLifecycleSummaryCode = Exclude<
  SourceLifecycleSummaryCode,
  "legacy_runtime_text"
>;

const sourcePreviewSummaryPaths = {
  prisma_preview_schema_required:
    "labels.sourcePreviewSummary.prisma_preview_schema_required",
  prisma_preview_models_detected:
    "labels.sourcePreviewSummary.prisma_preview_models_detected",
  prisma_preview_ready_without_models:
    "labels.sourcePreviewSummary.prisma_preview_ready_without_models",
  relational_preview_connection_string_ready:
    "labels.sourcePreviewSummary.relational_preview_connection_string_ready",
  relational_preview_connection_string_required:
    "labels.sourcePreviewSummary.relational_preview_connection_string_required",
  relational_preview_fields_ready:
    "labels.sourcePreviewSummary.relational_preview_fields_ready",
  relational_preview_fields_required:
    "labels.sourcePreviewSummary.relational_preview_fields_required",
  openapi_preview_url_ready:
    "labels.sourcePreviewSummary.openapi_preview_url_ready",
  openapi_preview_url_required:
    "labels.sourcePreviewSummary.openapi_preview_url_required",
  openapi_preview_spec_required:
    "labels.sourcePreviewSummary.openapi_preview_spec_required",
  openapi_preview_recognized:
    "labels.sourcePreviewSummary.openapi_preview_recognized",
  graphql_preview_recognized:
    "labels.sourcePreviewSummary.graphql_preview_recognized",
  graphql_preview_endpoint_ready:
    "labels.sourcePreviewSummary.graphql_preview_endpoint_ready",
  graphql_preview_endpoint_or_schema_required:
    "labels.sourcePreviewSummary.graphql_preview_endpoint_or_schema_required",
  csv_preview_text_required:
    "labels.sourcePreviewSummary.csv_preview_text_required",
  csv_preview_columns_detected:
    "labels.sourcePreviewSummary.csv_preview_columns_detected",
  csv_preview_header_not_recognized:
    "labels.sourcePreviewSummary.csv_preview_header_not_recognized",
  json_preview_text_required:
    "labels.sourcePreviewSummary.json_preview_text_required",
  json_preview_invalid: "labels.sourcePreviewSummary.json_preview_invalid",
  json_preview_recognized:
    "labels.sourcePreviewSummary.json_preview_recognized",
  spreadsheet_preview_ready:
    "labels.sourcePreviewSummary.spreadsheet_preview_ready",
  spreadsheet_preview_text_required:
    "labels.sourcePreviewSummary.spreadsheet_preview_text_required",
  generic_preview_ready: "labels.sourcePreviewSummary.generic_preview_ready",
  generic_preview_text_required:
    "labels.sourcePreviewSummary.generic_preview_text_required",
  openapi_document_empty: "labels.validationIssues.openapi_document_empty",
  openapi_document_parse_failed:
    "labels.validationIssues.openapi_document_parse_failed",
  openapi_document_missing_spec_marker:
    "labels.validationIssues.openapi_document_missing_spec_marker",
  openapi_document_missing_version:
    "labels.validationIssues.openapi_document_missing_version",
  graphql_schema_empty: "labels.validationIssues.graphql_schema_empty",
  graphql_schema_missing_valid_types:
    "labels.validationIssues.graphql_schema_missing_valid_types",
} as const satisfies Record<SourcePreviewSummaryCode, string>;

const sourcePreviewDetailPaths = {
  openapi_preview_format: "labels.sourcePreviewDetails.openapi_preview_format",
  openapi_preview_title: "labels.sourcePreviewDetails.openapi_preview_title",
  graphql_preview_source_sdl:
    "labels.sourcePreviewDetails.graphql_preview_source_sdl",
  graphql_preview_source_introspection_json:
    "labels.sourcePreviewDetails.graphql_preview_source_introspection_json",
} as const satisfies Record<CatalogBackedSourcePreviewDetailCode, string>;

const sourceLifecycleSummaryPaths = {
  source_lifecycle_precheck_failed:
    "labels.sourceLifecycleSummary.source_lifecycle_precheck_failed",
  source_lifecycle_imported:
    "labels.sourceLifecycleSummary.source_lifecycle_imported",
} as const satisfies Record<CatalogBackedSourceLifecycleSummaryCode, string>;

const validationIssuePaths = {
  setup_initial_root_name_required:
    "labels.validationIssues.setup_initial_root_name_required",
  relational_connection_string_invalid:
    "labels.validationIssues.relational_connection_string_invalid",
  relational_host_required: "labels.validationIssues.relational_host_required",
  relational_database_required:
    "labels.validationIssues.relational_database_required",
  relational_port_required: "labels.validationIssues.relational_port_required",
  relational_username_required:
    "labels.validationIssues.relational_username_required",
  prisma_schema_required: "labels.validationIssues.prisma_schema_required",
  openapi_url_required: "labels.validationIssues.openapi_url_required",
  openapi_url_invalid: "labels.validationIssues.openapi_url_invalid",
  openapi_spec_required: "labels.validationIssues.openapi_spec_required",
  graphql_endpoint_or_schema_required:
    "labels.validationIssues.graphql_endpoint_or_schema_required",
  graphql_endpoint_invalid:
    "labels.validationIssues.graphql_endpoint_invalid",
  generic_text_required: "labels.validationIssues.generic_text_required",
  generic_json_invalid: "labels.validationIssues.generic_json_invalid",
  generic_csv_headers_invalid:
    "labels.validationIssues.generic_csv_headers_invalid",
  generic_mapping_field_not_found:
    "labels.validationIssues.generic_mapping_field_not_found",
  source_config_required_for_import:
    "labels.validationIssues.source_config_required_for_import",
  start_source_required_for_source_config:
    "labels.validationIssues.start_source_required_for_source_config",
  source_config_kind_mismatch:
    "labels.validationIssues.source_config_kind_mismatch",
  template_preset_required:
    "labels.validationIssues.template_preset_required",
  template_cannot_use_source:
    "labels.validationIssues.template_cannot_use_source",
  template_cannot_use_source_config:
    "labels.validationIssues.template_cannot_use_source_config",
  manual_cannot_use_source: "labels.validationIssues.manual_cannot_use_source",
  manual_cannot_use_template_preset:
    "labels.validationIssues.manual_cannot_use_template_preset",
  manual_cannot_use_source_config:
    "labels.validationIssues.manual_cannot_use_source_config",
  import_cannot_use_template_preset:
    "labels.validationIssues.import_cannot_use_template_preset",
  start_source_incompatible_with_profile:
    "labels.validationIssues.start_source_incompatible_with_profile",
  initial_view_incompatible_with_profile:
    "labels.validationIssues.initial_view_incompatible_with_profile",
  layout_incompatible_with_initial_view:
    "labels.validationIssues.layout_incompatible_with_initial_view",
  openapi_document_empty: "labels.validationIssues.openapi_document_empty",
  openapi_document_parse_failed:
    "labels.validationIssues.openapi_document_parse_failed",
  openapi_document_missing_spec_marker:
    "labels.validationIssues.openapi_document_missing_spec_marker",
  openapi_document_missing_version:
    "labels.validationIssues.openapi_document_missing_version",
  graphql_schema_empty: "labels.validationIssues.graphql_schema_empty",
  graphql_schema_missing_valid_types:
    "labels.validationIssues.graphql_schema_missing_valid_types",
} as const satisfies Record<CreationAssistantValidationIssueCode, string>;

function toCreateTranslator(locale: AppLocale, messages: CreateMessages) {
  return createTranslator({
    locale,
    messages,
    namespace: "Create",
  });
}

export type CreationAssistantLabels = ReturnType<
  typeof createCreationAssistantLabels
>;

export function createCreationAssistantLabels(
  messages: CreateMessages,
  locale: AppLocale,
) {
  const t = toCreateTranslator(locale, messages);

  function hasOwnPath<T extends Record<string, string>>(
    registry: T,
    code: string,
  ): code is Extract<keyof T, string> {
    return Object.prototype.hasOwnProperty.call(registry, code);
  }

  function translatePath(path: string, values?: Record<string, string | number>) {
    return values
      ? t(path as Parameters<typeof t>[0], values as never)
      : t(path as Parameters<typeof t>[0]);
  }

  function resolveMessageCode(
    code:
      | RecipeStrictValidationIssueCode
      | CreationAssistantValidationIssueCode
      | SourcePreviewSummaryCode
      | SourceLifecycleSummaryCode
      | CatalogBackedSourcePreviewDetailCode,
    values?: Record<string, string | number>,
  ) {
    if (code === "legacy_runtime_text") {
      return typeof values?.text === "string" ? values.text : code;
    }

    if (hasOwnPath(strictValidationIssuePaths, code)) {
      return translatePath(strictValidationIssuePaths[code], values);
    }

    if (hasOwnPath(validationIssuePaths, code)) {
      return translatePath(validationIssuePaths[code], values);
    }

    if (hasOwnPath(sourcePreviewSummaryPaths, code)) {
      return translatePath(sourcePreviewSummaryPaths[code], values);
    }

    if (hasOwnPath(sourceLifecycleSummaryPaths, code)) {
      return translatePath(sourceLifecycleSummaryPaths[code], values);
    }

    if (hasOwnPath(sourcePreviewDetailPaths, code)) {
      return translatePath(sourcePreviewDetailPaths[code], values);
    }

    return code;
  }

  function resolveMessageDescriptor(descriptor: MessageDescriptor) {
    if (descriptor.code === "legacy_runtime_text") {
      return typeof descriptor.values?.text === "string"
        ? descriptor.values.text
        : "";
    }

    return resolveMessageCode(
      descriptor.code as
        | CreationAssistantValidationIssueCode
        | RecipeStrictValidationIssueCode
        | SourcePreviewSummaryCode
        | SourceLifecycleSummaryCode
        | CatalogBackedSourcePreviewDetailCode,
      descriptor.values,
    );
  }

  function getSourcePreviewCopy(preview: SourceConfigPreview | null) {
    if (!preview) {
      return null;
    }

    return {
      status: preview.status,
      summary: resolveMessageCode(preview.summaryCode, preview.summaryValues),
      details: preview.details?.map(resolveMessageDescriptor) ?? [],
      fields: preview.fields ?? [],
      sample: preview.sample ?? [],
    };
  }

  function getSourcePrecheckCopy(precheckResult?: SourcePrecheckResult) {
    if (!precheckResult) {
      return null;
    }

    return {
      summary: resolveMessageCode(
        precheckResult.summaryCode as SourcePreviewSummaryCode | SourceLifecycleSummaryCode,
        precheckResult.summaryValues,
      ),
      details: precheckResult.details?.map(resolveMessageDescriptor) ?? [],
    };
  }

  return {
    defaults: {
      projectName: t("defaults.projectName"),
      rootName: t("defaults.rootName"),
      hierarchyRootName: t("defaults.hierarchyRootName"),
    },
    shell: {
      modeBadge: {
        new: t("shell.modeBadge.new"),
        existing: t("shell.modeBadge.existing"),
      },
      draftVersion: (version: number) =>
        t("shell.draftVersion", { version: String(version) }),
      stepCounter: (current: number, total: number) =>
        t("shell.stepCounter", {
          current: String(current),
          total: String(total),
        }),
      progressAriaLabel: t("shell.progressAriaLabel"),
      recommendedBecause: (reason: string) =>
        t("shell.recommendedBecause", { reason }),
      useRecommended: t("shell.useRecommended"),
      recommendedActive: t("shell.recommendedActive"),
      sourceStatusTitle: t("shell.sourceStatusTitle"),
      sourceConnectionTitle: t("shell.sourceConnectionTitle"),
      connectLater: t("shell.connectLater"),
      configureNow: t("shell.configureNow"),
      configureSourceNow: t("shell.configureSourceNow"),
      connectLaterButton: t("shell.connectLaterButton"),
      connectLaterDescription: t("shell.connectLaterDescription"),
      hybridOptionalConfiguration: t("shell.hybridOptionalConfiguration"),
      hybridConnectLater: t("shell.hybridConnectLater"),
      back: t("shell.back"),
      saveDraft: t("shell.saveDraft"),
      continue: t("shell.continue"),
      finishNew: t("shell.finishNew"),
      finishExisting: t("shell.finishExisting"),
    },
    projectStep: {
      projectNameLabel: t("projectStep.projectNameLabel"),
      objectiveLabel: t("projectStep.objectiveLabel"),
      helper: t("projectStep.helper"),
    },
    initialViewStep: {
      recommendedLabel: t("initialViewStep.recommendedLabel"),
      otherViewsLabel: t("initialViewStep.otherViewsLabel"),
    },
    originStep: {
      strategyRecommendedDescription: t("originStep.strategyRecommendedDescription"),
      templatePresetDescription: t("originStep.templatePresetDescription"),
      sourceDescription: t("originStep.sourceDescription"),
    },
    settingsStep: {
      structureTitle: t("settingsStep.structureTitle"),
      createExamples: t("settingsStep.createExamples"),
      suggestedBlocksLabel: t("settingsStep.suggestedBlocksLabel"),
      suggestedBlocksValue: (count: number) =>
        t("settingsStep.suggestedBlocksValue", { count: String(count) }),
      showAdvanced: t("settingsStep.showAdvanced"),
      hideAdvanced: t("settingsStep.hideAdvanced"),
      createInitialRoot: t("settingsStep.createInitialRoot"),
      initialRootNameLabel: t("settingsStep.initialRootNameLabel"),
      layoutTitle: t("settingsStep.layoutTitle"),
      recommendedLayoutsLabel: t("settingsStep.recommendedLayoutsLabel"),
      recommendedLayoutDescription: t("settingsStep.recommendedLayoutDescription"),
      advancedLayoutDescription: t("settingsStep.advancedLayoutDescription"),
      detailLevelTitle: t("settingsStep.detailLevelTitle"),
      detailLevelDescription: t("settingsStep.detailLevelDescription"),
      automationTitle: t("settingsStep.automationTitle"),
      contextTitle: t("settingsStep.contextTitle"),
      erd: {
        useDefaultIdPk: t("settingsStep.erd.useDefaultIdPk"),
        autoCreateFk: t("settingsStep.erd.autoCreateFk"),
        suggestAssociativeForNN: t("settingsStep.erd.suggestAssociativeForNN"),
        showFieldTypes: t("settingsStep.erd.showFieldTypes"),
        enableDataSemantics: t("settingsStep.erd.enableDataSemantics"),
        generateTimestamps: t("settingsStep.erd.generateTimestamps"),
        suggestIndexes: t("settingsStep.erd.suggestIndexes"),
      },
      flow: {
        autoCreateStartEnd: t("settingsStep.flow.autoCreateStartEnd"),
        allowDecisions: t("settingsStep.flow.allowDecisions"),
        directionLabel: t("settingsStep.flow.directionLabel"),
        allowMultipleOutputs: t("settingsStep.flow.allowMultipleOutputs"),
      },
      sitemap: {
        autoCreateHome: t("settingsStep.sitemap.autoCreateHome"),
        generateMainSections: t("settingsStep.sitemap.generateMainSections"),
        showNavDepth: t("settingsStep.sitemap.showNavDepth"),
      },
      hierarchy: {
        createRoot: t("settingsStep.hierarchy.createRoot"),
        directionLabel: t("settingsStep.hierarchy.directionLabel"),
        initialDepthHintLabel: t("settingsStep.hierarchy.initialDepthHintLabel"),
      },
      graph: {
        autoGroup: t("settingsStep.graph.autoGroup"),
        reduceCrossing: t("settingsStep.graph.reduceCrossing"),
        showEdgeLabels: t("settingsStep.graph.showEdgeLabels"),
      },
      orientation: {
        horizontal: t("settingsStep.orientation.horizontal"),
        vertical: t("settingsStep.orientation.vertical"),
      },
    },
    reviewStep: {
      nameLabel: t("reviewStep.nameLabel"),
      profileLabel: t("reviewStep.profileLabel"),
      originLabel: t("reviewStep.originLabel"),
      viewLabel: t("reviewStep.viewLabel"),
      layoutLabel: t("reviewStep.layoutLabel"),
      detailLabel: t("reviewStep.detailLabel"),
      suggestedBlocksLabel: t("reviewStep.suggestedBlocksLabel"),
      initialRootLabel: t("reviewStep.initialRootLabel"),
      enabledAutomationLabel: t("reviewStep.enabledAutomationLabel"),
      sourceLabel: t("reviewStep.sourceLabel"),
      sourceStatusLabel: t("reviewStep.sourceStatusLabel"),
      recommendedStrategyLabel: t("reviewStep.recommendedStrategyLabel"),
      rootEnabledFallback: t("reviewStep.rootEnabledFallback"),
      rootDisabledFallback: t("reviewStep.rootDisabledFallback"),
      noAutomation: t("reviewStep.noAutomation"),
      noTemplateSelected: t("reviewStep.noTemplateSelected"),
      noSourceSelected: t("reviewStep.noSourceSelected"),
    },
    sourceForms: {
      prisma: {
        inputLabel: t("sourceForms.prisma.inputLabel"),
        pasteOption: t("sourceForms.prisma.pasteOption"),
        uploadOption: t("sourceForms.prisma.uploadOption"),
        schemaLabel: t("sourceForms.prisma.schemaLabel"),
        schemaPlaceholder: t("sourceForms.prisma.schemaPlaceholder"),
        validateNowButton: t("sourceForms.prisma.validateNowButton"),
        validateOnCreateHint: t("sourceForms.prisma.validateOnCreateHint"),
      },
      postgres: {
        connectionModeLabel: t("sourceForms.postgres.connectionModeLabel"),
        connectionStringOption: t("sourceForms.postgres.connectionStringOption"),
        separateFieldsOption: t("sourceForms.postgres.separateFieldsOption"),
        connectionStringLabel: t("sourceForms.postgres.connectionStringLabel"),
        connectionStringPlaceholder: t("sourceForms.postgres.connectionStringPlaceholder"),
        hostLabel: t("sourceForms.postgres.hostLabel"),
        hostPlaceholder: t("sourceForms.postgres.hostPlaceholder"),
        portLabel: t("sourceForms.postgres.portLabel"),
        portPlaceholder: t("sourceForms.postgres.portPlaceholder"),
        databaseLabel: t("sourceForms.postgres.databaseLabel"),
        databasePlaceholder: t("sourceForms.postgres.databasePlaceholder"),
        schemaLabel: t("sourceForms.postgres.schemaLabel"),
        schemaPlaceholder: t("sourceForms.postgres.schemaPlaceholder"),
        authModeLabel: t("sourceForms.postgres.authModeLabel"),
        userPassOption: t("sourceForms.postgres.userPassOption"),
        iamOption: t("sourceForms.postgres.iamOption"),
        usernameLabel: t("sourceForms.postgres.usernameLabel"),
        usernamePlaceholder: t("sourceForms.postgres.usernamePlaceholder"),
        passwordLabel: t("sourceForms.postgres.passwordLabel"),
        passwordPlaceholder: t("sourceForms.postgres.passwordPlaceholder"),
        draftSafetyHint: t("sourceForms.postgres.draftSafetyHint"),
        securityHint: t("sourceForms.postgres.securityHint"),
      },
      openApi: {
        inputLabel: t("sourceForms.openApi.inputLabel"),
        urlOption: t("sourceForms.openApi.urlOption"),
        pasteOption: t("sourceForms.openApi.pasteOption"),
        uploadOption: t("sourceForms.openApi.uploadOption"),
        urlLabel: t("sourceForms.openApi.urlLabel"),
        urlPlaceholder: t("sourceForms.openApi.urlPlaceholder"),
        specLabel: t("sourceForms.openApi.specLabel"),
        specPlaceholder: t("sourceForms.openApi.specPlaceholder"),
        verificationHint: t("sourceForms.openApi.verificationHint"),
      },
      graphQl: {
        endpointLabel: t("sourceForms.graphQl.endpointLabel"),
        endpointPlaceholder: t("sourceForms.graphQl.endpointPlaceholder"),
        schemaLabel: t("sourceForms.graphQl.schemaLabel"),
        schemaPlaceholder: t("sourceForms.graphQl.schemaPlaceholder"),
        verificationHint: t("sourceForms.graphQl.verificationHint"),
      },
      generic: {
        inputLabel: t("sourceForms.generic.inputLabel"),
        pasteOption: t("sourceForms.generic.pasteOption"),
        uploadOption: t("sourceForms.generic.uploadOption"),
        delimiterLabel: t("sourceForms.generic.delimiterLabel"),
        delimiterComma: t("sourceForms.generic.delimiterComma"),
        delimiterSemicolon: t("sourceForms.generic.delimiterSemicolon"),
        delimiterTab: t("sourceForms.generic.delimiterTab"),
        contentLabel: t("sourceForms.generic.contentLabel"),
        readyPreview: t("sourceForms.generic.readyPreview"),
        partialPreview: t("sourceForms.generic.partialPreview"),
        idFieldLabel: t("sourceForms.generic.idFieldLabel"),
        labelFieldLabel: t("sourceForms.generic.labelFieldLabel"),
        parentFieldLabel: t("sourceForms.generic.parentFieldLabel"),
        noMapping: t("sourceForms.generic.noMapping"),
        sampleLabel: t("sourceForms.generic.sampleLabel"),
        previewHint: t("sourceForms.generic.previewHint"),
      },
    },
    hooks: {
      localDraftSaved: t("hooks.localDraftSaved"),
      serverDraftSaved: t("hooks.serverDraftSaved"),
      serverDraftConflict: t("hooks.serverDraftConflict"),
      saveDraftFallbackError: t("hooks.saveDraftFallbackError"),
      currentStepInvalid: t("hooks.currentStepInvalid"),
      moveNextFallbackError: t("hooks.moveNextFallbackError"),
      prismaSourceRequired: t("hooks.prismaSourceRequired"),
      prismaValidationFallbackError: t("hooks.prismaValidationFallbackError"),
      prismaValidationSuccess: t("hooks.prismaValidationSuccess"),
      sourceValidationFallbackError: t("hooks.sourceValidationFallbackError"),
      finishCreationFallbackError: t("hooks.finishCreationFallbackError"),
      getValidationIssueMessage: (
        issueCode:
          | RecipeStrictValidationIssueCode
          | CreationAssistantValidationIssueCode,
        values?: Record<string, string | number>,
      ) => resolveMessageCode(issueCode, values),
    },
    getStep(stepId: StepId) {
      return {
        title: t(stepPaths[stepId].title),
        description: t(stepPaths[stepId].description),
      };
    },
    getProjectProfile(profile: ProjectProfile) {
      return {
        title: t(projectProfilePaths[profile].title),
        description: t(projectProfilePaths[profile].description),
        summary: t(projectProfilePaths[profile].summary),
      };
    },
    getStartStrategy(strategy: StartStrategy) {
      return {
        title: t(startStrategyPaths[strategy].title),
        description: t(startStrategyPaths[strategy].description),
      };
    },
    getStartSourceLabel(source: StartSource) {
      return t(startSourcePaths[source]);
    },
    getTemplatePresetLabel(templatePreset: TemplatePreset) {
      return t(templatePresetPaths[templatePreset]);
    },
    getInitialView(view: InitialView) {
      return {
        label: t(initialViewPaths[view].label),
        description: t(initialViewPaths[view].description),
      };
    },
    getLayoutChoiceLabel(layout: LayoutChoice) {
      return t(layoutChoicePaths[layout]);
    },
    getDetailLevelLabel(detailLevel: DetailLevel) {
      return t(detailLevelPaths[detailLevel]);
    },
    getAutomationCopy(key: keyof AutomationToggles) {
      return {
        label: t(automationPaths[key].label),
        help: t(automationPaths[key].help),
      };
    },
    getSourceStatusLabel(sourceStatus: SourceStatus) {
      return t(sourceStatusPaths[sourceStatus]);
    },
    getStartStrategyRecommendationReason(
      reasonCode: StartStrategyRecommendationReason,
    ) {
      return t(startStrategyRecommendationReasonPaths[reasonCode]);
    },
    getLayoutWarningMessage(warningCode: LayoutNormalizationWarningCode) {
      return t(layoutWarningPaths[warningCode]);
    },
    getSourcePreviewCopy,
    getSourcePrecheckCopy,
    getSourceStatusSummary(input: {
      sourceStatus?: SourceStatus;
      precheckResult?: SourcePrecheckResult;
      sourceSelected?: boolean;
    }) {
      if (!input.sourceSelected) {
        return t("labels.sourceStatusSummary.notSelected");
      }

      if (!input.sourceStatus) {
        return t("labels.sourceStatusSummary.selected");
      }

      const base = t(sourceStatusPaths[input.sourceStatus]);

      if (!input.precheckResult) {
        return base;
      }

      const resolvedPrecheck = getSourcePrecheckCopy(input.precheckResult);
      return t("labels.sourceStatusSummary.withPrecheck", {
        status: base,
        summary: resolvedPrecheck?.summary ?? base,
      });
    },
    getRankLabel(profile: ProjectProfile, view: InitialView) {
      const rank = getViewCompatibilityRank(profile, view);

      if (rank === "primary") {
        return t("labels.viewCompatibility.primary");
      }
      if (rank === "secondary") {
        return t("labels.viewCompatibility.secondary");
      }
      if (rank === "experimental") {
        return t("labels.viewCompatibility.experimental");
      }

      return t("labels.viewCompatibility.incompatible");
    },
    buildWhatWillBeCreatedSummary(input: {
      profile: ProjectProfile;
      initialView: InitialView;
      layout: LayoutChoice;
      automation: AutomationToggles;
      sourceStatus?: SourceStatus;
    }) {
      const semanticValidation = input.automation.detectInconsistenciesEarly
        ? t("labels.summary.semanticValidationEnabled")
        : t("labels.summary.semanticValidationDisabled");
      const sourceStatusSummary = input.sourceStatus
        ? t("labels.summary.sourceStatusSentence", {
            status: t(sourceStatusPaths[input.sourceStatus]).toLowerCase(),
          })
        : "";

      return t("labels.summary.created", {
        profile: t(projectProfilePaths[input.profile].summary),
        initialView: t(initialViewPaths[input.initialView].label),
        layout: t(layoutChoicePaths[input.layout]).toLowerCase(),
        semanticValidation,
        sourceStatusSummary,
      });
    },
  };
}

export function useCreationAssistantLabels() {
  const locale = useLocale() as AppLocale;
  const messages = useMessages() as CreateMessages;

  return createCreationAssistantLabels(messages, locale);
}
