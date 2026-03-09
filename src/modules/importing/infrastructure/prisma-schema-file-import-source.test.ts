import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileSystemPrismaSchemaFileImportSource } from "./prisma-schema-file-import-source";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";

const tempDirs: string[] = [];

async function createTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mapia-importing-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ),
  );
});

describe("FileSystemPrismaSchemaFileImportSource", () => {
  it("reads a valid .prisma file as utf-8", async () => {
    const workspaceRoot = await createTempDir();
    const prismaDir = path.join(workspaceRoot, "prisma");
    await mkdir(prismaDir, { recursive: true });

    const filePath = path.join(prismaDir, "schema.prisma");
    const schemaText = "model User {\n  id String @id\n}\n";
    await writeFile(filePath, schemaText, "utf8");

    const source = new FileSystemPrismaSchemaFileImportSource();
    const result = await source.readSchemaText({
      projectId,
      filePath: "prisma/schema.prisma",
      workspaceRoot,
    });

    expect(result.sourceKind).toBe("prisma-schema-file");
    expect(result.sourceLabel.replace(/\\/g, "/")).toBe("prisma/schema.prisma");
    expect(result.schemaText).toBe(schemaText);
    expect(result.warnings).toEqual([]);
    expect(result.metadata).toMatchObject({
      fileName: "schema.prisma",
      bytes: Buffer.byteLength(schemaText, "utf8"),
    });
    expect(result.externalRefContext).toEqual({
      sourceKind: "prisma-schema-file",
      filePath: "prisma/schema.prisma",
    });
  });

  it("fails with a friendly message when the file does not exist", async () => {
    const workspaceRoot = await createTempDir();
    const source = new FileSystemPrismaSchemaFileImportSource();

    await expect(
      source.readSchemaText({
        projectId,
        filePath: "prisma/missing.prisma",
        workspaceRoot,
      }),
    ).rejects.toThrow(/nao encontrado/i);
  });

  it("rejects files that do not use the .prisma extension", async () => {
    const workspaceRoot = await createTempDir();
    const source = new FileSystemPrismaSchemaFileImportSource();

    await expect(
      source.readSchemaText({
        projectId,
        filePath: "prisma/schema.txt",
        workspaceRoot,
      }),
    ).rejects.toThrow(/extensao \.prisma/i);
  });

  it("blocks path traversal when workspaceRoot is provided", async () => {
    const workspaceRoot = await createTempDir();
    const source = new FileSystemPrismaSchemaFileImportSource();

    await expect(
      source.readSchemaText({
        projectId,
        filePath: "../outside.prisma",
        workspaceRoot,
      }),
    ).rejects.toThrow(/fora do workspace/i);
  });
});
