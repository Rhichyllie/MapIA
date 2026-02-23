import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { getServerEnv } from "@/src/lib/env";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const env = getServerEnv();
const isDevEnvironment = env.NODE_ENV === "development";

const devCredentialsProvider = CredentialsProvider({
  name: "Credentials",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(rawCredentials) {
    if (!isDevEnvironment) {
      // Fail closed if this provider is called outside local development.
      return null;
    }

    const parsedCredentials = credentialsSchema.safeParse(rawCredentials);

    if (!parsedCredentials.success) {
      return null;
    }

    const { email, password } = parsedCredentials.data;

    if (email !== env.DEV_LOGIN_EMAIL || password !== env.DEV_LOGIN_PASSWORD) {
      return null;
    }

    return {
      id: "dev-user",
      email: env.DEV_LOGIN_EMAIL,
      name: "MapIA Admin",
    };
  },
});

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: isDevEnvironment ? [devCredentialsProvider] : [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }

      return session;
    },
  },
  secret: env.NEXTAUTH_SECRET,
};
