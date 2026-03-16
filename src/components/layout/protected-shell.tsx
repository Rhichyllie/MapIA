import type { Session } from "next-auth";
import { SignOutButton } from "@/src/components/auth/sign-out-button";
import { NavLink } from "@/src/components/layout/nav-link";
import { ThemeToggle } from "@/src/components/ui/theme-toggle";

type ProtectedShellProps = {
  children: React.ReactNode;
  session: Session;
};

export function ProtectedShell({ children, session }: ProtectedShellProps) {
  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand" aria-label="MapIA">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>MapIA</h1>
            <p>Arquitetura da informacao e diagramas</p>
          </div>
        </div>
        <div className="row-actions">
          <ThemeToggle />
          <span className="badge" aria-label="Usuario autenticado">
            <span className="badge-dot" aria-hidden="true" />
            {session.user?.email ?? "Usuario"}
          </span>
          <SignOutButton />
        </div>
      </header>

      <div className="shell-body">
        <aside className="side-nav" aria-label="Navegacao principal">
          <ul className="nav-list">
            <li>
              <NavLink href="/dashboard" label="Area de trabalho" />
            </li>
            <li>
              <NavLink href="/create" label="Assistente de criacao" />
            </li>
            <li>
              <NavLink href="/editor" label="Editor" />
            </li>
          </ul>
        </aside>

        <main className="content-panel">{children}</main>
      </div>
    </div>
  );
}
