import { z } from "zod";
import YAML from "yaml";

export type OpenApiParseErrorCode =
  | "openapi_document_empty"
  | "openapi_document_parse_failed"
  | "openapi_document_missing_spec_marker"
  | "openapi_document_missing_version";

export type GraphQlParseErrorCode =
  | "graphql_schema_empty"
  | "graphql_schema_missing_valid_types";

const OpenApiEnvelopeSchema = z
  .object({
    openapi: z.string().optional(),
    swagger: z.string().optional(),
    info: z
      .object({
        title: z.string().optional(),
      })
      .passthrough()
      .optional(),
    paths: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (!value.openapi && !value.swagger) {
      ctx.addIssue({
        code: "custom",
        message: "openapi_document_missing_spec_marker",
      });
    }
  });

export type OpenApiParseResult =
  | {
      ok: true;
      format: "json" | "yaml";
      version: string;
      title?: string;
      pathCount: number;
    }
  | {
      ok: false;
      errorCode: OpenApiParseErrorCode;
    };

export type GraphQlParseResult =
  | {
      ok: true;
      source: "sdl" | "introspection-json";
      typeCount: number;
    }
  | {
      ok: false;
      errorCode: GraphQlParseErrorCode;
    };

function toObjectRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseAsJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseAsYaml(text: string): unknown | null {
  try {
    return YAML.parse(text);
  } catch {
    return null;
  }
}

export function parseOpenApiDocument(specText: string): OpenApiParseResult {
  const trimmed = specText.trim();

  if (!trimmed) {
    return { ok: false, errorCode: "openapi_document_empty" };
  }

  const jsonCandidate = parseAsJson(trimmed);
  const parsedDocument = jsonCandidate ?? parseAsYaml(trimmed);
  const format = jsonCandidate ? "json" : "yaml";

  if (!parsedDocument) {
    return {
      ok: false,
      errorCode: "openapi_document_parse_failed",
    };
  }

  const parsed = OpenApiEnvelopeSchema.safeParse(parsedDocument);

  if (!parsed.success) {
    return {
      ok: false,
      errorCode:
        (parsed.error.issues[0]?.message as OpenApiParseErrorCode | undefined) ??
        "openapi_document_missing_spec_marker",
    };
  }

  const version = parsed.data.openapi ?? parsed.data.swagger;
  if (!version) {
    return {
      ok: false,
      errorCode: "openapi_document_missing_version",
    };
  }

  return {
    ok: true,
    format,
    version,
    pathCount: Object.keys(parsed.data.paths ?? {}).length,
    ...(parsed.data.info?.title ? { title: parsed.data.info.title } : {}),
  };
}

export function parseGraphQlSchema(schemaText: string): GraphQlParseResult {
  const trimmed = schemaText.trim();

  if (!trimmed) {
    return { ok: false, errorCode: "graphql_schema_empty" };
  }

  const parsedJson = parseAsJson(trimmed);
  const objectRecord = toObjectRecord(parsedJson);

  if (objectRecord && "__schema" in objectRecord) {
    const schemaRecord = toObjectRecord(objectRecord.__schema);
    const types =
      schemaRecord && Array.isArray(schemaRecord.types)
        ? schemaRecord.types.length
        : 0;
    return {
      ok: true,
      source: "introspection-json",
      typeCount: types,
    };
  }

  const declarationMatches = trimmed.match(
    /\b(type|interface|enum|union|input|scalar)\s+[A-Za-z_][A-Za-z0-9_]*/g,
  );
  const typeCount = declarationMatches?.length ?? 0;

  if (typeCount === 0) {
    return {
      ok: false,
      errorCode: "graphql_schema_missing_valid_types",
    };
  }

  return {
    ok: true,
    source: "sdl",
    typeCount,
  };
}
