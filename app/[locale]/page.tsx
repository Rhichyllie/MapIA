import { redirect } from "@/src/i18n/navigation";
import { appRoutes } from "@/src/lib/routes";
import { getOptionalSession } from "@/src/server/auth/session";

type HomePageProps = {
  params: Promise<{ locale: (typeof import("@/src/i18n/routing").routing.locales)[number] }>;
};

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  const session = await getOptionalSession();

  redirect({
    href: session ? appRoutes.dashboard : appRoutes.login,
    locale,
  });
}
