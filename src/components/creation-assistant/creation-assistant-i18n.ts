import { createTranslator, useLocale, useMessages } from "next-intl";
import {
  getViewCompatibilityRank,
  type AutomationToggles,
  type DetailLevel,
  type InitialView,
  type LayoutChoice,
  type ProjectProfile,
  type SourcePrecheckResult,
  type SourceStatus,
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

  return {
    defaults: {
      projectName: t("defaults.projectName"),
      rootName: t("defaults.rootName"),
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

      return t("labels.sourceStatusSummary.withPrecheck", {
        status: base,
        summary: input.precheckResult.summary,
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
