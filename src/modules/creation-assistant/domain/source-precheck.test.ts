import { describe, expect, it } from "vitest";
import { parseGraphQlSchema, parseOpenApiDocument } from "./source-precheck";

describe("source precheck parsers", () => {
  it("parses OpenAPI JSON with schema validation", () => {
    const parsed = parseOpenApiDocument(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "API Teste" },
        paths: {
          "/health": {
            get: {
              responses: {
                200: { description: "ok" },
              },
            },
          },
        },
      }),
    );

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.version).toBe("3.0.3");
      expect(parsed.pathCount).toBe(1);
      expect(parsed.title).toBe("API Teste");
    }
  });

  it("parses OpenAPI YAML with schema validation", () => {
    const parsed = parseOpenApiDocument(`
openapi: "3.1.0"
info:
  title: API YAML
paths:
  /users:
    get:
      responses:
        "200":
          description: ok
`);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.format).toBe("yaml");
      expect(parsed.pathCount).toBe(1);
    }
  });

  it("rejects invalid OpenAPI content", () => {
    const parsed = parseOpenApiDocument("not-valid: [");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errorCode).toBe("openapi_document_parse_failed");
    }
  });

  it("parses GraphQL SDL and introspection JSON", () => {
    const sdl = parseGraphQlSchema("type Query { health: String }");
    expect(sdl.ok).toBe(true);

    const introspection = parseGraphQlSchema(
      JSON.stringify({
        __schema: {
          types: [{ name: "Query" }, { name: "User" }],
        },
      }),
    );
    expect(introspection.ok).toBe(true);
    if (introspection.ok) {
      expect(introspection.source).toBe("introspection-json");
      expect(introspection.typeCount).toBe(2);
    }
  });

  it("returns canonical GraphQL parse codes for invalid input", () => {
    const parsed = parseGraphQlSchema("query");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errorCode).toBe("graphql_schema_missing_valid_types");
    }
  });
});
