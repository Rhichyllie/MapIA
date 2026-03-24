import { getTranslations } from "next-intl/server";
import { redirect } from "@/src/i18n/navigation";
import { LoginForm } from "@/src/components/auth/login-form";
import { LocaleSwitcher } from "@/src/components/i18n/locale-switcher";
import { appRoutes } from "@/src/lib/routes";
import { getServerEnv } from "@/src/lib/env";
import { getOptionalSession } from "@/src/server/auth/session";

type LoginPageProps = {
  params: Promise<{ locale: (typeof import("@/src/i18n/routing").routing.locales)[number] }>;
};

export default async function LoginPage({ params }: LoginPageProps) {
  const { locale } = await params;
  const t = await getTranslations("Auth.page");
  const session = await getOptionalSession();
  const env = getServerEnv();
  const devCredentialsEnabled = env.NODE_ENV === "development";

  if (session) {
    redirect({ href: appRoutes.dashboard, locale });
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div className="row-actions row-actions-between login-card-header">
          <span className="badge">
            <span className="badge-dot" aria-hidden="true" />
            {t("badge")}
          </span>
          <LocaleSwitcher showLabel variant="panel" />
        </div>
        <div className="stack-sm">
          <h1 id="login-title">{t("title")}</h1>
          <p className="helper">{t("description")}</p>
        </div>
        <LoginForm devCredentialsEnabled={devCredentialsEnabled} />
      </section>
    </main>
  );
}
