import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/src/i18n/navigation";
import { LoginForm } from "@/src/components/auth/login-form";
import { LocaleSwitcher } from "@/src/components/i18n/locale-switcher";
import { buildLocalizedPageMetadata } from "@/src/i18n/metadata";
import type { AppLocale } from "@/src/i18n/routing";
import { appRoutes } from "@/src/lib/routes";
import { resolveAuthRuntimeConfig } from "@/src/server/auth/auth-runtime";
import { getOptionalSession } from "@/src/server/auth/session";

type LoginPageProps = {
  params: Promise<{ locale: AppLocale }>;
};

export async function generateMetadata({
  params,
}: LoginPageProps): Promise<Metadata> {
  const { locale } = await params;
  return buildLocalizedPageMetadata(locale, "login");
}

export default async function LoginPage({ params }: LoginPageProps) {
  const { locale } = await params;
  const t = await getTranslations("Auth.page");
  const session = await getOptionalSession();
  const authRuntime = resolveAuthRuntimeConfig();

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
        <LoginForm
          mode={authRuntime.mode}
          providerName={authRuntime.providerName}
        />
      </section>
    </main>
  );
}
