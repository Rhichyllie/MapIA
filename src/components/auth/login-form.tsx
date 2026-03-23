"use client";

import { FormEvent, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { getPathname, useRouter } from "@/src/i18n/navigation";
import { appRoutes } from "@/src/lib/routes";

type AuthErrorKey = "credentialsSignin" | "default";

function getAuthErrorKey(errorCode: string | null): AuthErrorKey | null {
  if (!errorCode) return null;
  if (errorCode === "CredentialsSignin") {
    return "credentialsSignin";
  }

  return "default";
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
  const t = useTranslations("Auth.form");
  const errorT = useTranslations("Auth.errors");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl =
    searchParams.get("callbackUrl") ??
    getPathname({ href: appRoutes.dashboard, locale });
  const errorKey = getAuthErrorKey(searchParams.get("error"));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitErrorKey, setSubmitErrorKey] = useState<AuthErrorKey | null>(null);
  const [email, setEmail] = useState("admin@mapia.local");
  const [password, setPassword] = useState("mapia123");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!devCredentialsEnabled) return;

    setSubmitErrorKey(null);
    setIsSubmitting(true);

    const result = await signIn("credentials", {
      email,
      password,
      callbackUrl,
      redirect: false,
    });

    if (result?.error) {
      setSubmitErrorKey(getAuthErrorKey(result.error));
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    router.push(result?.url ?? callbackUrl);
    router.refresh();
  }

  return (
    <form className="stack-sm" onSubmit={handleSubmit} data-testid="login-form">
      {!devCredentialsEnabled ? (
        <div className="error-box">
          {t("disabledMessage")} <code className="mono">NODE_ENV=development</code>.
        </div>
      ) : null}
      {errorKey ? <div className="error-box">{errorT(errorKey)}</div> : null}
      {submitErrorKey ? <div className="error-box">{errorT(submitErrorKey)}</div> : null}

      <div className="field">
        <label htmlFor="email">{t("emailLabel")}</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          data-testid="login-email-input"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={!devCredentialsEnabled}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="password">{t("passwordLabel")}</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          data-testid="login-password-input"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={!devCredentialsEnabled}
          required
        />
      </div>

      <p className="helper">
        {t("credentialsHint")}{" "}
        <code className="mono">DEV_LOGIN_EMAIL</code> /{" "}
        <code className="mono">DEV_LOGIN_PASSWORD</code>.
      </p>

      <button
        className="btn btn-primary"
        type="submit"
        disabled={isSubmitting || !devCredentialsEnabled}
        data-testid="login-submit-button"
      >
        {isSubmitting ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
