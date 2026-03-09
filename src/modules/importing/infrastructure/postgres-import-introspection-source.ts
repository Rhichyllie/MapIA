import type {
  ImportIntrospectionArtifact,
  IntrospectPostgresForImportInput,
  PostgresImportIntrospectionPort,
} from "@/src/modules/importing/application";
import { buildPostgresImportedRelationName } from "@/src/modules/importing/domain/external-refs";

type TableRow = {
  table_schema: string;
  table_name: string;
};

type ColumnRow = {
  table_schema: string;
  table_name: string;
  column_name: string;
  ordinal_position: number;
  is_nullable: "YES" | "NO" | string;
  data_type: string;
  udt_name: string | null;
  column_default: string | null;
};

type PrimaryKeyRow = {
  table_schema: string;
  table_name: string;
  column_name: string;
  ordinal_position: number;
};

type ForeignKeyRow = {
  constraint_name: string;
  table_schema: string;
  table_name: string;
  column_name: string;
  foreign_table_schema: string;
  foreign_table_name: string;
  foreign_column_name: string;
  ordinal_position: number;
};

type PostgresColumnField = {
  columnName: string;
  fieldName: string;
  prismaType: string;
  isList: boolean;
  isOptional: boolean;
  isId: boolean;
  attributes: string[];
  ordinalPosition: number;
};

type PostgresRelationField = {
  fieldName: string;
  targetModelName: string;
  isOptional: boolean;
  relationName: string;
  sourceFieldName: string;
  targetFieldName: string;
};

type PostgresModel = {
  tableSchema: string;
  tableName: string;
  key: string;
  modelName: string;
  columns: PostgresColumnField[];
  relations: PostgresRelationField[];
  compositePkFieldNames: string[];
};

export interface PostgresIntrospectionQueryRunner {
  query<TRow extends object>(
    sql: string,
    params?: unknown[],
  ): Promise<TRow[]>;
}

type PrismaUnsafeQueryClient = {
  $queryRawUnsafe<TResult = unknown>(
    query: string,
    ...values: unknown[]
  ): Promise<TResult>;
};

export class PrismaPostgresIntrospectionQueryRunner
  implements PostgresIntrospectionQueryRunner
{
  constructor(private readonly prismaClient: PrismaUnsafeQueryClient) {}

  async query<TRow extends object>(
    sql: string,
    params: unknown[] = [],
  ): Promise<TRow[]> {
    return await this.prismaClient.$queryRawUnsafe<TRow[]>(sql, ...params);
  }
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeDbErrorMessage(error: unknown) {
  const firstLine = toErrorMessage(error)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return "erro desconhecido";
  }

  return firstLine.slice(0, 240);
}

function normalizeSchemaList(inputSchemas?: string[]) {
  const rawSchemas = (inputSchemas?.length ? inputSchemas : ["public"])
    .map((schema) => schema.trim())
    .filter(Boolean);

  const deduped = [...new Set(rawSchemas)];

  if (deduped.length === 0) {
    return ["public"];
  }

  for (const schema of deduped) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
      throw new Error(`Schema alvo invalido: "${schema}".`);
    }
  }

  return deduped;
}

function buildInClause(
  startIndex: number,
  values: readonly unknown[],
): { clause: string; params: unknown[] } {
  if (values.length === 0) {
    return { clause: "(NULL)", params: [] };
  }

  const placeholders = values.map((_, index) => `$${startIndex + index}`).join(", ");
  return {
    clause: `(${placeholders})`,
    params: [...values],
  };
}

