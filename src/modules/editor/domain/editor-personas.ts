import type { EdgeKind, NodeKind } from "@/src/domain";
import {
  resolveRecipeRuntime,
  type InitialView,
  type ProjectProfile,
} from "@/src/modules/creation-assistant/domain";

export type EditorPersona = {
  id: string;
  profile: ProjectProfile;
  initialView: InitialView;
  quickAdd: {
    defaultNodeKind: NodeKind;
    defaultEdgeKind: EdgeKind;
  };
};

const fallbackPersona: EditorPersona = {
  id: "blank:free",
  profile: "blank",
  initialView: "free",
  quickAdd: {
    defaultNodeKind: "note",
    defaultEdgeKind: "relates-to",
  },
};

function resolveInitialViewFromProfile(profile: ProjectProfile): InitialView {
  if (profile === "data-model") {
    return "erd";
  }

  if (profile === "process") {
    return "flow";
  }

  if (profile === "information-structure" || profile === "documents-governance") {
    return "hierarchy";
  }

  if (profile === "system-architecture" || profile === "mixed") {
    return "graph";
  }

  return "free";
}

export function resolveEditorPersona(
  profile?: ProjectProfile,
  initialView?: InitialView,
): EditorPersona {
  const resolvedProfile = profile ?? "blank";
  const resolvedView = initialView ?? resolveInitialViewFromProfile(resolvedProfile);
  const runtime = resolveRecipeRuntime({
    profile: resolvedProfile,
    view: resolvedView,
  });

  if (!runtime?.persona) {
    return fallbackPersona;
  }

  return {
    id: runtime.recipeId,
    profile: resolvedProfile,
    initialView: resolvedView,
    quickAdd: runtime.persona.quickAdd,
  };
}
