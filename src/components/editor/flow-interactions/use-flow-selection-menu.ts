"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useFlowSelectionMenu(dismissKey: string) {
  const [openForKey, setOpenForKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isOpen = openForKey === dismissKey;

  const closeMenu = useCallback(() => {
    setOpenForKey(null);
  }, []);

  const toggleMenu = useCallback(() => {
    setOpenForKey((current) => (current === dismissKey ? null : dismissKey));
  }, [dismissKey]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (
        menuRef.current &&
        target instanceof Node &&
        !menuRef.current.contains(target)
      ) {
        setOpenForKey(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenForKey(null);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return {
    isOpen,
    menuRef,
    closeMenu,
    toggleMenu,
  };
}
