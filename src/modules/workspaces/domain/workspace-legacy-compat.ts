import type { Workspace } from "./workspace";

// Boundary helper for the deprecated workspaces.ownerIdentity column.
// This value remains only for compatibility and must never drive authorization.
export function buildWorkspaceLegacyCompatibilityFields(input: {
  legacyOwnerIdentity?: string | null;
}) {
  const legacyOwnerIdentity = input.legacyOwnerIdentity?.trim();

  if (!legacyOwnerIdentity) {
    return {};
  }

  return {
    ownerIdentity: legacyOwnerIdentity,
  };
}

export function getWorkspaceLegacyOwnerIdentity(
  workspace: Pick<Workspace, "ownerIdentity">,
) {
  return workspace.ownerIdentity ?? null;
}
