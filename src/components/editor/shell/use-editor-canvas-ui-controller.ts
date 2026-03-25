import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { EditorPanelState } from "./editor-shell-types";
import {
  DEFAULT_EDITOR_PANEL_STATE,
} from "./editor-shell-types";
import { sanitizeEditorPanelState } from "./editor-shell-utils";

const EDITOR_PANELS_STORAGE_KEY_PREFIX = "mapia-editor-panels";
const EDITOR_FOCUS_STORAGE_KEY_PREFIX = "mapia-editor-focus";

export function createFocusModePanelState(): EditorPanelState {
  return {
    metadata: false,
    prismaImport: false,
    versions: false,
  };
}

type UseEditorCanvasUiControllerInput = {
  projectId: string;
  canvasRegionRef: RefObject<HTMLDivElement | null>;
};

export function useEditorCanvasUiController({
  projectId,
  canvasRegionRef,
}: UseEditorCanvasUiControllerInput) {
  const editorPanelsStorageKey = `${EDITOR_PANELS_STORAGE_KEY_PREFIX}:${projectId}`;
  const editorFocusStorageKey = `${EDITOR_FOCUS_STORAGE_KEY_PREFIX}:${projectId}`;
  const [panelState, setPanelState] = useState<EditorPanelState>(
    DEFAULT_EDITOR_PANEL_STATE,
  );
  const [isCanvasFocusMode, setIsCanvasFocusMode] = useState(false);
  const [isFocusInspectorCollapsed, setIsFocusInspectorCollapsed] = useState(false);
  const [hasHydratedEditorPreferences, setHasHydratedEditorPreferences] =
    useState(false);
  const [isQuickFindOpen, setIsQuickFindOpen] = useState(false);
  const [quickFindQuery, setQuickFindQuery] = useState("");
  const [quickFindActiveIndex, setQuickFindActiveIndex] = useState(0);
  const panelStateBeforeFocusRef = useRef<EditorPanelState>(
    DEFAULT_EDITOR_PANEL_STATE,
  );
  const quickFindReturnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const rawPanelState = window.localStorage.getItem(editorPanelsStorageKey);
      const parsedPanelState = rawPanelState
        ? sanitizeEditorPanelState(JSON.parse(rawPanelState))
        : DEFAULT_EDITOR_PANEL_STATE;
      const persistedFocus = window.localStorage.getItem(editorFocusStorageKey) === "true";

      panelStateBeforeFocusRef.current = parsedPanelState;
      setPanelState(persistedFocus ? createFocusModePanelState() : parsedPanelState);
      setIsCanvasFocusMode(persistedFocus);
      setIsFocusInspectorCollapsed(persistedFocus);
    } catch {
      panelStateBeforeFocusRef.current = DEFAULT_EDITOR_PANEL_STATE;
      setPanelState(DEFAULT_EDITOR_PANEL_STATE);
      setIsCanvasFocusMode(false);
      setIsFocusInspectorCollapsed(false);
    } finally {
      setHasHydratedEditorPreferences(true);
    }
  }, [editorFocusStorageKey, editorPanelsStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasHydratedEditorPreferences) {
      return;
    }

    try {
      window.localStorage.setItem(editorPanelsStorageKey, JSON.stringify(panelState));
    } catch {
      // Ignora indisponibilidade de storage local.
    }
  }, [editorPanelsStorageKey, hasHydratedEditorPreferences, panelState]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasHydratedEditorPreferences) {
      return;
    }

    try {
      window.localStorage.setItem(editorFocusStorageKey, String(isCanvasFocusMode));
    } catch {
      // Ignora indisponibilidade de storage local.
    }
  }, [editorFocusStorageKey, hasHydratedEditorPreferences, isCanvasFocusMode]);

  const handleTogglePanel = useCallback((panelKey: keyof EditorPanelState) => {
    setPanelState((current) => ({
      ...current,
      [panelKey]: !current[panelKey],
    }));
  }, []);

  const enterCanvasFocusMode = useCallback(() => {
    panelStateBeforeFocusRef.current = panelState;
    setIsQuickFindOpen(false);
    setPanelState(createFocusModePanelState());
    setIsCanvasFocusMode(true);
    setIsFocusInspectorCollapsed(true);
    window.requestAnimationFrame(() => {
      canvasRegionRef.current?.focus();
    });
  }, [canvasRegionRef, panelState]);

  const exitCanvasFocusMode = useCallback(() => {
    if (!isCanvasFocusMode) {
      return;
    }

    setIsQuickFindOpen(false);
    setIsCanvasFocusMode(false);
    setPanelState(panelStateBeforeFocusRef.current);
    setIsFocusInspectorCollapsed(false);
  }, [isCanvasFocusMode]);

  const handleToggleCanvasFocusMode = useCallback(() => {
    if (isCanvasFocusMode) {
      exitCanvasFocusMode();
      return;
    }

    enterCanvasFocusMode();
  }, [enterCanvasFocusMode, exitCanvasFocusMode, isCanvasFocusMode]);

  const handleToggleInspectorVisibility = useCallback(() => {
    setIsFocusInspectorCollapsed((current) => !current);
  }, []);

  const handleOpenQuickFind = useCallback(() => {
    quickFindReturnFocusRef.current = document.activeElement as HTMLElement | null;
    setQuickFindQuery("");
    setQuickFindActiveIndex(0);
    setIsQuickFindOpen(true);
  }, []);

  const handleCloseQuickFind = useCallback(() => {
    setIsQuickFindOpen(false);
    setQuickFindQuery("");
    window.requestAnimationFrame(() => {
      quickFindReturnFocusRef.current?.focus();
    });
  }, []);

  return {
    panelState,
    setPanelState,
    isCanvasFocusMode,
    setIsCanvasFocusMode,
    isFocusInspectorCollapsed,
    setIsFocusInspectorCollapsed,
    isQuickFindOpen,
    setIsQuickFindOpen,
    quickFindQuery,
    setQuickFindQuery,
    quickFindActiveIndex,
    setQuickFindActiveIndex,
    panelStateBeforeFocusRef,
    quickFindReturnFocusRef,
    handleTogglePanel,
    enterCanvasFocusMode,
    exitCanvasFocusMode,
    handleToggleCanvasFocusMode,
    handleToggleInspectorVisibility,
    handleOpenQuickFind,
    handleCloseQuickFind,
  };
}
