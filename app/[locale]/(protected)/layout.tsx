import { ProtectedShell } from "@/src/components/layout/protected-shell";
import { requireAuthenticatedSession } from "@/src/server/auth/session";

type ProtectedLayoutProps = {
  children: React.ReactNode;
};

export default async function ProtectedLayout({
  children,
}: ProtectedLayoutProps) {
  const { session } = await requireAuthenticatedSession();

  return <ProtectedShell session={session}>{children}</ProtectedShell>;
}
