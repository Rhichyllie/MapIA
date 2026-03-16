import type { AssistantCreationSettings, AssistantDraft } from "./creation-assistant";

const sensitiveKeyPattern =
  /password|token|secret|connectionstring|apikey|api_key|bearer|authorization/i;

const REDACTED_VALUE_MASK = "***REDACTED***";

const credentialUrlPattern =
  /([a-z][a-z0-9+.-]*:\/\/)([^\/:@\s?#]+):([^\/@\s?#]+)@/gi;
const bearerPattern = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi;
const sensitiveAssignmentPattern =
  /\b(password|passwd|pwd|token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|connectionstring)\b\s*[:=]\s*([^,\s;]+)/gi;
const sensitiveQueryPattern =
  /([?&](?:password|passwd|pwd|token|secret|api[_-]?key|access_token|refresh_token)=)([^&#\s]+)/gi;
const sqlServerCredentialsPattern =
  /\b(User\s*Id|UID|Password|PWD)\s*=\s*([^;]+)/gi;
const connectionStringPrefixPattern =
  /\b(postgres(?:ql)?|mysql|sqlserver):\/\/([^\s]+)/gi;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function containsSensitiveText(input: string) {
  return redactSensitiveInlineString(input) !== input;
}

function redactSensitiveInlineString(input: string) {
  const redacted = input
    .replace(
      credentialUrlPattern,
      (_match, protocol) => `${protocol}${REDACTED_VALUE_MASK}:${REDACTED_VALUE_MASK}@`,
    )
    .replace(bearerPattern, `$1 ${REDACTED_VALUE_MASK}`)
    .replace(sensitiveAssignmentPattern, `$1=${REDACTED_VALUE_MASK}`)
    .replace(sensitiveQueryPattern, `$1${REDACTED_VALUE_MASK}`)
    .replace(sqlServerCredentialsPattern, `$1=${REDACTED_VALUE_MASK}`)
    .replace(
      connectionStringPrefixPattern,
      (match, provider, rest) => {
        const atIndex = rest.indexOf("@");
        if (atIndex === -1) {
          return match;
        }
        return `${provider}://${REDACTED_VALUE_MASK}@${rest.slice(atIndex + 1)}`;
      },
    );

  return redacted;
}

export function redactSensitiveText(input: string) {
  return redactSensitiveInlineString(input).slice(0, 500);
}

export function redactSensitiveStrings(value: unknown): unknown {
  if (typeof value === "string") {
    return redactSensitiveInlineString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveStrings(entry));
  }

  if (isPlainObject(value)) {
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      next[key] = redactSensitiveStrings(nested);
    }
    return next;
  }

  return value;
}

function redactDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => redactDeep(entry)) as T;
  }

  if (isPlainObject(value)) {
    const cloned: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(value)) {
      if (sensitiveKeyPattern.test(key)) {
        // Sensitive keys are removed entirely from persisted/returned payloads.
        continue;
      }

      if (/lasterror/i.test(key) && typeof nested === "string") {
        cloned[key] = redactSensitiveText(nested);
        continue;
      }

      cloned[key] = redactDeep(nested);
    }

    return redactSensitiveStrings(cloned) as T;
  }

  if (typeof value === "string") {
    return redactSensitiveStrings(value) as T;
  }

  return value;
}

function collectLeakedSensitivePaths(
  value: unknown,
  basePath = "",
  leaks: string[] = [],
) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectLeakedSensitivePaths(entry, `${basePath}[${index}]`, leaks),
    );
    return leaks;
  }

  if (typeof value === "string") {
    if (containsSensitiveText(value)) {
      leaks.push(basePath || "(root)");
    }
    return leaks;
  }

  if (!isPlainObject(value)) {
    return leaks;
  }

  for (const [key, nested] of Object.entries(value)) {
    const path = basePath ? `${basePath}.${key}` : key;
    if (sensitiveKeyPattern.test(key)) {
      leaks.push(path);
      continue;
    }
    collectLeakedSensitivePaths(nested, path, leaks);
  }

  return leaks;
}

export function redactSourceConfig<T>(sourceConfig: T): T {
  return redactDeep(sourceConfig);
}

export function assertNoSensitiveValues(input: {
  value: unknown;
  context: string;
}) {
  const leakedPaths = collectLeakedSensitivePaths(input.value);
  if (leakedPaths.length === 0) {
    return;
  }

  throw new Error(
    `Sensitive data leak detected in ${input.context}: ${leakedPaths.join(", ")}`,
  );
}

export function redactAssistantDraft(input: AssistantDraft): AssistantDraft {
  const redacted = redactDeep(input);
  assertNoSensitiveValues({ value: redacted, context: "assistant-draft" });
  return redacted;
}

export function redactAssistantCreationSettings(
  input: AssistantCreationSettings,
): AssistantCreationSettings {
  const redacted = redactDeep(input);
  assertNoSensitiveValues({
    value: redacted,
    context: "assistant-creation-settings",
  });
  return redacted;
}

export function getRedactedValueMask() {
  return REDACTED_VALUE_MASK;
}
