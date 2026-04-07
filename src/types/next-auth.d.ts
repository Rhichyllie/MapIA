import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      authProvider: string;
      authMode: "development_credentials" | "oidc";
    };
  }

  interface User {
    authProvider?: string;
    authMode?: "development_credentials" | "oidc";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    authProvider?: string;
    authMode?: "development_credentials" | "oidc";
    mapiaSessionInvalid?: boolean;
    mapiaSessionErrorCode?: string;
  }
}