function toPascalCase(value: string) {
  const normalized = value
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .split(/_+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");

  const safe = normalized || "Model";
  return /^[A-Za-z_]/.test(safe) ? safe : `M${safe}`;
}

function toCamelCase(value: string) {
  const pascal = toPascalCase(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function sanitizeFieldIdentifier(value: string) {
  const normalized = value.replace(/[^A-Za-z0-9_]/g, "_");
  const collapsed = normalized.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  const safe = collapsed || "field";
  return /^[A-Za-z_]/.test(safe) ? safe : `f_${safe}`;
}

function ensureUniqueName(base: string, usedNames: Set<string>) {
  if (!usedNames.has(base)) {
    usedNames.add(base);
    return base;
  }

  let suffix = 2;

  while (usedNames.has(`${base}_${suffix}`)) {
    suffix += 1;
  }

  const unique = `${base}_${suffix}`;
  usedNames.add(unique);
  return unique;
}

function stripRelationSuffix(columnName: string) {
  const stripped = columnName
    .replace(/_id$/i, "")
    .replace(/Id$/i, "")
    .replace(/_uuid$/i, "")
    .trim();
  return stripped || columnName;
}

function mapBaseUdtToPrismaScalar(udtName: string | null, dataType: string) {
  const normalizedUdt = (udtName ?? "").toLowerCase();
  const normalizedDataType = dataType.toLowerCase();

  switch (normalizedDataType) {
    case "boolean":
      return "Boolean";
    case "smallint":
    case "integer":
      return "Int";
    case "bigint":
      return "BigInt";
    case "real":
    case "double precision":
      return "Float";
    case "numeric":
    case "decimal":
    case "money":
      return "Decimal";
    case "bytea":
      return "Bytes";
    case "json":
    case "jsonb":
      return "Json";
    case "date":
    case "timestamp without time zone":
    case "timestamp with time zone":
    case "time without time zone":
    case "time with time zone":
      return "DateTime";
    case "uuid":
    case "character varying":
    case "character":
    case "text":
    case "citext":
    case "xml":
      return "String";
    case "user-defined":
      return "String";
    default:
      break;
  }

  switch (normalizedUdt) {
    case "bool":
      return "Boolean";
    case "int2":
    case "int4":
    case "serial":
    case "serial4":
      return "Int";
    case "int8":
    case "bigserial":
    case "serial8":
      return "BigInt";
    case "float4":
    case "float8":
      return "Float";
    case "numeric":
      return "Decimal";
    case "uuid":
    case "varchar":
    case "bpchar":
    case "text":
    case "citext":
      return "String";
    case "json":
    case "jsonb":
      return "Json";
    case "date":
    case "timestamp":
    case "timestamptz":
    case "time":
    case "timetz":
      return "DateTime";
    case "bytea":
      return "Bytes";
    default:
      return "String";
  }
}

function mapColumnType(column: ColumnRow) {
  const normalizedDataType = column.data_type.toLowerCase();
  const normalizedUdt = (column.udt_name ?? "").toLowerCase();
  const isArray =
    normalizedDataType === "array" ||
    (normalizedUdt.startsWith("_") && normalizedUdt.length > 1);
  const baseUdt = isArray && normalizedUdt.startsWith("_")
    ? normalizedUdt.slice(1)
    : column.udt_name;
  const prismaType = mapBaseUdtToPrismaScalar(baseUdt, column.data_type);

  return {
    prismaType,
    isList: isArray,
    isOptional: isArray ? false : String(column.is_nullable).toUpperCase() === "YES",
  };
}

function buildModelNames(tables: TableRow[]) {
  const usedNames = new Set<string>();
  const modelNamesByKey = new Map<string, string>();
  const duplicateCounts = new Map<string, number>();

  for (const table of tables) {
    const baseName = toPascalCase(table.table_name);
    duplicateCounts.set(baseName, (duplicateCounts.get(baseName) ?? 0) + 1);
  }

  for (const table of tables) {
    const tableKey = `${table.table_schema}.${table.table_name}`;
    const baseName = toPascalCase(table.table_name);
    const needsSchemaPrefix =
      table.table_schema !== "public" || (duplicateCounts.get(baseName) ?? 0) > 1;
    const effectiveBase = needsSchemaPrefix
      ? toPascalCase(`${table.table_schema}_${table.table_name}`)
      : baseName;

    modelNamesByKey.set(tableKey, ensureUniqueName(effectiveBase, usedNames));
  }

  return modelNamesByKey;
}

function quotePrismaString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

type ForeignKeyGroup = {
  constraintName: string;
  tableSchema: string;
  tableName: string;
  rows: ForeignKeyRow[];
};

function groupForeignKeys(rows: ForeignKeyRow[]) {
  const groups = new Map<string, ForeignKeyGroup>();

  for (const row of rows) {
    const key = `${row.table_schema}.${row.table_name}.${row.constraint_name}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        constraintName: row.constraint_name,
        tableSchema: row.table_schema,
        tableName: row.table_name,
        rows: [row],
      });
      continue;
    }

    existing.rows.push(row);
  }

  return [...groups.values()].sort((a, b) => {
    const left = `${a.tableSchema}.${a.tableName}.${a.constraintName}`;
    const right = `${b.tableSchema}.${b.tableName}.${b.constraintName}`;
    return left.localeCompare(right);
  });
}

function renderPrismaSchemaText(models: PostgresModel[]) {
  return models
    .sort((a, b) => a.modelName.localeCompare(b.modelName))
    .map((model) => {
      const lines: string[] = [`model ${model.modelName} {`];

      for (const column of [...model.columns].sort(
        (a, b) => a.ordinalPosition - b.ordinalPosition,
      )) {
        const typeSuffix = column.isList ? "[]" : column.isOptional ? "?" : "";
        const attrs = column.attributes.length > 0 ? ` ${column.attributes.join(" ")}` : "";
        lines.push(`  ${column.fieldName} ${column.prismaType}${typeSuffix}${attrs}`);
      }

      for (const relation of [...model.relations].sort((a, b) =>
        a.fieldName.localeCompare(b.fieldName),
      )) {
        const optionalSuffix = relation.isOptional ? "?" : "";
        lines.push(
          `  ${relation.fieldName} ${relation.targetModelName}${optionalSuffix} @relation("${quotePrismaString(
            relation.relationName,
          )}", fields: [${relation.sourceFieldName}], references: [${relation.targetFieldName}])`,
        );
      }

      if (model.compositePkFieldNames.length > 1) {
        lines.push(`  @@id([${model.compositePkFieldNames.join(", ")}])`);
      }

      lines.push("}");
      return lines.join("\n");
    })
    .join("\n\n");
}

