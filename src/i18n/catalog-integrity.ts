import enUSMessages from "@/messages/en-US.json";
import ptBRMessages from "@/messages/pt-BR.json";
import { routing, type AppLocale } from "./routing";

export type MessageCatalog = Record<string, unknown>;

export type CatalogIntegrityDiff = {
  locale: AppLocale;
  missingKeys: string[];
  extraKeys: string[];
  typeMismatches: string[];
  missingNamespaces: string[];
  missingRequiredPaths: string[];
};

export const expectedCatalogNamespaces = [
  "Metadata",
  "Common",
  "Auth",
  "Shell",
  "Dashboard",
  "Create",
  "Editor",
] as const;

export const expectedCatalogPaths = [
  "Metadata.titleTemplate",
  "Metadata.routes.login",
  "Metadata.routes.dashboard",
  "Metadata.routes.create",
  "Metadata.routes.editor",
  "Common.localeSwitcher",
  "Common.localeSwitcher.options",
  "Create.defaults.hierarchyRootName",
  "Create.labels.strictValidationIssues",
  "Create.labels.sourceStatusSummary",
  "Create.labels.sourcePreviewSummary",
  "Create.labels.sourcePreviewDetails",
  "Create.labels.sourceLifecycleSummary",
  "Create.labels.validationIssues",
  "Editor.shell",
  "Editor.shell.quickAdd.copy",
  "Editor.presentation",
  "Editor.process",
  "Editor.process.connectivity",
  "Editor.process.nodeKinds",
  "Editor.process.edgeKinds",
  "Editor.process.quickActions",
  "Editor.process.quickAddRoles",
  "Editor.process.roles",
  "Editor.process.inspector",
  "Editor.graph",
  "Editor.renderers",
] as const;

export const messageCatalogs = {
  "pt-BR": ptBRMessages,
  "en-US": enUSMessages,
} as const satisfies Record<AppLocale, MessageCatalog>;

function isMessageCatalog(value: unknown): value is MessageCatalog {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasCatalogPath(catalog: MessageCatalog, path: string) {
  const value = path.split(".").reduce<unknown>((current, segment) => {
    if (!isMessageCatalog(current)) {
      return undefined;
    }

    return current[segment];
  }, catalog);

  return value !== undefined;
}

function compareCatalogNodes(
  base: unknown,
  candidate: unknown,
  path: string,
  diff: Omit<
    CatalogIntegrityDiff,
    "locale" | "missingNamespaces" | "missingRequiredPaths"
  >,
) {
  const baseIsCatalog = isMessageCatalog(base);
  const candidateIsCatalog = isMessageCatalog(candidate);
  const baseIsArray = Array.isArray(base);
  const candidateIsArray = Array.isArray(candidate);

  if (baseIsArray && candidateIsArray) {
    for (let index = 0; index < base.length; index += 1) {
      const nextPath = path ? `${path}.${index}` : String(index);

      if (index >= candidate.length) {
        diff.missingKeys.push(nextPath);
        continue;
      }

      compareCatalogNodes(base[index], candidate[index], nextPath, diff);
    }

    for (let index = base.length; index < candidate.length; index += 1) {
      diff.extraKeys.push(path ? `${path}.${index}` : String(index));
    }

    return;
  }

  if (baseIsArray !== candidateIsArray) {
    diff.typeMismatches.push(path);
    return;
  }

  if (baseIsCatalog && candidateIsCatalog) {
    const baseKeys = Object.keys(base);
    const candidateKeys = Object.keys(candidate);

    for (const key of baseKeys) {
      const nextPath = path ? `${path}.${key}` : key;
      if (!(key in candidate)) {
        diff.missingKeys.push(nextPath);
        continue;
      }

      compareCatalogNodes(base[key], candidate[key], nextPath, diff);
    }

    for (const key of candidateKeys) {
      if (!(key in base)) {
        diff.extraKeys.push(path ? `${path}.${key}` : key);
      }
    }

    return;
  }

  if (baseIsCatalog !== candidateIsCatalog) {
    diff.typeMismatches.push(path);
    return;
  }

  if (typeof base !== typeof candidate) {
    diff.typeMismatches.push(path);
  }
}

export function compareCatalogIntegrity(
  baseCatalog: MessageCatalog,
  candidateCatalog: MessageCatalog,
  locale: AppLocale,
): CatalogIntegrityDiff {
  const diff = {
    missingKeys: [] as string[],
    extraKeys: [] as string[],
    typeMismatches: [] as string[],
  };

  compareCatalogNodes(baseCatalog, candidateCatalog, "", diff);

  return {
    locale,
    ...diff,
    missingNamespaces: expectedCatalogNamespaces.filter(
      (namespace) => !isMessageCatalog(candidateCatalog[namespace]),
    ),
    missingRequiredPaths: expectedCatalogPaths.filter(
      (path) => !hasCatalogPath(candidateCatalog, path),
    ),
  };
}

export function getCatalogIntegrityDiff(locale: AppLocale): CatalogIntegrityDiff {
  return compareCatalogIntegrity(
    messageCatalogs[routing.defaultLocale],
    messageCatalogs[locale],
    locale,
  );
}

export function getAllCatalogIntegrityDiffs() {
  return routing.locales.map((locale) => getCatalogIntegrityDiff(locale));
}
