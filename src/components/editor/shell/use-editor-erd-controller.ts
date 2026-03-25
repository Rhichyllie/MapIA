import { useCallback, useEffect, useMemo, useState } from "react";
import type { SetStateAction } from "react";
import { inferDependentSide, type ErdEntityPayload, type ErdRelationPayload } from "@/src/modules/erd/domain";
import type { RFEdge, RFNode } from "../editor-graph-mappers";
import type { ErdExportPreviewPayload } from "../editor-query-service";
import {
  normalizeErdEntityPayloadFromNode,
  normalizeErdRelationPayloadFromEdge,
} from "./editor-shell-utils";
import type {
  ErdExportFeedback,
  ErdFieldDraftState,
  PendingErdQuickRelateState,
  PrismaSchemaImportFeedback,
} from "./editor-shell-types";

type UseEditorErdControllerInput = {
  selectedNode: RFNode | null;
  selectedEdge: RFEdge | null;
  selectedErdEntityPayload: ErdEntityPayload | null;
  selectedErdRelationPayload: ErdRelationPayload | null;
  selectedErdSourceEntityNode: RFNode | null;
  selectedErdTargetEntityNode: RFNode | null;
};

export function buildErdFieldDrafts(
  selectedErdEntityPayload: ErdEntityPayload | null,
): Record<string, ErdFieldDraftState> {
  if (!selectedErdEntityPayload) {
    return {};
  }

  const nextDrafts: Record<string, ErdFieldDraftState> = {};
  for (const field of selectedErdEntityPayload.fields) {
    nextDrafts[field.id] = {
      name: field.name,
      type: field.type,
    };
  }

  return nextDrafts;
}

export function resolveDefaultErdMaterializeState(input: {
  selectedEdge: RFEdge | null;
  selectedErdRelationPayload: ErdRelationPayload | null;
  selectedErdSourceEntityNode: RFNode | null;
  selectedErdTargetEntityNode: RFNode | null;
}) {
  const {
    selectedEdge,
    selectedErdRelationPayload,
    selectedErdSourceEntityNode,
    selectedErdTargetEntityNode,
  } = input;

  if (!selectedErdRelationPayload) {
    return {
      dependentSide: "target" as const,
      existingFieldId: "__new__",
      unique: false,
    };
  }

  const inferredSide = inferDependentSide({
    relation: {
      sourceEntityId: selectedEdge?.source ?? "",
      targetEntityId: selectedEdge?.target ?? "",
      payload: selectedErdRelationPayload,
    },
    sourceEntity: selectedErdSourceEntityNode
      ? {
          id: selectedErdSourceEntityNode.id,
          kind: "entity",
          label: selectedErdSourceEntityNode.data.label,
          payload: normalizeErdEntityPayloadFromNode(selectedErdSourceEntityNode),
        }
      : undefined,
    targetEntity: selectedErdTargetEntityNode
      ? {
          id: selectedErdTargetEntityNode.id,
          kind: "entity",
          label: selectedErdTargetEntityNode.data.label,
          payload: normalizeErdEntityPayloadFromNode(selectedErdTargetEntityNode),
        }
      : undefined,
  });

  return {
    dependentSide:
      selectedErdRelationPayload.materialization?.mode === "fk"
        ? selectedErdRelationPayload.materialization.dependentSide
        : inferredSide,
    existingFieldId: "__new__",
    unique:
      selectedErdRelationPayload.materialization?.mode === "fk"
        ? selectedErdRelationPayload.materialization.fk.unique === true
        : false,
  };
}

