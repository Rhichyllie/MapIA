import { randomUUID } from "crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import type { WorkspaceRepository } from "@/src/modules/workspaces/application";
import {
  assertWorkspaceMembershipRemovalAllowed,
  assertWorkspaceMembershipTransitionAllowed,
  buildWorkspaceLegacyCompatibilityFields,
  WorkspaceMembershipSchema,
  WorkspaceMembershipWithUserSchema,
  WorkspaceSchema,
  type Workspace,
  type WorkspaceMembership,
  type WorkspaceMembershipWithUser,
  type WorkspaceRole,
} from "@/src/modules/workspaces/domain";

type WorkspaceRow = Omit<Workspace, "ownerIdentity"> & {
  ownerIdentity: string | null;
};

type WorkspaceMembershipRow = {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: Date;
  updatedAt: Date;
};

type WorkspaceMembershipWithUserRow = WorkspaceMembershipRow & {
  userEmail: string;
  userDisplayName: string | null;
  userActive: boolean;
};

function parseWorkspaceRow(row: WorkspaceRow) {
  return WorkspaceSchema.parse({
    ...row,
    ...buildWorkspaceLegacyCompatibilityFields({
      legacyOwnerIdentity: row.ownerIdentity,
    }),
  });
}

export class PrismaWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    slug: string;
    name: string;
    ownerUserId: string;
    legacyOwnerIdentity?: string;
  }): Promise<Workspace> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: {
          slug: input.slug,
          name: input.name,
          ownerIdentity: input.legacyOwnerIdentity,
        },
      });

      await tx.$executeRaw(
        Prisma.sql`
          INSERT INTO "workspace_memberships" (
            "id",
            "workspaceId",
            "userId",
            "role",
            "createdAt",
            "updatedAt"
          )
          VALUES (
            ${randomUUID()}::uuid,
            ${created.id}::uuid,
            ${input.ownerUserId}::uuid,
            'owner'::"WorkspaceRole",
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
          ON CONFLICT ("workspaceId", "userId")
          DO UPDATE SET
            "role" = 'owner'::"WorkspaceRole",
            "updatedAt" = CURRENT_TIMESTAMP
        `,
      );

      return parseWorkspaceRow(created);
    });
  }

  async findById(id: string): Promise<Workspace | null> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
    });

    return workspace ? parseWorkspaceRow(workspace) : null;
  }

  async findBySlug(slug: string): Promise<Workspace | null> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug },
    });

    return workspace ? parseWorkspaceRow(workspace) : null;
  }

  async findByUserId(userId: string): Promise<Workspace[]> {
    const rows = await this.prisma.$queryRaw<WorkspaceRow[]>(
      Prisma.sql`
        SELECT
          w."id",
          w."slug",
          w."name",
          w."ownerIdentity",
          w."createdAt",
          w."updatedAt"
        FROM "workspaces" w
        INNER JOIN "workspace_memberships" m
          ON m."workspaceId" = w."id"
        WHERE m."userId" = ${userId}::uuid
        ORDER BY
          CASE m."role"
            WHEN 'owner' THEN 0
            WHEN 'admin' THEN 1
            WHEN 'member' THEN 2
            ELSE 3
          END,
          w."createdAt" ASC
      `,
    );

    return rows.map(parseWorkspaceRow);
  }

  async findMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMembership | null> {
    const rows = await this.prisma.$queryRaw<WorkspaceMembershipRow[]>(
      Prisma.sql`
        SELECT
          "id",
          "workspaceId",
          "userId",
          "role",
          "createdAt",
          "updatedAt"
        FROM "workspace_memberships"
        WHERE "workspaceId" = ${workspaceId}::uuid
          AND "userId" = ${userId}::uuid
        LIMIT 1
      `,
    );

    return rows[0] ? WorkspaceMembershipSchema.parse(rows[0]) : null;
  }

  async listMemberships(
    workspaceId: string,
  ): Promise<WorkspaceMembershipWithUser[]> {
    const rows = await this.prisma.$queryRaw<WorkspaceMembershipWithUserRow[]>(
      Prisma.sql`
        SELECT
          m."id",
          m."workspaceId",
          m."userId",
          m."role",
          m."createdAt",
          m."updatedAt",
          u."email" AS "userEmail",
          u."displayName" AS "userDisplayName",
          u."active" AS "userActive"
        FROM "workspace_memberships" m
        INNER JOIN "app_users" u
          ON u."id" = m."userId"
        WHERE m."workspaceId" = ${workspaceId}::uuid
        ORDER BY
          CASE m."role"
            WHEN 'owner' THEN 0
            WHEN 'admin' THEN 1
            WHEN 'member' THEN 2
            ELSE 3
          END,
          lower(u."email") ASC
      `,
    );

    return rows.map((row) => WorkspaceMembershipWithUserSchema.parse(row));
  }

  async upsertMembership(input: {
    workspaceId: string;
    actorUserId: string;
    userId: string;
    role: WorkspaceRole;
  }): Promise<{
    membership: WorkspaceMembership;
    previousMembership: WorkspaceMembership | null;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const ownerRows = await tx.$queryRaw<Array<{ userId: string }>>(
        Prisma.sql`
          SELECT "userId"
          FROM "workspace_memberships"
          WHERE "workspaceId" = ${input.workspaceId}::uuid
            AND "role" = 'owner'::"WorkspaceRole"
          FOR UPDATE
        `,
      );
      const currentRows = await tx.$queryRaw<WorkspaceMembershipRow[]>(
        Prisma.sql`
          SELECT
            "id",
            "workspaceId",
            "userId",
            "role",
            "createdAt",
            "updatedAt"
          FROM "workspace_memberships"
          WHERE "workspaceId" = ${input.workspaceId}::uuid
            AND "userId" = ${input.userId}::uuid
          LIMIT 1
          FOR UPDATE
        `,
      );
      const previousMembership = currentRows[0]
        ? WorkspaceMembershipSchema.parse(currentRows[0])
        : null;

      assertWorkspaceMembershipTransitionAllowed({
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        targetUserId: input.userId,
        currentRole: previousMembership?.role ?? null,
        nextRole: input.role,
        ownerCount: ownerRows.length,
      });

      const rows = await tx.$queryRaw<WorkspaceMembershipRow[]>(
        Prisma.sql`
          INSERT INTO "workspace_memberships" (
            "id",
            "workspaceId",
            "userId",
            "role",
            "createdAt",
            "updatedAt"
          )
          VALUES (
            ${randomUUID()}::uuid,
            ${input.workspaceId}::uuid,
            ${input.userId}::uuid,
            ${input.role}::"WorkspaceRole",
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
          ON CONFLICT ("workspaceId", "userId")
          DO UPDATE SET
            "role" = EXCLUDED."role",
            "updatedAt" = CURRENT_TIMESTAMP
          RETURNING
            "id",
            "workspaceId",
            "userId",
            "role",
            "createdAt",
            "updatedAt"
        `,
      );

      return {
        membership: WorkspaceMembershipSchema.parse(rows[0]),
        previousMembership,
      };
    });
  }

  async removeMembership(input: {
    workspaceId: string;
    actorUserId: string;
    userId: string;
  }): Promise<WorkspaceMembership | null> {
    return this.prisma.$transaction(async (tx) => {
      const ownerRows = await tx.$queryRaw<Array<{ userId: string }>>(
        Prisma.sql`
          SELECT "userId"
          FROM "workspace_memberships"
          WHERE "workspaceId" = ${input.workspaceId}::uuid
            AND "role" = 'owner'::"WorkspaceRole"
          FOR UPDATE
        `,
      );
      const currentRows = await tx.$queryRaw<WorkspaceMembershipRow[]>(
        Prisma.sql`
          SELECT
            "id",
            "workspaceId",
            "userId",
            "role",
            "createdAt",
            "updatedAt"
          FROM "workspace_memberships"
          WHERE "workspaceId" = ${input.workspaceId}::uuid
            AND "userId" = ${input.userId}::uuid
          LIMIT 1
          FOR UPDATE
        `,
      );
      const currentMembership = currentRows[0]
        ? WorkspaceMembershipSchema.parse(currentRows[0])
        : null;

      if (!currentMembership) {
        return null;
      }

      assertWorkspaceMembershipRemovalAllowed({
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        targetUserId: input.userId,
        currentRole: currentMembership.role,
        ownerCount: ownerRows.length,
      });

      await tx.$executeRaw(
        Prisma.sql`
          DELETE FROM "workspace_memberships"
          WHERE "id" = ${currentMembership.id}::uuid
        `,
      );

      return currentMembership;
    });
  }
}
