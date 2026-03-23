import type { Session } from "next-auth";
import { getLocale } from "next-intl/server";
import { getServerSession } from "next-auth";
import { redirect } from "@/src/i18n/navigation";
import { appRoutes } from "@/src/lib/routes";
import { authOptions } from "@/src/server/auth/options";

export async function getOptionalSession() {
  return getServerSession(authOptions);
}

export async function requireSession(): Promise<Session> {
  const session = await getServerSession(authOptions);

  if (!session) {
    const locale = await getLocale();
    redirect({ href: appRoutes.login, locale });
  }

  if (!session) {
    throw new Error("Missing authenticated session after redirect.");
  }

  return session;
}

export function requireSessionIdentity(session: Session): string {
  const identity = session.user?.email;

  if (!identity) {
    throw new Error(
      "Authenticated session is missing a user identity (email).",
    );
  }

  return identity;
}
