import { describe, expect, it } from "vitest";
import {
  compareCatalogIntegrity,
  expectedCatalogPaths,
  expectedCatalogNamespaces,
  getAllCatalogIntegrityDiffs,
  messageCatalogs,
} from "./catalog-integrity";

describe("catalog integrity", () => {
  it("keeps every locale structurally aligned with the base catalog", () => {
    const diffs = getAllCatalogIntegrityDiffs();

    expect(diffs).toEqual(
      diffs.map((diff) => ({
        locale: diff.locale,
        missingKeys: [],
        extraKeys: [],
        typeMismatches: [],
        missingNamespaces: [],
        missingRequiredPaths: [],
      })),
    );
  });

  it("covers the expected top-level namespaces for every locale", () => {
    for (const [locale, catalog] of Object.entries(messageCatalogs)) {
      expect(Object.keys(catalog).sort()).toEqual(
        expect.arrayContaining([...expectedCatalogNamespaces]),
      );
      expect(catalog.Editor).toBeTruthy();
      expect(catalog.Create).toBeTruthy();
      expect(locale).toMatch(/pt-BR|en-US/);
      expect(expectedCatalogPaths.every((path) => {
        const value = path.split(".").reduce<unknown>((current, segment) => {
          if (!current || typeof current !== "object" || Array.isArray(current)) {
            return undefined;
          }

          return (current as Record<string, unknown>)[segment];
        }, catalog);

        return value !== undefined;
      })).toBe(true);
    }
  });

  it("detects missing, extra and type-mismatched keys in candidate catalogs", () => {
    const diff = compareCatalogIntegrity(
      {
        Metadata: { title: "MapIA" },
        Editor: {
          shell: {
            applyChanges: "Apply changes",
          },
        },
      },
      {
        Metadata: "invalid",
        Editor: {
          shell: {
            revert: "Revert",
          },
        },
      },
      "en-US",
    );

    expect(diff.missingKeys).toContain("Editor.shell.applyChanges");
    expect(diff.extraKeys).toContain("Editor.shell.revert");
    expect(diff.typeMismatches).toContain("Metadata");
    expect(diff.missingNamespaces).toContain("Common");
    expect(diff.missingRequiredPaths).toContain(
      "Create.labels.sourcePreviewSummary",
    );
    expect(diff.missingRequiredPaths).toContain("Editor.presentation");
  });
});
