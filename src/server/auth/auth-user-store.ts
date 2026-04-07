import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError } from "@/src/lib/app-error";
import { prisma } from "@/src/server/db/client";
import {
  assertAuthStorageReady,
  normalizeAuthStorageError,
} from "./auth-storage-readiness";
import type { SupportedAuthRuntimeMode } from "./auth-runtime";

const AppUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  emailNormalized: z.string().email(),
  displayName: z.string().max(120).nullable(),
  active: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type AppUserRecord = z.infer<typeof AppUserSchema>;

export type AuthenticatedActor = {
  userId: string;
  email: string;
  displayName?: string;
  providerId: string;
  authMode: SupportedAuthRuntimeMode;
};

type AuthIdentityRow = {
  id: string;
  userId: string;
  providerId: string;
  providerType: "development_credentials" | "oidc";
  subject: string;
  emailAtLogin: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date | null;
};

type IdentityLookupRow = AuthIdentityRow & {
  userEmail: string;
  userEmailNormalized: string;
  userDisplayName: string | null;
  userActive: boolean;
};

function normalizeEmail(input: string) {
  return input.trim().toLowerCase();
}

function normalizeDisplayName(input?: string | null) {
  const trimmed = input?.trim();
  return trimmed ? trimmed.slice(0, 120) : null;
}

function toAuthenticatedActor(input: {
  user: AppUserRecord;
  providerId: string;
  authMode: SupportedAuthRuntimeMode;
}): AuthenticatedActor {
  return {
    userId: input.user.id,
    email: input.user.email,
    ...(input.user.displayName ? { displayName: input.user.displayName } : {}),
    providerId: input.providerId,
    authMode: input.authMode,
  };
}

async function findUserByIdTx(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<AppUserRecord | null> {
  const rows = await tx.$queryRaw<AppUserRecord[]>(
    Prisma.sql`
      SELECT
        "id",
        "email",
        "emailNormalized",
        "displayName",
        "active",
        "createdAt",
        "updatedAt"
      FROM "app_users"
      WHERE "id" = ${userId}
      LIMIT 1
    `,
  );

  return rows[0] ? AppUserSchema.parse(rows[0]) : null;
}

async function upsertUserByEmailTx(input: {
  tx: Prisma.TransactionClient;
  email: string;
  displayName?: string | null;
}) {
  const normalizedEmail = normalizeEmail(input.email);
  const displayName = normalizeDisplayName(input.displayName);
  const rows = await input.tx.$queryRaw<AppUserRecord[]>(
    Prisma.sql`
      INSERT INTO "app_users" (
        "id",
        "email",
        "emailNormalized",
        "displayName",
        "active",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${normalizedEmail},
        ${normalizedEmail},
        ${displayName},
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("emailNormalized")
      DO UPDATE SET
        "email" = EXCLUDED."email",
        "displayName" = COALESCE(EXCLUDED."displayName", "app_users"."displayName"),
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING
        "id",
        "email",
        "emailNormalized",
        "displayName",
        "active",
        "createdAt",
        "updatedAt"
    `,
  );

  return AppUserSchema.parse(rows[0]);
}

async function updateExistingUserTx(input: {
  tx: Prisma.TransactionClient;
  userId: string;
  email: string;
  displayName?: string | null;
}) {
  const normalizedEmail = normalizeEmail(input.email);
  const displayName = normalizeDisplayName(input.displayName);
  const conflictRows = await input.tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`
      SELECT "id"
      FROM "app_users"
      WHERE "emailNormalized" = ${normalizedEmail}
        AND "id" <> ${input.userId}::uuid
      LIMIT 1
    `,
  );

  if (conflictRows.length > 0) {
    throw new AppError(
      "A identidade autenticada conflita com um usuario existente no MapIA.",
      {
        code: "AUTH_EMAIL_CONFLICT",
        status: 409,
      },
    );
  }

  const rows = await input.tx.$queryRaw<AppUserRecord[]>(
    Prisma.sql`
      UPDATE "app_users"
      SET
        "email" = ${normalizedEmail},
        "emailNormalized" = ${normalizedEmail},
        "displayName" = COALESCE(${displayName}, "displayName"),
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.userId}::uuid
      RETURNING
        "id",
        "email",
        "emailNormalized",
        "displayName",
        "active",
        "createdAt",
        "updatedAt"
    `,
  );

  return AppUserSchema.parse(rows[0]);
}

export async function findAppUserById(userId: string) {
  try {
    await assertAuthStorageReady();

    const rows = await prisma.$queryRaw<AppUserRecord[]>(
      Prisma.sql`
        SELECT
          "id",
          "email",
          "emailNormalized",
          "displayName",
          "active",
          "createdAt",
          "updatedAt"
        FROM "app_users"
        WHERE "id" = ${userId}::uuid
        LIMIT 1
      `,
    );

    return rows[0] ? AppUserSchema.parse(rows[0]) : null;
  } catch (error) {
    throw normalizeAuthStorageError(error);
  }
}

export async function findActiveAppUserById(userId: string) {
  const user = await findAppUserById(userId);

  if (!user || !user.active) {
    return null;
  }

  return user;
}

export async function upsertAppUserByEmail(input: {
  email: string;
  displayName?: string | null;
}) {
  if (!input.email.trim()) {
    throw new AppError("Nao foi possivel provisionar usuario sem email.", {
      code: "AUTH_EMAIL_REQUIRED",
      status: 400,
    });
  }

  try {
    await assertAuthStorageReady();

    return prisma.$transaction((tx) =>
      upsertUserByEmailTx({
        tx,
        email: input.email,
        displayName: input.displayName,
      }),
    );
  } catch (error) {
    throw normalizeAuthStorageError(error);
  }
}