export function useEditorErdController({
  selectedNode,
  selectedEdge,
  selectedErdEntityPayload,
  selectedErdRelationPayload,
  selectedErdSourceEntityNode,
  selectedErdTargetEntityNode,
}: UseEditorErdControllerInput) {
  const [prismaSchemaImportText, setPrismaSchemaImportText] = useState("");
  const [isImportingPrismaSchema, setIsImportingPrismaSchema] = useState(false);
  const [prismaSchemaImportFeedback, setPrismaSchemaImportFeedback] =
    useState<PrismaSchemaImportFeedback>(null);
  const [isExportingErdPreview, setIsExportingErdPreview] = useState(false);
  const [erdExportFeedback, setErdExportFeedback] = useState<ErdExportFeedback>(null);
  const [lastErdExportPreview, setLastErdExportPreview] =
    useState<ErdExportPreviewPayload | null>(null);
  const [pendingErdQuickRelate, setPendingErdQuickRelate] =
    useState<PendingErdQuickRelateState | null>(null);
  const [erdFieldDraftsState, setErdFieldDraftsState] = useState<
    Record<string, ErdFieldDraftState>
  >({});
  const [erdFieldDraftsSelectionId, setErdFieldDraftsSelectionId] = useState<
    string | null
  >(null);
  const [erdPendingFieldFocusId, setErdPendingFieldFocusId] = useState<string | null>(
    null,
  );
  const [erdMaterializeState, setErdMaterializeState] = useState<{
    dependentSide: "source" | "target";
    existingFieldId: string;
    unique: boolean;
  }>({
    dependentSide: "target",
    existingFieldId: "__new__",
    unique: false,
  });
  const [erdMaterializeSelectionId, setErdMaterializeSelectionId] = useState<
    string | null
  >(null);

  const selectedErdEntityId =
    selectedNode?.data.kind === "entity" ? selectedNode.id : null;
  const selectedErdRelationId =
    selectedEdge && (selectedEdge.data?.kind ?? "flows-to") === "references"
      ? selectedEdge.id
      : null;

  const defaultErdFieldDrafts = useMemo(
    () => buildErdFieldDrafts(selectedErdEntityPayload),
    [selectedErdEntityPayload],
  );

  const erdFieldDrafts = useMemo(
    () =>
      erdFieldDraftsSelectionId === selectedErdEntityId
        ? erdFieldDraftsState
        : defaultErdFieldDrafts,
    [
      defaultErdFieldDrafts,
      erdFieldDraftsSelectionId,
      erdFieldDraftsState,
      selectedErdEntityId,
    ],
  );

  const setErdFieldDrafts = useCallback(
    (
      value:
        | Record<string, ErdFieldDraftState>
        | ((current: Record<string, ErdFieldDraftState>) => Record<string, ErdFieldDraftState>),
    ) => {
      setErdFieldDraftsSelectionId(selectedErdEntityId);
      setErdFieldDraftsState((current) => {
        const base =
          erdFieldDraftsSelectionId === selectedErdEntityId
            ? current
            : defaultErdFieldDrafts;

        return typeof value === "function" ? value(base) : value;
      });
    },
    [defaultErdFieldDrafts, erdFieldDraftsSelectionId, selectedErdEntityId],
  );

  const defaultErdMaterializeState = useMemo(
    () =>
      resolveDefaultErdMaterializeState({
        selectedEdge,
        selectedErdRelationPayload,
        selectedErdSourceEntityNode,
        selectedErdTargetEntityNode,
      }),
    [
      selectedEdge,
      selectedErdRelationPayload,
      selectedErdSourceEntityNode,
      selectedErdTargetEntityNode,
    ],
  );

  const effectiveErdMaterializeState =
    erdMaterializeSelectionId === selectedErdRelationId
      ? erdMaterializeState
      : defaultErdMaterializeState;

  const setErdMaterializeDependentSide = useCallback(
    (value: SetStateAction<"source" | "target">) => {
      setErdMaterializeSelectionId(selectedErdRelationId);
      setErdMaterializeState((current) => {
        const base =
          erdMaterializeSelectionId === selectedErdRelationId
            ? current
            : defaultErdMaterializeState;

        return {
          ...base,
          dependentSide: typeof value === "function" ? value(base.dependentSide) : value,
        };
      });
    },
    [defaultErdMaterializeState, erdMaterializeSelectionId, selectedErdRelationId],
  );

  const setErdMaterializeExistingFieldId = useCallback(
    (value: SetStateAction<string>) => {
      setErdMaterializeSelectionId(selectedErdRelationId);
      setErdMaterializeState((current) => {
        const base =
          erdMaterializeSelectionId === selectedErdRelationId
            ? current
            : defaultErdMaterializeState;

        return {
          ...base,
          existingFieldId:
            typeof value === "function" ? value(base.existingFieldId) : value,
        };
      });
    },
    [defaultErdMaterializeState, erdMaterializeSelectionId, selectedErdRelationId],
  );

  const setErdMaterializeUnique = useCallback(
    (value: SetStateAction<boolean>) => {
      setErdMaterializeSelectionId(selectedErdRelationId);
      setErdMaterializeState((current) => {
        const base =
          erdMaterializeSelectionId === selectedErdRelationId
            ? current
            : defaultErdMaterializeState;

        return {
          ...base,
          unique: typeof value === "function" ? value(base.unique) : value,
        };
      });
    },
    [defaultErdMaterializeState, erdMaterializeSelectionId, selectedErdRelationId],
  );

  useEffect(() => {
    if (!erdPendingFieldFocusId) {
      return;
    }

    const focusId = erdPendingFieldFocusId;
    window.requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(
        `[data-erd-field-input="${focusId}:name"]`,
      );
      input?.focus();
      input?.select();
      setErdPendingFieldFocusId(null);
    });
  }, [erdPendingFieldFocusId]);

  const selectedErdRelationPayloadFromEdge = selectedEdge
    ? normalizeErdRelationPayloadFromEdge(selectedEdge)
    : null;

  return {
    prismaSchemaImportText,
    setPrismaSchemaImportText,
    isImportingPrismaSchema,
    setIsImportingPrismaSchema,
    prismaSchemaImportFeedback,
    setPrismaSchemaImportFeedback,
    isExportingErdPreview,
    setIsExportingErdPreview,
    erdExportFeedback,
    setErdExportFeedback,
    lastErdExportPreview,
    setLastErdExportPreview,
    pendingErdQuickRelate,
    setPendingErdQuickRelate,
    erdFieldDrafts,
    setErdFieldDrafts,
    erdPendingFieldFocusId,
    setErdPendingFieldFocusId,
    erdMaterializeDependentSide: effectiveErdMaterializeState.dependentSide,
    setErdMaterializeDependentSide,
    erdMaterializeExistingFieldId: effectiveErdMaterializeState.existingFieldId,
    setErdMaterializeExistingFieldId,
    erdMaterializeUnique: effectiveErdMaterializeState.unique,
    setErdMaterializeUnique,
    selectedErdRelationPayloadFromEdge,
    canImportPrismaSchema: prismaSchemaImportText.trim().length > 0,
    isSelectedErdEntity:
      selectedNode?.data.kind === "entity" && selectedErdEntityPayload !== null,
    isSelectedErdRelation:
      (selectedEdge?.data?.kind ?? "flows-to") === "references" &&
      selectedErdRelationPayload !== null,
  };
}
