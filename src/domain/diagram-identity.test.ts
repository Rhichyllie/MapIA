import { describe, expect, it } from "vitest";
import {
  normalizeDiagramIdentity,
  resolveCanonicalDiagramType,
  resolveDiagramView,
} from "./diagram-identity";

describe("diagram identity", () => {
  it("normalizes legacy ERD identity into canonical type plus view", () => {
    expect(normalizeDiagramIdentity({ diagramType: "erd" })).toEqual({
      ok: true,
      diagramType: "graph",
      diagramView: "erd",
      migratedFromLegacy: true,
    });
  });

  it("defaults the view from the canonical diagram type", () => {
    expect(normalizeDiagramIdentity({ diagramType: "tree" })).toEqual({
      ok: true,
      diagramType: "tree",
      diagramView: "tree",
      migratedFromLegacy: false,
    });
  });

  it("rejects incompatible canonical type and diagram view pairs", () => {
    expect(
      normalizeDiagramIdentity({
        diagramType: "flow",
        diagramView: "erd",
      }),
    ).toEqual({
      ok: false,
      message: 'diagramView "erd" nao e compativel com diagramType "flow".',
    });
  });

  it("resolves canonical identity from a legacy flowchart alias", () => {
    expect(
      resolveCanonicalDiagramType({
        diagramType: "flowchart",
      }),
    ).toBe("flow");
    expect(
      resolveDiagramView({
        diagramType: "flowchart",
      }),
    ).toBe("flow");
  });
});
