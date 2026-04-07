import type { Account, NextAuthOptions, Profile } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { OAuthConfig } from "next-auth/providers/oauth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { AppError } from "@/src/lib/app-error";
import { getServerEnv } from "@/src/lib/env";
import {
  buildOidcDiscoveryUrl,
  resolveAuthRuntimeConfig,
} from "@/src/server/auth/auth-runtime";
import { syncAuthenticatedActor } from "@/src/server/auth/auth-user-store";
import { toAuthCallbackError } from "@/src/server/auth/auth-callback-error";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
const emailClaimSchema = z.string().email();
const userIdClaimSchema = z.string().uuid();
const authModeClaimSchema = z.enum(["development_credentials", "oidc"]);

type OidcProfile = Profile & {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  preferred_username?: string;
  picture?: string;
};

type MapiaInvalidJwt = JWT & {
  mapiaSessionInvalid: true;
  mapiaSessionErrorCode: string;
};

function normalizeEmailClaim(input?: string | null) {
  const normalized = input?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return emailClaimSchema.safeParse(normalized).success ? normalized : null;
}

function resolveOidcEmail(profile?: Profile, fallbackEmail?: string | null) {
  const oidcProfile = profile as OidcProfile | undefined;
  return (
    normalizeEmailClaim(oidcProfile?.email) ??
    normalizeEmailClaim(oidcProfile?.preferred_username) ??
    normalizeEmailClaim(fallbackEmail)
  );
}

function buildDevCredentialsProvider() {
  const env = getServerEnv();

  return CredentialsProvider({
    id: "credentials",
    name: "Development Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(rawCredentials) {
      const parsedCredentials = credentialsSchema.safeParse(rawCredentials);

      if (!parsedCredentials.success) {
        return null;
      }

      const { email, password } = parsedCredentials.data;
      const normalizedEmail = email.trim().toLowerCase();

      if (
        normalizedEmail !== env.DEV_LOGIN_EMAIL.trim().toLowerCase() ||
        password !== env.DEV_LOGIN_PASSWORD
      ) {
        return null;
      }

      return {
        id: normalizedEmail,
        email: normalizedEmail,
        name: "MapIA Development Admin",
      };
    },
  });
}

function buildOidcProvider(): OAuthConfig<OidcProfile> {
  const env = getServerEnv();
  const issuerUrl = env.AUTH_OIDC_ISSUER_URL;

  if (!issuerUrl) {
    throw new AppError("AUTH_OIDC_ISSUER_URL ausente para provider OIDC.", {
      code: "AUTH_CONFIGURATION_INVALID",
      status: 503,
    });
  }

  return {
    id: "oidc",
    name: env.AUTH_OIDC_PROVIDER_NAME,
    type: "oauth",
    wellKnown: buildOidcDiscoveryUrl(issuerUrl),
    authorization: {
      params: {
        scope: env.AUTH_OIDC_SCOPE,
      },
    },
    clientId: env.AUTH_OIDC_CLIENT_ID,
    clientSecret: env.AUTH_OIDC_CLIENT_SECRET,
    idToken: true,
    checks: ["pkce", "state", "nonce"],
    profile(profile: OidcProfile) {
      const normalizedEmail = resolveOidcEmail(profile);
      const subject = profile.sub?.trim();

      return {
        id: subject ?? normalizedEmail ?? "oidc-unresolved-subject",
        email: normalizedEmail,
        name:
          profile.name ??
          profile.preferred_username ??
          normalizedEmail ??
          subject ??
          "MapIA User",
        image: profile.picture,
      };
    },
  };
}

function resolveProviderType(account: Account) {
  if (account.provider === "credentials" || account.type === "credentials") {
    return "development_credentials" as const;
  }

  if (account.provider === "oidc") {
    return "oidc" as const;
  }

  return null;
}

function resolveProviderSubject(input: {
  account: Account;
  providerType: "development_credentials" | "oidc";
  profile?: Profile;
  email?: string | null;
}) {
  if (input.account.providerAccountId?.trim()) {
    return input.account.providerAccountId.trim();
  }

  if (input.providerType === "oidc") {
    const oidcProfile = input.profile as OidcProfile | undefined;
    if (oidcProfile?.sub?.trim()) {
      return oidcProfile.sub.trim();
    }

    return null;
  }

  return input.email?.trim() ?? null;
}

function isExplicitlyUnverifiedOidcEmail(profile?: Profile) {
  const oidcProfile = profile as OidcProfile | undefined;
  return oidcProfile?.email_verified === false;
}

function buildProviderList(
  runtime: ReturnType<typeof resolveAuthRuntimeConfig>,
) {
  if (runtime.mode === "development_credentials") {
    return [buildDevCredentialsProvider()];
  }

  if (runtime.mode === "oidc") {
    return [buildOidcProvider()];
  }

  return [];
}

