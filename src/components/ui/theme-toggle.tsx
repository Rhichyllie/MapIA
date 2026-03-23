"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const THEME_STORAGE_KEY = "mapia-theme";

type ThemeMode = "light" | "dark";

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

function resolveSystemTheme(): ThemeMode {
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const t = useTranslations("Common.theme");
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof document !== "undefined") {
      const current = document.documentElement.dataset.theme;
      if (isThemeMode(current)) {
        return current;
      }
    }

    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        return isThemeMode(stored) ? stored : resolveSystemTheme();
      } catch {
        return resolveSystemTheme();
      }
    }

    return "light";
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function handleToggleTheme() {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      applyTheme(nextTheme);

      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch {
        // Ignore localStorage failures and keep in-memory theme switch.
      }

      return nextTheme;
    });
  }

  return (
    <button
      type="button"
      className="btn theme-toggle"
      onClick={handleToggleTheme}
      data-testid="theme-toggle"
      aria-label={
        theme === "dark" ? t("toggleToLightAria") : t("toggleToDarkAria")
      }
      title={theme === "dark" ? t("currentDarkTitle") : t("currentLightTitle")}
    >
      <span className="theme-toggle-indicator" aria-hidden="true" />
      {theme === "dark" ? t("switchToLight") : t("switchToDark")}
    </button>
  );
}
