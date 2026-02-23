"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

function getAuthErrorMessage(errorCode: string | null) {
  if (!errorCode) return null;
  if (errorCode === "CredentialsSignin") {
    return "Credenciais invalidas. Confira email e senha de desenvolvimento.";
  }

  return "Nao foi possivel autenticar. Tente novamente.";
}

type LoginFormProps = {
  devCredentialsEnabled?: boolean;
};

type LoginFormInternalProps = {
  devCredentialsEnabled: boolean;
};

export function LoginForm({ devCredentialsEnabled = true }: LoginFormProps) {
  return <LoginFormInternal devCredentialsEnabled={devCredentialsEnabled} />;
}

function LoginFormInternal({ devCredentialsEnabled }: LoginFormInternalProps) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const errorMessage = getAuthErrorMessage(searchParams.get("error"));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("admin@mapia.local");
  const [password, setPassword] = useState("mapia123");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!devCredentialsEnabled) return;
    setIsSubmitting(true);

    await signIn("credentials", {
      email,
      password,
      callbackUrl,
    });

    setIsSubmitting(false);
  }

  return (
    <form className="stack-sm" onSubmit={handleSubmit}>
      {!devCredentialsEnabled ? (
        <div className="error-box">
          O login por credenciais de desenvolvimento esta desabilitado fora de{" "}
          <code className="mono">NODE_ENV=development</code>.
        </div>
      ) : null}
      {errorMessage ? <div className="error-box">{errorMessage}</div> : null}

      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={!devCredentialsEnabled}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={!devCredentialsEnabled}
          required
        />
      </div>

      <p className="helper">
        Credenciais padrao configuraveis via{" "}
        <code className="mono">DEV_LOGIN_EMAIL</code> e{" "}
        <code className="mono">DEV_LOGIN_PASSWORD</code>.
      </p>

      <button
        className="btn btn-primary"
        type="submit"
        disabled={isSubmitting || !devCredentialsEnabled}
      >
        {isSubmitting ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
