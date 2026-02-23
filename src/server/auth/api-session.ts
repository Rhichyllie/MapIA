import { getServerSession } from "next-auth";
import { authOptions } from "@/src/server/auth/options";
import { requireSessionIdentity } from "@/src/server/auth/session";

export async function getApiSessionIdentity() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return null;
  }

  return {
    session,
    identity: requireSessionIdentity(session),
  };
}
