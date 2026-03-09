import { describe, expect, it, vi } from "vitest";
import type { PostgresIntrospectionQueryRunner } from "./postgres-import-introspection-source";
import { InformationSchemaPostgresImportIntrospectionSource } from "./postgres-import-introspection-source";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";

function createRunnerMock() {
  const query = vi.fn();

  return {
    query,
  } as PostgresIntrospectionQueryRunner & { query: typeof query };
}

describe("InformationSchemaPostgresImportIntrospectionSource", () => {
  it("builds a minimal stable Prisma schema text from tables/columns/pk/fk", async () => {
    const runner = createRunnerMock();
    runner.query
      .mockResolvedValueOnce([
        { table_schema: "public", table_name: "users" },
        { table_schema: "public", table_name: "posts" },
      ])
      .mockResolvedValueOnce([
        {
          table_schema: "public",
          table_name: "posts",
          column_name: "id",
          ordinal_position: 1,
          is_nullable: "NO",
          data_type: "integer",
          udt_name: "int4",
          column_default: "nextval('posts_id_seq'::regclass)",
        },
        {
          table_schema: "public",
          table_name: "posts",
          column_name: "author_id",
          ordinal_position: 2,
          is_nullable: "NO",
          data_type: "integer",
          udt_name: "int4",
          column_default: null,
        },
        {
          table_schema: "public",
          table_name: "posts",
          column_name: "title",
          ordinal_position: 3,
          is_nullable: "NO",
          data_type: "text",
          udt_name: "text",
          column_default: null,
        },
        {
          table_schema: "public",
          table_name: "users",
          column_name: "id",
          ordinal_position: 1,
          is_nullable: "NO",
          data_type: "integer",
          udt_name: "int4",
          column_default: "nextval('users_id_seq'::regclass)",
        },
        {
          table_schema: "public",
          table_name: "users",
          column_name: "email",
          ordinal_position: 2,
          is_nullable: "NO",
          data_type: "text",
          udt_name: "text",
          column_default: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          table_schema: "public",
          table_name: "posts",
          column_name: "id",
          ordinal_position: 1,
        },
        {
          table_schema: "public",
          table_name: "users",
          column_name: "id",
          ordinal_position: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          constraint_name: "posts_author_id_fkey",
          table_schema: "public",
          table_name: "posts",
          column_name: "author_id",
          foreign_table_schema: "public",
          foreign_table_name: "users",
          foreign_column_name: "id",
          ordinal_position: 1,
        },
      ]);

    const source = new InformationSchemaPostgresImportIntrospectionSource(runner);
    const result = await source.introspectToPrismaSchemaText({
      projectId,
      schemas: ["public"],
    });

    expect(runner.query).toHaveBeenCalledTimes(4);
    expect(result.sourceKind).toBe("postgres-live");
    expect(result.sourceLabel).toBe("postgres:public");
    expect(result.warnings).toEqual([]);
    expect(result.metadata).toMatchObject({
      schemas: "public",
      tablesCount: 2,
      columnsCount: 5,
      foreignKeysCount: 1,
      foreignKeysIgnoredCompositeCount: 0,
      foreignKeysIgnoredDuplicatePairCount: 0,
    });
    expect(result.externalRefContext).toMatchObject({
      sourceKind: "postgres-live",
      modelsByModelName: {
        Posts: { schema: "public", table: "posts" },
        Users: { schema: "public", table: "users" },
      },
      relationsByRelationName: {
        fk_public_posts_posts_author_id_fkey: {
          schema: "public",
          table: "posts",
          column: "author_id",
          constraint: "posts_author_id_fkey",
        },
      },
    });
    expect(result.schemaText).toContain("model Posts {");
    expect(result.schemaText).toContain("id Int @id @default(autoincrement())");
    expect(result.schemaText).toContain("author_id Int");
    expect(result.schemaText).toContain(
      'author Users @relation("fk_public_posts_posts_author_id_fkey"',
    );
    expect(result.schemaText).toContain("model Users {");
  });

  it("returns warning when the selected schema has no tables", async () => {
    const runner = createRunnerMock();
    runner.query.mockResolvedValueOnce([]);

    const source = new InformationSchemaPostgresImportIntrospectionSource(runner);
    const result = await source.introspectToPrismaSchemaText({
      projectId,
      schemas: ["public"],
    });

    expect(runner.query).toHaveBeenCalledTimes(1);
    expect(result.schemaText).toBe("");
    expect(result.warnings.join(" ")).toMatch(/nenhuma tabela/i);
    expect(result.metadata).toMatchObject({
      tablesCount: 0,
      columnsCount: 0,
      foreignKeysCount: 0,
      foreignKeysIgnoredCompositeCount: 0,
      foreignKeysIgnoredDuplicatePairCount: 0,
    });
    expect(result.externalRefContext).toEqual({
      sourceKind: "postgres-live",
      modelsByModelName: {},
      relationsByRelationName: {},
    });
  });

  it("reports ignored FK counters for composite and duplicate-pair cases", async () => {
    const runner = createRunnerMock();
    runner.query
      .mockResolvedValueOnce([
        { table_schema: "public", table_name: "posts" },
        { table_schema: "public", table_name: "users" },
      ])
      .mockResolvedValueOnce([
        {
          table_schema: "public",
          table_name: "posts",
          column_name: "id",
          ordinal_position: 1,
          is_nullable: "NO",
          data_type: "integer",
          udt_name: "int4",
          column_default: null,
        },
        {
          table_schema: "public",
          table_name: "posts",
          column_name: "author_id",
          ordinal_position: 2,
          is_nullable: "NO",
          data_type: "integer",
          udt_name: "int4",
          column_default: null,
        },
        {
          table_schema: "public",
          table_name: "posts",
          column_name: "editor_id",
          ordinal_position: 3,
          is_nullable: "YES",
          data_type: "integer",
          udt_name: "int4",
          column_default: null,
        },
        {
          table_schema: "public",
          table_name: "posts",
          column_name: "tenant_id",
          ordinal_position: 4,
          is_nullable: "NO",
          data_type: "integer",
          udt_name: "int4",
          column_default: null,
        },
        {
          table_schema: "public",
          table_name: "users",
          column_name: "id",
          ordinal_position: 1,
          is_nullable: "NO",
          data_type: "integer",
          udt_name: "int4",
          column_default: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          table_schema: "public",
          table_name: "posts",
          column_name: "id",
          ordinal_position: 1,
        },
        {
          table_schema: "public",
          table_name: "users",
          column_name: "id",
          ordinal_position: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          constraint_name: "posts_author_id_fkey",
          table_schema: "public",
          table_name: "posts",
          column_name: "author_id",
          foreign_table_schema: "public",
          foreign_table_name: "users",
          foreign_column_name: "id",
          ordinal_position: 1,
        },
        {
          constraint_name: "posts_editor_id_fkey",
          table_schema: "public",
          table_name: "posts",
          column_name: "editor_id",
          foreign_table_schema: "public",
          foreign_table_name: "users",
          foreign_column_name: "id",
          ordinal_position: 1,
        },
        {
          constraint_name: "posts_tenant_fk",
          table_schema: "public",
          table_name: "posts",
          column_name: "tenant_id",
          foreign_table_schema: "public",
          foreign_table_name: "users",
          foreign_column_name: "id",
          ordinal_position: 1,
        },
        {
          constraint_name: "posts_tenant_fk",
          table_schema: "public",
          table_name: "posts",
          column_name: "id",
          foreign_table_schema: "public",
          foreign_table_name: "users",
          foreign_column_name: "id",
          ordinal_position: 2,
        },
      ]);

    const source = new InformationSchemaPostgresImportIntrospectionSource(runner);
    const result = await source.introspectToPrismaSchemaText({
      projectId,
      schemas: ["public"],
    });

    expect(result.metadata).toMatchObject({
      foreignKeysCount: 1,
      foreignKeysIgnoredCompositeCount: 1,
      foreignKeysIgnoredDuplicatePairCount: 1,
    });
    expect(result.warnings.join(" ")).toMatch(/FK composta ignorada/i);
    expect(result.warnings.join(" ")).toMatch(/FK adicional ignorada/i);
  });

  it("wraps query failures with a friendly introspection error", async () => {
    const runner = createRunnerMock();
    runner.query.mockRejectedValueOnce(new Error("relation does not exist"));

    const source = new InformationSchemaPostgresImportIntrospectionSource(runner);

    await expect(
      source.introspectToPrismaSchemaText({
        projectId,
        schemas: ["public"],
      }),
    ).rejects.toThrow(/Falha ao introspectar Postgres para importacao/i);
  });
});
