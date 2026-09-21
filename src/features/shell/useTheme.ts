"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

const KEY = "tide:theme";
const EVENT = "tide:themechange";

/**
 * The theme lives in localStorage and on `<html data-theme>`, not in React
 * state — an inline script in the root layout has already written it before
 * React exists. So this reads it as an external store rather than mirroring it,
 * which also keeps two tabs in step for free.
 */
function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    query.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function storedTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function resolvedTheme(): "light" | "dark" {
  const stored = storedTheme();
  if (stored !== "system") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * `resolved` is what the user is actually looking at. On the server it is
 * reported as light, because the server cannot know — the real value arrives on
 * hydration, and the pre-paint script means the pixels were never wrong.
 */
export function useTheme(): {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (next: Theme) => void;
} {
  const theme = useSyncExternalStore(
    subscribe,
    storedTheme,
    () => "system" as const,
  );
  const resolved = useSyncExternalStore(
    subscribe,
    resolvedTheme,
    () => "light" as const,
  );

  const setTheme = useCallback((next: Theme) => {
    if (next === "system") {
      localStorage.removeItem(KEY);
      document.documentElement.removeAttribute("data-theme");
    } else {
      localStorage.setItem(KEY, next);
      document.documentElement.setAttribute("data-theme", next);
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { theme, resolved, setTheme };
}

/** Runs before first paint. Kept as a string so it can go straight into a tag. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
