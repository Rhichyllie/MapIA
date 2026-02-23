import { redirect } from "next/navigation";
import { getOptionalSession } from "@/src/server/auth/session";

export default async function HomePage() {
  const session = await getOptionalSession();

  redirect(session ? "/dashboard" : "/login");
}
