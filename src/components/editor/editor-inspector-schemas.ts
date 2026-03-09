import { z } from "zod";
import { EdgeKindSchema, NodeKindSchema } from "@/src/domain";
import type { EditorCommand } from "@/src/modules/editor/application";

const JsonRecordSchema = z.record(z.string(), z.unknown());

function parseJsonErrorLocation(
  error: unknown,
  source: string,
): { line: number; column: number } | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const match = error.message.match(/position\s+(\d+)/i);
  if (match) {
    const position = Number.parseInt(match[1] ?? "", 10);
    if (Number.isNaN(position) || position < 0) {
      return null;
    }

    let line = 1;
    let column = 1;

    for (let index = 0; index < source.length && index < position; index += 1) {
      if (source[index] === "\n") {
        line += 1;
        column = 1;
        continue;
      }

      column += 1;
    }

    return { line, column };
  }

  const lineColumnMatch = error.message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (!lineColumnMatch) {
    return null;
  }

  const line = Number.parseInt(lineColumnMatch[1] ?? "", 10);
  const column = Number.parseInt(lineColumnMatch[2] ?? "", 10);

  if (Number.isNaN(line) || Number.isNaN(column)) {
    return null;
  }

  return { line, column };
}

function buildJsonErrorMessageWithLocation(
  location: { line: number; column: number } | null,
) {
  if (location === null) {
    return "JSON invalido. Verifique chaves, virgulas e aspas.";
  }

  return `JSON invalido na linha ${location.line}, coluna ${location.column}. Verifique chaves, virgulas e aspas.`;
}

const JsonRecordTextSchema = z
  .string()
  .transform((value, context): Record<string, unknown> => {
    const trimmed = value.trim();

    if (!trimmed) {
      return {};
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: buildJsonErrorMessageWithLocation(parseJsonErrorLocation(error, trimmed)),
      });
      return z.NEVER;
    }

    const recordParsed = JsonRecordSchema.safeParse(parsed);

    if (!recordParsed.success) {
      context.addIssue({
        code: "custom",
        message: "Dados devem ser um objeto JSON (chave/valor).",
      });
      return z.NEVER;
    }

    return recordParsed.data;
  });

export const NodeInspectorFormSchema = z.object({
  nodeId: z.string().uuid(),
  label: z
    .string()
    .trim()
    .min(1, "Rotulo e obrigatorio.")
    .max(200, "Rotulo deve ter no maximo 200 caracteres."),
  kind: NodeKindSchema,
  dataJson: z.string(),
});

export const EdgeInspectorFormSchema = z.object({
  edgeId: z.string().uuid(),
  label: z.string().trim().max(200, "Rotulo deve ter no maximo 200 caracteres."),
  kind: EdgeKindSchema,
  dataJson: z.string(),
});

const NodeInspectorCommandSchema = NodeInspectorFormSchema.extend({
  dataJson: JsonRecordTextSchema,
});

const EdgeInspectorCommandSchema = EdgeInspectorFormSchema.extend({
  dataJson: JsonRecordTextSchema,
});

export type NodeInspectorFormInput = z.input<typeof NodeInspectorFormSchema>;
export type EdgeInspectorFormInput = z.input<typeof EdgeInspectorFormSchema>;

export type NodeInspectorDraft = Pick<
  NodeInspectorFormInput,
  "label" | "kind" | "dataJson"
>;
export type EdgeInspectorDraft = Pick<
  EdgeInspectorFormInput,
  "label" | "kind" | "dataJson"
>;

export function buildUpdateNodeCommandFromInspectorForm(
  input: NodeInspectorFormInput,
): EditorCommand {
  const parsed = NodeInspectorCommandSchema.parse(input);

  return {
    type: "updateNode",
    nodeId: parsed.nodeId,
    patch: {
      label: parsed.label,
      kind: parsed.kind,
      data: parsed.dataJson,
    },
  };
}

export function buildUpdateEdgeCommandFromInspectorForm(
  input: EdgeInspectorFormInput,
): EditorCommand {
  const parsed = EdgeInspectorCommandSchema.parse(input);

  return {
    type: "updateEdge",
    edgeId: parsed.edgeId,
    patch: {
      label: parsed.label,
      kind: parsed.kind,
      data: parsed.dataJson,
    },
  };
}

export function formatInspectorJson(
  value: Record<string, unknown> | undefined | null,
): string {
  return JSON.stringify(value ?? {}, null, 2);
}
