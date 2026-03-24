import { CardOption } from "@/src/components/ui/card-option";
import {
  getRecommendedViewsForProfile,
  getViewCompatibilityRank,
  normalizeLayoutForView,
  type AssistantDraft,
} from "@/src/modules/creation-assistant/domain";
import type { CreationAssistantLabels } from "../creation-assistant-i18n";
import {
  buildLocalizedDefaultContextForView,
  PROJECT_PROFILES,
} from "../shared";

type ScopeStepProps = {
  draft: AssistantDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssistantDraft>>;
  synchronizeDirectionalContext: (draft: AssistantDraft) => AssistantDraft;
  labels: CreationAssistantLabels;
};

export function ScopeStep({
  draft,
  setDraft,
  synchronizeDirectionalContext,
  labels,
}: ScopeStepProps) {
  return (
    <div className="grid-tiles">
      {PROJECT_PROFILES.map((profile) => (
        <CardOption
          key={profile}
          title={labels.getProjectProfile(profile).title}
          description={labels.getProjectProfile(profile).description}
          selected={draft.profile === profile}
          onSelect={() => {
            const nextViews = getRecommendedViewsForProfile(profile);
            const compatible =
              getViewCompatibilityRank(profile, draft.initialView) !==
              "incompatible";
            const nextView = compatible
              ? draft.initialView
              : (nextViews.recommended[0] ?? "free");
            const normalized = normalizeLayoutForView({
              profile,
              initialView: nextView,
              layout: draft.layout,
            });
            setDraft((current) =>
              synchronizeDirectionalContext({
                ...current,
                profile,
                initialView: nextView,
                layout: normalized.layout,
                context: {
                  ...buildLocalizedDefaultContextForView(
                    nextView,
                    profile,
                    labels.defaults,
                  ),
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
