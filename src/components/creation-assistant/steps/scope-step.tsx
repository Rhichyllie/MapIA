import { CardOption } from "@/src/components/ui/card-option";
import {
  buildDefaultContextForView,
  getRecommendedViewsForProfile,
  getViewCompatibilityRank,
  normalizeLayoutForView,
  type AssistantDraft,
} from "@/src/modules/creation-assistant/domain";
import { PROFILES } from "../shared";

type ScopeStepProps = {
  draft: AssistantDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssistantDraft>>;
  synchronizeDirectionalContext: (draft: AssistantDraft) => AssistantDraft;
};

export function ScopeStep({
  draft,
  setDraft,
  synchronizeDirectionalContext,
}: ScopeStepProps) {
  return (
    <div className="grid-tiles">
      {PROFILES.map((profile) => (
        <CardOption
          key={profile.value}
          title={profile.title}
          description={profile.description}
          selected={draft.profile === profile.value}
          onSelect={() => {
            const nextViews = getRecommendedViewsForProfile(profile.value);
            const compatible =
              getViewCompatibilityRank(profile.value, draft.initialView) !==
              "incompatible";
            const nextView = compatible
              ? draft.initialView
              : (nextViews.recommended[0] ?? "free");
            const normalized = normalizeLayoutForView({
              profile: profile.value,
              initialView: nextView,
              layout: draft.layout,
            });
            setDraft((current) =>
              synchronizeDirectionalContext({
                ...current,
                profile: profile.value,
                initialView: nextView,
                layout: normalized.layout,
                context: {
                  ...buildDefaultContextForView(nextView, profile.value),
                  ...current.context,
                },
              }),
            );
          }}
        />
      ))}
    </div>
  );
}
