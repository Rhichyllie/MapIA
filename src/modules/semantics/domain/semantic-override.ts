export const MIN_SEMANTIC_OVERRIDE_REASON_LENGTH = 8;

export function hasMinimumSemanticOverrideReason(
  reason: string | undefined | null,
) {
  return (
    typeof reason === "string" &&
    reason.trim().length >= MIN_SEMANTIC_OVERRIDE_REASON_LENGTH
  );
}
