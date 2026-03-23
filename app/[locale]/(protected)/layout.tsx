import { ProtectedShell } from "@/src/components/layout/protected-shell";
import { requireSession } from "@/src/server/auth/session";

type ProtectedLayoutProps = {
  children: React.ReactNode;
};

export default async function ProtectedLayout({
  children,
}: ProtectedLayoutProps) {
  const session = await requireSession();

  return <ProtectedShell session={session}>{children}</ProtectedShell>;
}
