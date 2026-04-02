import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type TelemetryStyle = "direct" | "fanout";

type RouteGuardrail = {
  filePath: string;
  expectedStyles: Record<string, TelemetryStyle>;
};

const ROUTE_GUARDRAILS: RouteGuardrail[] = [
  {
    filePath: "app/api/projects/create-with-assistant/route.ts",
    expectedStyles: {
      recordCreationApplyAttempted: "direct",
      recordCreationApplySucceeded: "fanout",
      recordCreationSourceStatusChanged: "fanout",
    },
  },
  {
    filePath: "app/api/projects/[projectId]/creation-draft/route.ts",
    expectedStyles: {
      recordCreationDraftSaved: "fanout",
      recordCreationSourceStatusChanged: "fanout",
    },
  },
  {
    filePath: "app/api/projects/[projectId]/creation-apply/route.ts",
    expectedStyles: {
      recordCreationApplyAttempted: "direct",
      recordCreationApplySucceeded: "fanout",
      recordCreationSourceStatusChanged: "fanout",
      recordCreationApplyBlockedStrictValidation: "direct",
    },
  },
  {
    filePath: "app/api/projects/[projectId]/creation-settings/route.ts",
    expectedStyles: {
      recordCreationSettingsAliasPut: "fanout",
      recordCreationDraftSaved: "fanout",
      recordCreationSourceStatusChanged: "fanout",
    },
  },
  {
    filePath: "app/api/projects/[projectId]/creation-settings/draft/route.ts",
    expectedStyles: {
      recordCreationDraftSaved: "fanout",
      recordCreationSourceStatusChanged: "fanout",
    },
  },
  {
    filePath:
      "app/api/projects/[projectId]/creation-settings/apply-initial-map/route.ts",
    expectedStyles: {
      recordCreationApplyAttempted: "direct",
      recordCreationApplySucceeded: "fanout",
      recordCreationSourceStatusChanged: "fanout",
      recordCreationApplyBlockedStrictValidation: "direct",
    },
  },
];

function resolveRouteAbsolutePath(relativePath: string) {
  return path.resolve(process.cwd(), relativePath);
}

function findFanoutRanges(source: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  const pattern = /runCreationTelemetryFanout\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source))) {
    const openBracketIndex = source.indexOf("[", match.index);
    if (openBracketIndex === -1) {
      continue;
    }

    let depth = 0;
    let closeBracketIndex = -1;
    for (let index = openBracketIndex; index < source.length; index += 1) {
      const char = source[index];
      if (char === "[") {
        depth += 1;
      } else if (char === "]") {
        depth -= 1;
        if (depth === 0) {
          closeBracketIndex = index;
          break;
        }
      }
    }

    if (closeBracketIndex !== -1) {
      ranges.push({ start: openBracketIndex, end: closeBracketIndex });
      pattern.lastIndex = closeBracketIndex + 1;
    }
  }

  return ranges;
}

function resolveRecorderStyles(source: string) {
  const callPattern = /\b(recordCreation[A-Za-z]+)\s*\(/g;
  const fanoutRanges = findFanoutRanges(source);
  const styles = new Map<string, Set<TelemetryStyle>>();

  let callMatch: RegExpExecArray | null;
  while ((callMatch = callPattern.exec(source))) {
    const recorderName = callMatch[1];
    const callIndex = callMatch.index;
    const style: TelemetryStyle = fanoutRanges.some(
      (range) => callIndex > range.start && callIndex < range.end,
    )
      ? "fanout"
      : "direct";

    const recorderStyles =
      styles.get(recorderName) ?? new Set<TelemetryStyle>();
    recorderStyles.add(style);
    styles.set(recorderName, recorderStyles);
  }

  return styles;
}

describe("creation assistant telemetry route guardrails", () => {
  it("does not mix direct and fanout styles for the same recorder in each route", () => {
    for (const route of ROUTE_GUARDRAILS) {
      const source = readFileSync(
        resolveRouteAbsolutePath(route.filePath),
        "utf8",
      );
      const styles = resolveRecorderStyles(source);

      for (const [recorderName, recorderStyles] of styles.entries()) {
        expect(
          recorderStyles.size,
          `${route.filePath}: ${recorderName} nao pode aparecer em caminhos direto e fanout no mesmo arquivo.`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps expected telemetry emission style per assistant route", () => {
    for (const route of ROUTE_GUARDRAILS) {
      const source = readFileSync(
        resolveRouteAbsolutePath(route.filePath),
        "utf8",
      );
      const styles = resolveRecorderStyles(source);

      for (const [recorderName, expectedStyle] of Object.entries(
        route.expectedStyles,
      )) {
        const recorderStyles = styles.get(recorderName);
        expect(
          recorderStyles?.has(expectedStyle) ?? false,
          `${route.filePath}: ${recorderName} deve permanecer no estilo ${expectedStyle}.`,
        ).toBe(true);
      }
    }
  });
});
