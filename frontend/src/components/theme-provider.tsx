import { useEffect, useState, type ReactNode } from "react";

import { ThemeContext, type Theme, type ThemePreference } from "@/components/theme-context";

const STORAGE_KEY = "flow-theme";
const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

function getStoredPreference(): ThemePreference | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" || value === "system" ? value : null;
  } catch {
    return null;
  }
}

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia(DARK_MODE_QUERY).matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;

  document.querySelectorAll<HTMLLinkElement>("link[data-favicon-theme]").forEach((link) => {
    link.media = link.dataset.faviconTheme === theme ? "all" : "not all";
  });

  document.querySelectorAll<HTMLMetaElement>("meta[data-theme-color]").forEach((meta) => {
    meta.media = meta.dataset.themeColor === theme ? "all" : "not all";
  });
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    () => getStoredPreference() ?? "system",
  );
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme);
  const theme = preference === "system" ? systemTheme : preference;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia(DARK_MODE_QUERY);
    const followSystemTheme = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };

    media.addEventListener("change", followSystemTheme);
    return () => media.removeEventListener("change", followSystemTheme);
  }, []);

  const setPreference = (nextPreference: ThemePreference) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, nextPreference);
    } catch {
      // The visual preference still applies when storage is unavailable.
    }
    setPreferenceState(nextPreference);
  };

  const setTheme = (nextTheme: Theme) => setPreference(nextTheme);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        preference,
        setTheme,
        setPreference,
        toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
