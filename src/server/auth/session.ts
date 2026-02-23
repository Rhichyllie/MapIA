import type { Session } from "next-auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/src/server/auth/options";

export async function getOptionalSession() {
  return getServerSession(authOptions);
}

export async function requireSession(): Promise<Session> {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
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
