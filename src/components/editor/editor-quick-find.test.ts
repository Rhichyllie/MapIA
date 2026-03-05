import { describe, expect, it } from "vitest";
import { filterNodeQuickFindOptions } from "./editor-quick-find";
import type { RFNode } from "./editor-graph-mappers";

const sampleNodes: RFNode[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    position: { x: 0, y: 0 },
    data: { label: "Cadastro", kind: "flow-step", payload: {}, externalRefs: [] },
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    position: { x: 20, y: 10 },
    data: { label: "Cliente", kind: "entity", payload: {}, externalRefs: [] },
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    position: { x: 40, y: 20 },
    data: { label: "Catalogo", kind: "page", payload: {}, externalRefs: [] },
  },
];

describe("editor-quick-find", () => {
  it("returns all nodes sorted when query is empty", () => {
    const options = filterNodeQuickFindOptions(sampleNodes, "", "operational");
    expect(options.map((option) => option.label)).toEqual([
      "Cadastro",
      "Catalogo",
      "Cliente",
    ]);
    expect(options[0]?.kindLabel).toBe("Etapa");
  });

  it("prioritizes prefix matches for query", () => {
    const options = filterNodeQuickFindOptions(sampleNodes, "cad", "operational");
    expect(options[0]?.label).toBe("Cadastro");
  });

  it("matches by id when query is technical", () => {
    const options = filterNodeQuickFindOptions(sampleNodes, "2222-4222", "technical");
    expect(options.map((option) => option.id)).toEqual([
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(options[0]?.kindRaw).toBe("entity");
  });
});
