"use client";

import { useEffect } from "react";

export function usePendingChangesGuard(hasPendingChanges: boolean) {
  useEffect(() => {
    if (!hasPendingChanges) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasPendingChanges]);
}
