import { redirect } from "next/navigation";
import { LoginForm } from "@/src/components/auth/login-form";
import { getServerEnv } from "@/src/lib/env";
import { getOptionalSession } from "@/src/server/auth/session";

export default async function LoginPage() {
  const session = await getOptionalSession();
  const env = getServerEnv();
  const devCredentialsEnabled = env.NODE_ENV === "development";

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div className="stack-sm">
          <span className="badge">
            <span className="badge-dot" aria-hidden="true" />
            Fase 0 / Bootstrap
          </span>
          <h1 id="login-title">Entrar no MapIA</h1>
          <p className="helper">
            Auth atual usa credenciais de desenvolvimento para bootstrap local.
            Em producao este provider fica desabilitado.
          </p>
        </div>
        <LoginForm devCredentialsEnabled={devCredentialsEnabled} />
      </section>
    </main>
  );
}
