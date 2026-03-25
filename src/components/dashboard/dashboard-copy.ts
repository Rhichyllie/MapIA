"use client";

import { useMemo } from "react";
import { useLocale, useMessages } from "next-intl";
import type { AppMessages } from "@/src/i18n/messages";
import type { AppLocale } from "@/src/i18n/routing";
import type {
  DashboardProject,
  WorkspaceMode,
} from "./workspace-projects";

type DashboardMessages = AppMessages["Dashboard"];

export type DashboardCopy = {
  locale: AppLocale;
  page: DashboardMessages["page"];
  stats: DashboardMessages["stats"];
  emptyStates: DashboardMessages["emptyStates"];
  filters: DashboardMessages["filters"];
  collection: DashboardMessages["collection"];
  viewMode: DashboardMessages["viewMode"];
  density: DashboardMessages["density"];
  workspaceMode: DashboardMessages["workspaceMode"];
  project: DashboardMessages["project"];
  messages: DashboardMessages["messages"];
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
  getProjectStatusMeta: (hasInitialSnapshot: boolean) => {
    label: string;
    hint: string;
  };
  getProjectUpdatedLabel: (date: string | undefined) => string;
  getProjectUpdatedMeta: (date: string | undefined) => {
    label: string;
    hint: string;
  };
  getCounterLabel: (filteredCount: number, totalCount: number) => string;
  getProjectListDescription: (count: number) => string;
  getCollectionSummaryLabel: (input: {
    total: number;
    generated: number;
    pending: number;
  }) => string;
  getCollectionRangeLabel: (
    rangeStart: number,
    rangeEnd: number,
    totalCount: number,
  ) => string;
  getCollectionPageLabel: (currentPage: number, pageCount: number) => string;
  getCollectionPageButtonAriaLabel: (page: number) => string;
  getActiveRefinementsLabel: (count: number) => string;
  getMoreActionsAriaLabel: (projectName: string) => string;
  getCopiedTechnicalIdMessage: (id: string) => string;
};

const templateValues = ["graph", "sitemap", "flowchart", "erd"] as const;

function replaceValue(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function formatProjectDate(locale: AppLocale, timestamp: number) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
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
    collection: messages.collection,
    viewMode: messages.viewMode,
    density: messages.density,
    workspaceMode: messages.workspaceMode,
    project: messages.project,
    messages: messages.messages,
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
        ? messages.project.statusReady
        : messages.project.statusPending;
    },
    getProjectStatusMeta(hasInitialSnapshot) {
      return hasInitialSnapshot
        ? {
            label: messages.project.statusReady,
            hint: messages.project.statusReadyHint,
          }
        : {
            label: messages.project.statusPending,
            hint: messages.project.statusPendingHint,
          };
    },
    getProjectUpdatedLabel(dateInput) {
      if (!dateInput) {
        return messages.project.updatedFallback;
      }

      const timestamp = Date.parse(dateInput);
      if (Number.isNaN(timestamp)) {
        return messages.project.updatedFallback;
      }

      return formatProjectDate(locale, timestamp);
    },
    getProjectUpdatedMeta(dateInput) {
      if (!dateInput) {
        return {
          label: messages.project.updatedFallback,
          hint: messages.project.updatedUnknownHint,
        };
      }

      const timestamp = Date.parse(dateInput);
      if (Number.isNaN(timestamp)) {
        return {
          label: messages.project.updatedFallback,
          hint: messages.project.updatedUnknownHint,
        };
      }

      return {
        label: formatProjectDate(locale, timestamp),
        hint: messages.project.updatedHint,
      };
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
    getCollectionSummaryLabel(input) {
      return replaceValue(messages.collection.summaryLabel, input);
    },
    getCollectionRangeLabel(rangeStart, rangeEnd, totalCount) {
      return replaceValue(messages.collection.rangeLabel, {
        rangeStart,
        rangeEnd,
        totalCount,
      });
    },
    getCollectionPageLabel(currentPage, pageCount) {
      return replaceValue(messages.collection.pageLabel, {
        currentPage,
        pageCount,
      });
    },
    getCollectionPageButtonAriaLabel(page) {
      return replaceValue(messages.collection.pageButtonAriaLabel, {
        page,
      });
    },
    getActiveRefinementsLabel(count) {
      return replaceValue(messages.filters.activeRefinementsLabel, { count });
    },
    getMoreActionsAriaLabel(projectName) {
      return replaceValue(messages.project.moreActionsAriaLabel, {
        projectName,
      });
    },
    getCopiedTechnicalIdMessage(id) {
      return replaceValue(messages.messages.copyTechnicalIdSuccess, { id });
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
