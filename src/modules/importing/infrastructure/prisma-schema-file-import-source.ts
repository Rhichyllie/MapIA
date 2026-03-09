import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type {
  ImportIntrospectionArtifact,
  PrismaSchemaFileImportSourcePort,
  ReadPrismaSchemaFileForImportInput,
} from "@/src/modules/importing/application";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function ensurePrismaExtension(filePath: string) {
  if (path.extname(filePath).toLowerCase() !== ".prisma") {
    throw new Error("Arquivo Prisma deve ter extensao .prisma.");
  }
}

function resolvePrismaFilePath(input: ReadPrismaSchemaFileForImportInput) {
  if (!input.workspaceRoot) {
    return {
      resolvedFilePath: path.resolve(input.filePath),
      sourceLabel: input.filePath,
    };
  }

  const resolvedWorkspaceRoot = path.resolve(input.workspaceRoot);
  const resolvedFilePath = path.resolve(resolvedWorkspaceRoot, input.filePath);
  const relativeToRoot = path.relative(resolvedWorkspaceRoot, resolvedFilePath);
  const escapedWorkspace =
    relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot);

  if (escapedWorkspace) {
    throw new Error("Caminho do arquivo Prisma fora do workspace permitido.");
  }

  const sourceLabel = relativeToRoot || path.basename(resolvedFilePath);

  return {
    resolvedFilePath,
    sourceLabel,
  };
}

export class FileSystemPrismaSchemaFileImportSource
  implements PrismaSchemaFileImportSourcePort
{
  async readSchemaText(
    input: ReadPrismaSchemaFileForImportInput,
  ): Promise<ImportIntrospectionArtifact> {
    ensurePrismaExtension(input.filePath);

    const { resolvedFilePath, sourceLabel } = resolvePrismaFilePath(input);

    let fileStat;

    try {
      fileStat = await stat(resolvedFilePath);
    } catch (error) {
      throw new Error(
        `Arquivo Prisma nao encontrado: ${sourceLabel} (${toErrorMessage(error)})`,
      );
    }

    if (!fileStat.isFile()) {
      throw new Error(`Caminho Prisma nao aponta para arquivo: ${sourceLabel}`);
    }

    let schemaText: string;

    try {
      schemaText = await readFile(resolvedFilePath, "utf8");
    } catch (error) {
      throw new Error(
        `Falha ao ler arquivo Prisma: ${sourceLabel} (${toErrorMessage(error)})`,
      );
    }

    return {
      sourceKind: "prisma-schema-file",
      sourceLabel,
      schemaText,
      warnings: [],
      metadata: {
        bytes: Buffer.byteLength(schemaText, "utf8"),
        fileName: path.basename(resolvedFilePath),
      },
      externalRefContext: {
        sourceKind: "prisma-schema-file",
        filePath: sourceLabel.replace(/\\/g, "/"),
      },
    };
  }
}