export async function syncAuthenticatedActor(input: {
  providerId: string;
  providerType: "development_credentials" | "oidc";
  subject: string;
  email: string;
  displayName?: string | null;
  authMode: SupportedAuthRuntimeMode;
}) {
  const email = normalizeEmail(input.email);
  const subject = input.subject.trim();
  const providerId = input.providerId.trim();

  if (!email) {
    throw new AppError(
      "O provedor autenticou o usuario sem um email utilizavel para o MapIA.",
      {
        code: "AUTH_EMAIL_REQUIRED",
        status: 403,
      },
    );
  }

  if (!subject) {
    throw new AppError(
      "O provedor autenticou o usuario sem um subject estavel para o MapIA.",
      {
        code: "AUTH_SUBJECT_REQUIRED",
        status: 403,
      },
    );
  }

  if (!providerId) {
    throw new AppError("A autenticacao retornou um providerId invalido.", {
      code: "AUTH_PROVIDER_INVALID",
      status: 500,
    });
  }

  try {
    await assertAuthStorageReady();

    return prisma.$transaction(async (tx) => {
      const identityRows = await tx.$queryRaw<IdentityLookupRow[]>(
        Prisma.sql`
          SELECT
            ai."id",
            ai."userId",
            ai."providerId",
            ai."providerType",
            ai."subject",
            ai."emailAtLogin",
            ai."createdAt",
            ai."updatedAt",
            ai."lastSeenAt",
            au."email" AS "userEmail",
            au."emailNormalized" AS "userEmailNormalized",
            au."displayName" AS "userDisplayName",
            au."active" AS "userActive"
          FROM "auth_identities" ai
          INNER JOIN "app_users" au ON au."id" = ai."userId"
          WHERE ai."providerId" = ${providerId}
            AND ai."subject" = ${subject}
          LIMIT 1
        `,
      );

      if (identityRows.length > 0) {
        const existingIdentity = identityRows[0];

        if (!existingIdentity.userActive) {
          throw new AppError(
            "O usuario autenticado esta desativado no MapIA.",
            {
              code: "AUTH_USER_DISABLED",
              status: 403,
            },
          );
        }

        const updatedUser = await updateExistingUserTx({
          tx,
          userId: existingIdentity.userId,
          email,
          displayName: input.displayName,
        });

        await tx.$executeRaw(
          Prisma.sql`
            UPDATE "auth_identities"
            SET
              "emailAtLogin" = ${email},
              "lastSeenAt" = CURRENT_TIMESTAMP,
              "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${existingIdentity.id}::uuid
          `,
        );

        return toAuthenticatedActor({
          user: updatedUser,
          providerId,
          authMode: input.authMode,
        });
      }

      const conflictingIdentityRows = await tx.$queryRaw<
        Array<{ id: string; userId: string; subject: string }>
      >(
        Prisma.sql`
          SELECT
            ai."id",
            ai."userId",
            ai."subject"
          FROM "auth_identities" ai
          INNER JOIN "app_users" au ON au."id" = ai."userId"
          WHERE ai."providerId" = ${providerId}
            AND ai."subject" <> ${subject}
            AND au."emailNormalized" = ${email}
          LIMIT 1
        `,
      );

      if (conflictingIdentityRows.length > 0) {
        throw new AppError(
          "A identidade externa autenticada conflita com um usuario interno ja vinculado a outro subject.",
          {
            code: "AUTH_IDENTITY_CONFLICT",
            status: 409,
          },
        );
      }

      const user = await upsertUserByEmailTx({
        tx,
        email,
        displayName: input.displayName,
      });

      const insertedIdentityRows = await tx.$queryRaw<AuthIdentityRow[]>(
        Prisma.sql`
          INSERT INTO "auth_identities" (
            "id",
            "userId",
            "providerType",
            "providerId",
            "subject",
            "emailAtLogin",
            "createdAt",
            "updatedAt",
            "lastSeenAt"
          )
          VALUES (
            ${randomUUID()}::uuid,
            ${user.id}::uuid,
            ${input.providerType}::"AuthProviderType",
            ${providerId},
            ${subject},
            ${email},
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
          ON CONFLICT ("providerId", "subject")
          DO UPDATE SET
            "emailAtLogin" = EXCLUDED."emailAtLogin",
            "lastSeenAt" = CURRENT_TIMESTAMP,
            "updatedAt" = CURRENT_TIMESTAMP
          RETURNING
            "id",
            "userId",
            "providerId",
            "providerType",
            "subject",
            "emailAtLogin",
            "createdAt",
            "updatedAt",
            "lastSeenAt"
        `,
      );

      const identity = insertedIdentityRows[0];
      const resolvedUser =
        identity.userId === user.id
          ? user
          : await findUserByIdTx(tx, identity.userId);

      if (!resolvedUser || !resolvedUser.active) {
        throw new AppError(
          "Nao foi possivel resolver o usuario autenticado do MapIA.",
          {
            code: "AUTH_USER_NOT_FOUND",
            status: 401,
          },
        );
      }

      return toAuthenticatedActor({
        user: resolvedUser,
        providerId,
        authMode: input.authMode,
      });
    });
  } catch (error) {
    throw normalizeAuthStorageError(error);
  }
}