export class InformationSchemaPostgresImportIntrospectionSource
  implements PostgresImportIntrospectionPort
{
  constructor(private readonly queryRunner: PostgresIntrospectionQueryRunner) {}

  async introspectToPrismaSchemaText(
    input: IntrospectPostgresForImportInput,
  ): Promise<ImportIntrospectionArtifact> {
    const schemas = normalizeSchemaList(input.schemas);
    const warnings: string[] = [];

    if (input.databaseUrl) {
      warnings.push(
        "databaseUrl informado foi ignorado nesta etapa; usando a conexao Postgres atual do backend.",
      );
    }

    const schemaFilter = buildInClause(1, schemas);

    try {
      const tables = await this.queryRunner.query<TableRow>(
        `
          SELECT t.table_schema, t.table_name
          FROM information_schema.tables t
          WHERE t.table_type = 'BASE TABLE'
            AND t.table_schema IN ${schemaFilter.clause}
          ORDER BY t.table_schema, t.table_name
        `,
        schemaFilter.params,
      );

      if (tables.length === 0) {
        warnings.push(
          `Nenhuma tabela encontrada nos schemas selecionados (${schemas.join(", ")}).`,
        );

        return {
          sourceKind: "postgres-live",
          sourceLabel: `postgres:${schemas.join(",")}`,
          schemaText: "",
          warnings,
          metadata: {
            schemas: schemas.join(","),
            tablesCount: 0,
            columnsCount: 0,
            foreignKeysCount: 0,
            foreignKeysIgnoredCompositeCount: 0,
            foreignKeysIgnoredDuplicatePairCount: 0,
          },
          externalRefContext: {
            sourceKind: "postgres-live",
            modelsByModelName: {},
            relationsByRelationName: {},
          },
        };
      }

      const columns = await this.queryRunner.query<ColumnRow>(
        `
          SELECT
            c.table_schema,
            c.table_name,
            c.column_name,
            c.ordinal_position,
            c.is_nullable,
            c.data_type,
            c.udt_name,
            c.column_default
          FROM information_schema.columns c
          WHERE c.table_schema IN ${schemaFilter.clause}
          ORDER BY c.table_schema, c.table_name, c.ordinal_position
        `,
        schemaFilter.params,
      );

      const primaryKeys = await this.queryRunner.query<PrimaryKeyRow>(
        `
          SELECT
            tc.table_schema,
            tc.table_name,
            kcu.column_name,
            kcu.ordinal_position
          FROM information_schema.table_constraints tc
          INNER JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_name = tc.constraint_name
           AND kcu.table_schema = tc.table_schema
           AND kcu.table_name = tc.table_name
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema IN ${schemaFilter.clause}
          ORDER BY tc.table_schema, tc.table_name, kcu.ordinal_position
        `,
        schemaFilter.params,
      );

      const foreignKeys = await this.queryRunner.query<ForeignKeyRow>(
        `
          SELECT
            tc.constraint_name,
            tc.table_schema,
            tc.table_name,
            kcu.column_name,
            ccu.table_schema AS foreign_table_schema,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name,
            kcu.ordinal_position
          FROM information_schema.table_constraints tc
          INNER JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_name = tc.constraint_name
           AND kcu.table_schema = tc.table_schema
           AND kcu.table_name = tc.table_name
          INNER JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
           AND ccu.constraint_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema IN ${schemaFilter.clause}
          ORDER BY tc.table_schema, tc.table_name, tc.constraint_name, kcu.ordinal_position
        `,
        schemaFilter.params,
      );

      const tableKeys = new Set(
        tables.map((table) => `${table.table_schema}.${table.table_name}`),
      );
      const modelNamesByKey = buildModelNames(tables);

      const pkColumnsByTableKey = new Map<string, string[]>();
      for (const pk of primaryKeys) {
        const key = `${pk.table_schema}.${pk.table_name}`;
        const list = pkColumnsByTableKey.get(key) ?? [];
        list.push(pk.column_name);
        pkColumnsByTableKey.set(key, list);
      }

      const columnsByTableKey = new Map<string, ColumnRow[]>();
      for (const column of columns) {
        const key = `${column.table_schema}.${column.table_name}`;
        if (!tableKeys.has(key)) {
          continue;
        }

        const list = columnsByTableKey.get(key) ?? [];
        list.push(column);
        columnsByTableKey.set(key, list);
      }

      const modelsByTableKey = new Map<string, PostgresModel>();
      const columnFieldNameByTableKeyAndColumn = new Map<string, Map<string, string>>();
      const modelsByModelNameForExternalRef: Record<
        string,
        { schema: string; table: string }
      > = {};
      const relationsByRelationNameForExternalRef: Record<
        string,
        {
          schema: string;
          table: string;
          column?: string;
          constraint?: string;
        }
      > = {};

      for (const table of tables) {
        const key = `${table.table_schema}.${table.table_name}`;
        const tableColumns = [...(columnsByTableKey.get(key) ?? [])].sort(
          (a, b) => a.ordinal_position - b.ordinal_position,
        );
        const usedFieldNames = new Set<string>();
        const pkColumns = pkColumnsByTableKey.get(key) ?? [];
        const isSingleColumnPk = pkColumns.length === 1;
        const columnFieldNameMap = new Map<string, string>();
        const mappedColumns: PostgresColumnField[] = tableColumns.map((column) => {
          const mappedType = mapColumnType(column);
          const fieldName = ensureUniqueName(
            sanitizeFieldIdentifier(column.column_name),
            usedFieldNames,
          );
          columnFieldNameMap.set(column.column_name, fieldName);

          const attributes: string[] = [];
          if (isSingleColumnPk && pkColumns[0] === column.column_name) {
            attributes.push("@id");
          }
          if (String(column.column_default ?? "").toLowerCase().includes("nextval(")) {
            attributes.push("@default(autoincrement())");
          }
          if (fieldName !== column.column_name) {
            attributes.push(`@map("${quotePrismaString(column.column_name)}")`);
          }

          return {
            columnName: column.column_name,
            fieldName,
            prismaType: mappedType.prismaType,
            isList: mappedType.isList,
            isOptional: mappedType.isOptional,
            isId: isSingleColumnPk && pkColumns[0] === column.column_name,
            attributes,
            ordinalPosition: column.ordinal_position,
          };
        });

        const modelName = modelNamesByKey.get(key) ?? toPascalCase(table.table_name);

        modelsByTableKey.set(key, {
          tableSchema: table.table_schema,
          tableName: table.table_name,
          key,
          modelName,
          columns: mappedColumns,
          relations: [],
          compositePkFieldNames:
            pkColumns.length > 1
              ? pkColumns
                  .map((columnName) => columnFieldNameMap.get(columnName))
                  .filter((value): value is string => Boolean(value))
              : [],
        });
        modelsByModelNameForExternalRef[modelName] = {
          schema: table.table_schema,
          table: table.table_name,
        };
        columnFieldNameByTableKeyAndColumn.set(key, columnFieldNameMap);
      }

      const fkGroups = groupForeignKeys(
        foreignKeys.filter((row) =>
          tableKeys.has(`${row.table_schema}.${row.table_name}`),
        ),
      );
      let renderedForeignKeyRelations = 0;
      let foreignKeysIgnoredCompositeCount = 0;
      let foreignKeysIgnoredDuplicatePairCount = 0;
      const renderedRelationPairKeys = new Set<string>();

      for (const fkGroup of fkGroups) {
        const sortedRows = [...fkGroup.rows].sort(
          (a, b) => a.ordinal_position - b.ordinal_position,
        );

        if (sortedRows.length !== 1) {
          foreignKeysIgnoredCompositeCount += 1;
          warnings.push(
            `FK composta ignorada em ${fkGroup.tableSchema}.${fkGroup.tableName} (${fkGroup.constraintName}).`,
          );
          continue;
        }

        const fk = sortedRows[0];
        const sourceKey = `${fk.table_schema}.${fk.table_name}`;
        const targetKey = `${fk.foreign_table_schema}.${fk.foreign_table_name}`;

        const sourceModel = modelsByTableKey.get(sourceKey);
        const targetModel = modelsByTableKey.get(targetKey);

        if (!sourceModel || !targetModel) {
          warnings.push(
            `FK ${fk.constraint_name} ignorada: tabela de destino fora dos schemas selecionados.`,
          );
          continue;
        }

        const sourceFieldName =
          columnFieldNameByTableKeyAndColumn.get(sourceKey)?.get(fk.column_name);
        const targetFieldName =
          columnFieldNameByTableKeyAndColumn
            .get(targetKey)
            ?.get(fk.foreign_column_name);

        if (!sourceFieldName || !targetFieldName) {
          warnings.push(
            `FK ${fk.constraint_name} ignorada: colunas referenciadas nao mapeadas.`,
          );
          continue;
        }

        const sourceColumn = sourceModel.columns.find(
          (column) => column.fieldName === sourceFieldName,
        );
        const relationPairKey = `${sourceKey}->${targetKey}`;

        if (renderedRelationPairKeys.has(relationPairKey)) {
          foreignKeysIgnoredDuplicatePairCount += 1;
          // Limitacao temporaria: o grafo canonico atual nao aceita multiplas edges
          // com mesmo source+target+kind. Mantemos dedupe com warning ate evoluir a
          // normalizacao/importacao para suportar representacoes mais ricas (4B.3+).
          warnings.push(
            `FK adicional ignorada entre ${sourceKey} e ${targetKey} para evitar duplicacao de edge no grafo.`,
          );
          continue;
        }

        const relationNamesInModel = new Set(sourceModel.relations.map((r) => r.fieldName));
        const columnNamesInModel = new Set(sourceModel.columns.map((c) => c.fieldName));
        const usedFieldNamesInModel = new Set([
          ...columnNamesInModel,
          ...relationNamesInModel,
        ]);
        const relationFieldBase = sanitizeFieldIdentifier(
          toCamelCase(stripRelationSuffix(fk.column_name)),
        );
        const relationFieldName = ensureUniqueName(
          usedFieldNamesInModel.has(relationFieldBase)
            ? `${relationFieldBase}_relation`
            : relationFieldBase,
          usedFieldNamesInModel,
        );

        const relationName = buildPostgresImportedRelationName({
          schema: fk.table_schema,
          table: fk.table_name,
          constraint: fk.constraint_name,
        });

        sourceModel.relations.push({
          fieldName: relationFieldName,
          targetModelName: targetModel.modelName,
          isOptional: sourceColumn?.isOptional ?? true,
          relationName,
          sourceFieldName,
          targetFieldName,
        });
        relationsByRelationNameForExternalRef[relationName] = {
          schema: fk.table_schema,
          table: fk.table_name,
          column: fk.column_name,
          constraint: fk.constraint_name,
        };

        renderedRelationPairKeys.add(relationPairKey);
        renderedForeignKeyRelations += 1;
      }

      const models = [...modelsByTableKey.values()];
      const schemaText = renderPrismaSchemaText(models);

      return {
        sourceKind: "postgres-live",
        sourceLabel: `postgres:${schemas.join(",")}`,
        schemaText,
        warnings,
        metadata: {
          schemas: schemas.join(","),
          tablesCount: models.length,
          columnsCount: models.reduce((acc, model) => acc + model.columns.length, 0),
          foreignKeysCount: renderedForeignKeyRelations,
          foreignKeysIgnoredCompositeCount,
          foreignKeysIgnoredDuplicatePairCount,
        },
        externalRefContext: {
          sourceKind: "postgres-live",
          modelsByModelName: modelsByModelNameForExternalRef,
          relationsByRelationName: relationsByRelationNameForExternalRef,
        },
      };
    } catch (error) {
      throw new Error(
        `Falha ao introspectar Postgres para importacao (${schemas.join(", ")}): ${sanitizeDbErrorMessage(error)}`,
      );
    }
  }
}
