"use client";

import { useLocale, useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import { getPathname } from "@/src/i18n/navigation";
import { appRoutes } from "@/src/lib/routes";

export function SignOutButton() {
  const t = useTranslations("Auth");
  const locale = useLocale();

  return (
    <button
      className="btn btn-danger"
      type="button"
      onClick={() =>
        signOut({
          callbackUrl: getPathname({ href: appRoutes.login, locale }),
        })
      }
    >
      {t("signOut")}
    </button>
  );
}
