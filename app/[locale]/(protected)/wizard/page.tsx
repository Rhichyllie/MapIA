import { redirect } from "@/src/i18n/navigation";
import { appRoutes } from "@/src/lib/routes";

type LegacyCreationAliasPageProps = {
  params: Promise<{ locale: (typeof import("@/src/i18n/routing").routing.locales)[number] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getStringParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

// Legacy route alias preserved only to forward stale /wizard links to the
// canonical Creation Assistant entrypoint.
export default async function LegacyCreationAliasPage({
  params,
  searchParams,
}: LegacyCreationAliasPageProps) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  const projectId = getStringParam(resolvedSearchParams, "projectId");
  const query = new URLSearchParams();

  if (projectId) {
    query.set("fromProjectId", projectId);
  }

  const queryString = query.toString();

  redirect({
    href: queryString.length > 0 ? `${appRoutes.create}?${queryString}` : appRoutes.create,
    locale,
  });
}
