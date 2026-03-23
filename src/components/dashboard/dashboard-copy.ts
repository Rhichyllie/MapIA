"use client";

import { useMemo } from "react";
import { useLocale, useMessages } from "next-intl";
import type { AppMessages } from "@/src/i18n/messages";
import type { AppLocale } from "@/src/i18n/routing";
import type {
  DashboardProject,
  InitialDiagramChoice,
  WorkspaceMode,
} from "./workspace-projects";

type DashboardMessages = AppMessages["Dashboard"];

export type DashboardCopy = {
  locale: AppLocale;
  page: DashboardMessages["page"];
  stats: DashboardMessages["stats"];
  emptyStates: DashboardMessages["emptyStates"];
  filters: DashboardMessages["filters"];
  viewMode: DashboardMessages["viewMode"];
  density: DashboardMessages["density"];
  workspaceMode: DashboardMessages["workspaceMode"];
  project: DashboardMessages["project"];
  createDrawer: DashboardMessages["createDrawer"];
  messages: DashboardMessages["messages"];
  diagramTypeOptions: Array<{
    value: InitialDiagramChoice;
    label: string;
    description: string;
  }>;
  legacyTemplateOptions: Array<{
    value: DashboardProject["template"];
    operationalLabel: string;
    technicalLabel: string;
    description: string;
  }>;
  getDiagramTypeLabel: (
    diagramType: DashboardProject["selectedDiagramType"],
  ) => string;
  getTemplateLabel: (
    template: DashboardProject["template"],
    mode: WorkspaceMode,
  ) => string;
  getTemplateDescription: (template: DashboardProject["template"]) => string;
  getSnapshotStatusLabel: (hasInitialSnapshot: boolean) => string;
  getProjectUpdatedLabel: (date: string | undefined) => string;
  getCounterLabel: (filteredCount: number, totalCount: number) => string;
  getProjectListDescription: (count: number) => string;
  getMoreActionsAriaLabel: (projectName: string) => string;
  getCopiedTechnicalIdMessage: (id: string) => string;
  getCreateSuccessMessage: (projectName: string) => string;
};

const templateValues = ["graph", "sitemap", "flowchart", "erd"] as const;

function replaceValue(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function createDashboardCopy(
  messages: DashboardMessages,
  locale: AppLocale,
): DashboardCopy {
  const templates = templateValues.map((value) => ({
    value,
    operationalLabel: messages.templates[value].operationalLabel,
    technicalLabel: messages.templates[value].technicalLabel,
    description: messages.templates[value].description,
  }));

  return {
    locale,
    page: messages.page,
    stats: messages.stats,
    emptyStates: messages.emptyStates,
    filters: messages.filters,
    viewMode: messages.viewMode,
    density: messages.density,
    workspaceMode: messages.workspaceMode,
    project: messages.project,
    createDrawer: messages.createDrawer,
    messages: messages.messages,
    diagramTypeOptions: [
      {
        value: "wizard",
        label: messages.diagramTypes.wizard.label,
        description: messages.diagramTypes.wizard.description,
      },
      {
        value: "tree",
        label: messages.diagramTypes.tree.label,
        description: messages.diagramTypes.tree.description,
      },
      {
        value: "flow",
        label: messages.diagramTypes.flow.label,
        description: messages.diagramTypes.flow.description,
      },
      {
        value: "mindmap",
        label: messages.diagramTypes.mindmap.label,
        description: messages.diagramTypes.mindmap.description,
      },
    ],
    legacyTemplateOptions: templates,
    getDiagramTypeLabel(diagramType) {
      if (diagramType === "tree") {
        return messages.diagramTypes.tree.label;
      }

      if (diagramType === "flow") {
        return messages.diagramTypes.flow.label;
      }

      if (diagramType === "mindmap") {
        return messages.diagramTypes.mindmap.label;
      }

      return messages.diagramTypes.undefined.label;
    },
    getTemplateLabel(template, mode) {
      const found = templates.find((option) => option.value === template);
      if (!found) {
        return template;
      }

      return mode === "technical" ? found.technicalLabel : found.operationalLabel;
    },
    getTemplateDescription(template) {
      return (
        templates.find((option) => option.value === template)?.description ??
        messages.templates.fallbackDescription
      );
    },
    getSnapshotStatusLabel(hasInitialSnapshot) {
      return hasInitialSnapshot
        ? messages.snapshotStatus.generated
        : messages.snapshotStatus.pending;
    },
    getProjectUpdatedLabel(dateInput) {
      if (!dateInput) {
        return messages.project.updatedFallback;
      }

      const timestamp = Date.parse(dateInput);
      if (Number.isNaN(timestamp)) {
        return messages.project.updatedFallback;
      }

      const date = new Date(timestamp).toLocaleDateString(locale);
      return replaceValue(messages.project.updatedAtLabel, { date });
    },
    getCounterLabel(filteredCount, totalCount) {
      return replaceValue(messages.filters.counterLabel, {
        filteredCount,
        totalCount,
      });
    },
    getProjectListDescription(count) {
      return replaceValue(messages.page.projectListDescription, { count });
    },
    getMoreActionsAriaLabel(projectName) {
      return replaceValue(messages.project.moreActionsAriaLabel, {
        projectName,
      });
    },
    getCopiedTechnicalIdMessage(id) {
      return replaceValue(messages.messages.copyTechnicalIdSuccess, { id });
    },
    getCreateSuccessMessage(projectName) {
      return replaceValue(messages.messages.createSuccess, { projectName });
    },
  };
}

export function useDashboardCopy() {
  const locale = useLocale() as AppLocale;
  const messages = useMessages() as AppMessages;

  return useMemo(
    () => createDashboardCopy(messages.Dashboard, locale),
    [locale, messages],
  );
}
