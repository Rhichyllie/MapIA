import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  CreateSemanticPolicyInput,
  SemanticPolicyRecord,
  SemanticPolicyRepository,
  UpdateSemanticPolicyRecordInput,
} from "@/src/modules/semantics/application";

type PrismaSemanticPolicyDelegate = PrismaClient["semanticPolicy"];

type SemanticPolicyRow =
  Awaited<ReturnType<PrismaSemanticPolicyDelegate["findUnique"]>> extends infer T
    ? T
    : never;

function parseSemanticPolicyRow(
  row: NonNullable<SemanticPolicyRow>,
): SemanticPolicyRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    diagramType: row.diagramType ?? undefined,
    strictEnabled: row.strictEnabled,
    enforceOnServer: row.enforceOnServer,
    allowTechOverride: row.allowTechOverride,
    requireOverrideReason: row.requireOverrideReason,
    customRulesJson:
      row.customRulesJson && typeof row.customRulesJson === "object"
        ? (row.customRulesJson as Record<string, unknown>)
        : undefined,
    version: row.version,
    updatedByIdentity: row.updatedByIdentity ?? undefined,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}

export class PrismaSemanticPolicyRepository implements SemanticPolicyRepository {
  constructor(private readonly delegate: PrismaSemanticPolicyDelegate) {}

  async loadByProjectId(projectId: string): Promise<SemanticPolicyRecord | null> {
    const row = await this.delegate.findUnique({
      where: { projectId },
    });

    return row ? parseSemanticPolicyRow(row) : null;
  }

  async create(input: CreateSemanticPolicyInput): Promise<SemanticPolicyRecord> {
    const row = await this.delegate.create({
      data: {
        projectId: input.projectId,
        diagramType: input.diagramType,
        strictEnabled: input.strictEnabled ?? true,
        enforceOnServer: input.enforceOnServer ?? true,
        allowTechOverride: input.allowTechOverride ?? false,
        requireOverrideReason: input.requireOverrideReason ?? true,
        customRulesJson: input.customRulesJson as Prisma.InputJsonObject | undefined,
        updatedByIdentity: input.updatedByIdentity,
      },
    });

    return parseSemanticPolicyRow(row);
  }

  async update(input: UpdateSemanticPolicyRecordInput): Promise<SemanticPolicyRecord> {
    const row = await this.delegate.update({
      where: {
        projectId: input.projectId,
      },
      data: {
        diagramType: input.diagramType,
        strictEnabled: input.strictEnabled,
        enforceOnServer: input.enforceOnServer,
        allowTechOverride: input.allowTechOverride,
        requireOverrideReason: input.requireOverrideReason,
        customRulesJson: input.customRulesJson as Prisma.InputJsonObject | undefined,
        updatedByIdentity: input.updatedByIdentity,
        version: {
          increment: 1,
        },
      },
    });

    return parseSemanticPolicyRow(row);
  }
}