function buildInvalidJwtToken(errorCode: string): MapiaInvalidJwt {
  return {
    mapiaSessionInvalid: true,
    mapiaSessionErrorCode: errorCode,
  };
}

function isInvalidJwtToken(token: JWT): token is MapiaInvalidJwt {
  return token.mapiaSessionInvalid === true;
}

export function getAuthOptions(): NextAuthOptions {
  const env = getServerEnv();
  const runtime = resolveAuthRuntimeConfig(env);

  return {
    session: {
      strategy: "jwt",
    },
    pages: {
      signIn: "/login",
      error: "/login",
    },
    providers: buildProviderList(runtime),
    callbacks: {
      async signIn({ user, account, profile }) {
        if (!account || runtime.mode === "misconfigured") {
          return false;
        }

        const providerType = resolveProviderType(account);

        if (!providerType) {
          return false;
        }

        if (
          (runtime.mode === "oidc" && providerType !== "oidc") ||
          (runtime.mode === "development_credentials" &&
            providerType !== "development_credentials")
        ) {
          return false;
        }

        const normalizedEmail =
          providerType === "oidc"
            ? resolveOidcEmail(profile, user.email)
            : normalizeEmailClaim(user.email);

        if (!normalizedEmail) {
          return false;
        }

        if (
          providerType === "oidc" &&
          isExplicitlyUnverifiedOidcEmail(profile)
        ) {
          return false;
        }

        const subject = resolveProviderSubject({
          account,
          providerType,
          profile,
          email: normalizedEmail,
        });

        if (!subject) {
          return false;
        }

        let actor;

        try {
          actor = await syncAuthenticatedActor({
            providerId: account.provider,
            providerType,
            subject,
            email: normalizedEmail,
            displayName: user.name,
            authMode: runtime.mode,
          });
        } catch (error) {
          throw toAuthCallbackError(error);
        }

        user.id = actor.userId;
        user.email = actor.email;
        user.name = actor.displayName ?? user.name;
        user.authProvider = actor.providerId;
        user.authMode = actor.authMode;

        return true;
      },
      async jwt({ token, user }) {
        if (user) {
          const userId = userIdClaimSchema.safeParse(user.id?.trim());
          const email = normalizeEmailClaim(user.email);
          const authProvider = user.authProvider?.trim();
          const authMode = authModeClaimSchema.safeParse(user.authMode);

          if (!userId.success || !email || !authProvider || !authMode.success) {
            throw new AppError(
              "Fluxo de autenticacao produziu claims de JWT incompletas.",
              {
                code: "AUTH_JWT_CLAIMS_MISSING",
                status: 401,
              },
            );
          }

          token.sub = userId.data;
          token.email = email;
          token.name = user.name;
          token.authProvider = authProvider;
          token.authMode = authMode.data;
          delete token.mapiaSessionInvalid;
          delete token.mapiaSessionErrorCode;
          return token;
        }

        const persistedUserId = userIdClaimSchema.safeParse(
          typeof token.sub === "string" ? token.sub.trim() : undefined,
        );
        const persistedEmail = normalizeEmailClaim(
          typeof token.email === "string" ? token.email : null,
        );
        const persistedAuthProvider =
          typeof token.authProvider === "string"
            ? token.authProvider.trim()
            : "";
        const persistedAuthMode = authModeClaimSchema.safeParse(token.authMode);

        if (
          !persistedUserId.success ||
          !persistedEmail ||
          !persistedAuthProvider ||
          !persistedAuthMode.success
        ) {
          return buildInvalidJwtToken("AUTH_JWT_CLAIMS_MISSING");
        }

        return token;
      },
      async session({ session, token }) {
        if (isInvalidJwtToken(token)) {
          return {} as never;
        }

        if (session.user) {
          const userId = userIdClaimSchema.safeParse(
            typeof token.sub === "string" ? token.sub.trim() : undefined,
          );
          const email = normalizeEmailClaim(
            typeof token.email === "string" ? token.email : null,
          );
          const authProvider =
            typeof token.authProvider === "string"
              ? token.authProvider.trim()
              : "";
          const authMode = authModeClaimSchema.safeParse(token.authMode);

          if (!userId.success || !email || !authProvider || !authMode.success) {
            return {} as never;
          }

          session.user.id = userId.data;
          session.user.email = email;
          session.user.name =
            typeof token.name === "string" ? token.name : session.user.name;
          session.user.authProvider = authProvider;
          session.user.authMode = authMode.data;
        }

        return session;
      },
    },
    secret: env.NEXTAUTH_SECRET,
  };
}
