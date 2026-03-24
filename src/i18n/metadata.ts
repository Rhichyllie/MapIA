import type { Metadata } from "next";
import { appRoutes } from "@/src/lib/routes";
import { loadMessages, type AppMessages } from "./messages";
import {
  buildLocalizedPathname,
  locales,
  type AppLocale,
} from "./routing";

type MetadataPageKey = keyof AppMessages["Metadata"]["routes"];

const metadataPageRoutes = {
  login: appRoutes.login,
  dashboard: appRoutes.dashboard,
  create: appRoutes.create,
  editor: appRoutes.editor,
} as const satisfies Record<MetadataPageKey, string>;

function buildMetadataAlternates(pathname: string, locale: AppLocale) {
  return {
    canonical: buildLocalizedPathname(pathname, locale),
    languages: Object.fromEntries(
      locales.map((availableLocale) => [
        availableLocale,
        buildLocalizedPathname(pathname, availableLocale),
      ]),
    ),
  };
}

export async function buildLocalizedLayoutMetadata(
  locale: AppLocale,
): Promise<Metadata> {
  const messages = await loadMessages(locale);

  return {
    applicationName: messages.Common.appName,
    title: {
      default: messages.Metadata.title,
      template: messages.Metadata.titleTemplate,
    },
    description: messages.Metadata.description,
  };
}

export async function buildLocalizedPageMetadata(
  locale: AppLocale,
  page: MetadataPageKey,
): Promise<Metadata> {
  const messages = await loadMessages(locale);
  const routeMetadata = messages.Metadata.routes[page];
  const pathname = metadataPageRoutes[page];

  return {
    title: routeMetadata.title,
    description: routeMetadata.description,
    alternates: buildMetadataAlternates(pathname, locale),
  };
}
