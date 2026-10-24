"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { THEME_STORAGE, type ThemePreference } from "@/lib/theme";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE);
    if (value === "light" || value === "dark") return value;
    if (value === "auto") {
      const theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      try {
        localStorage.setItem(THEME_STORAGE, theme);
      } catch {
        // Storage blocked: still use the one-time snapshot for this visit.
      }
      return theme;
    }
  } catch {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function apply(theme: ThemePreference) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePref = theme;
  const color = theme === "dark" ? "#0F1419" : "#F5F4F1";
  document.querySelectorAll('meta[name="theme-color"]').forEach((node) => {
    node.setAttribute("content", color);
  });
}

/** The theme actually on screen, for things CSS cannot restyle (map tiles). */
export function useResolvedTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.dataset.theme === "light" ? "light" : "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>("light");

  useIsoLayoutEffect(() => {
    const next = readPreference();
    setTheme(next);
    apply(next);
  }, []);

  function toggle() {
    const next: ThemePreference = theme === "dark" ? "light" : "dark";
    setTheme(next);
    apply(next);
    try {
      localStorage.setItem(THEME_STORAGE, next);
    } catch {
      // Storage blocked: the choice still applies for this visit.
    }
  }

  const dark = theme === "dark";

  return (
    <button type="button" className="theme-mark" onClick={toggle} aria-label="Switch colour theme">
      <span className={dark ? "" : "on"}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 3.5v2.2M12 18.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
        </svg>
      </span>
      <span className={dark ? "on" : ""}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M19.5 14.2A7.2 7.2 0 0 1 9.8 4.5 7.2 7.2 0 1 0 19.5 14.2Z" />
        </svg>
      </span>
    </button>
  );
}
