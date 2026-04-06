"use client";

import { FormEvent, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { getPathname } from "@/src/i18n/navigation";
import { appRoutes } from "@/src/lib/routes";
import { resolvePostLoginNavigationTarget } from "./login-navigation";

type AuthErrorKey = "credentialsSignin" | "default";
type LoginMode = "development_credentials" | "oidc" | "misconfigured";

function getAuthErrorKey(errorCode: string | null): AuthErrorKey | null {
  if (!errorCode) return null;
  if (errorCode === "CredentialsSignin") {
    return "credentialsSignin";
  }

  return "default";
}

type LoginFormProps = {
  mode: LoginMode;
  providerName?: string;
};

export function LoginForm({
  mode,
  providerName = "Single Sign-On",
}: LoginFormProps) {
  const t = useTranslations("Auth.form");
  const errorT = useTranslations("Auth.errors");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const callbackUrl =
    searchParams.get("callbackUrl") ??
    getPathname({ href: appRoutes.dashboard, locale });
  const errorKey = getAuthErrorKey(searchParams.get("error"));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitErrorKey, setSubmitErrorKey] = useState<AuthErrorKey | null>(null);
  const [email, setEmail] = useState("admin@mapia.local");
  const [password, setPassword] = useState("mapia123");

  async function handleDevelopmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode !== "development_credentials") {
      return;
    }

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
    const nextTarget = resolvePostLoginNavigationTarget({
      callbackUrl,
      resultUrl: result?.url,
      currentOrigin: window.location.origin,
    });

    window.location.assign(nextTarget);
  }

  async function handleOidcSubmit() {
    if (mode !== "oidc") {
      return;
    }

    setSubmitErrorKey(null);
    setIsSubmitting(true);
    await signIn("oidc", {
      callbackUrl,
    });
    setIsSubmitting(false);
  }

  if (mode === "misconfigured") {
    return (
      <div className="stack-sm" data-testid="login-form">
        <div className="error-box">{t("configurationMessage")}</div>
      </div>
    );
  }

  if (mode === "oidc") {
    return (
      <div className="stack-sm" data-testid="login-form">
        {errorKey ? <div className="error-box">{errorT(errorKey)}</div> : null}
        {submitErrorKey ? (
          <div className="error-box">{errorT(submitErrorKey)}</div>
        ) : null}
        <p className="helper">{t("oidcHint", { providerName })}</p>
        <button
          className="btn btn-primary"
          type="button"
          disabled={isSubmitting}
          data-testid="login-submit-button"
          onClick={handleOidcSubmit}
        >
          {isSubmitting
            ? t("oidcSubmitting")
            : t("oidcSubmit", { providerName })}
        </button>
      </div>
    );
  }

  return (
    <form
      className="stack-sm"
      onSubmit={handleDevelopmentSubmit}
      data-testid="login-form"
    >
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
          required
        />
      </div>

      <p className="helper">
        {t("credentialsHint")} <code className="mono">DEV_LOGIN_EMAIL</code> /{" "}
        <code className="mono">DEV_LOGIN_PASSWORD</code>.
      </p>

      <button
        className="btn btn-primary"
        type="submit"
        disabled={isSubmitting}
        data-testid="login-submit-button"
      >
        {isSubmitting ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
