import type { Session } from "next-auth";
import { getTranslations } from "next-intl/server";
import { SignOutButton } from "@/src/components/auth/sign-out-button";
import { LocaleSwitcher } from "@/src/components/i18n/locale-switcher";
import { NavLink } from "@/src/components/layout/nav-link";
import { ThemeToggle } from "@/src/components/ui/theme-toggle";

type ProtectedShellProps = {
  children: React.ReactNode;
  session: Session;
};

export async function ProtectedShell({
  children,
  session,
}: ProtectedShellProps) {
  const t = await getTranslations("Shell");
  const commonT = await getTranslations("Common");

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand" aria-label={commonT("appName")}>
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>{commonT("appName")}</h1>
            <p>{t("brand.subtitle")}</p>
          </div>
        </div>
        <div className="top-bar-actions">
          <LocaleSwitcher />
          <ThemeToggle />
          <span className="badge" aria-label={t("authenticatedUser")}>
            <span className="badge-dot" aria-hidden="true" />
            {session.user?.email ?? commonT("userFallback")}
          </span>
          <SignOutButton />
        </div>
      </header>

      <div className="shell-body">
        <aside className="side-nav" aria-label={t("navigation.ariaLabel")}>
          <ul className="nav-list">
            <li>
              <NavLink href="/dashboard" label={t("navigation.dashboard")} />
            </li>
            <li>
              <NavLink href="/create" label={t("navigation.create")} />
            </li>
            <li>
              <NavLink href="/editor" label={t("navigation.editor")} />
            </li>
          </ul>
        </aside>

        <main className="content-panel">{children}</main>
      </div>
    </div>
  );
}
