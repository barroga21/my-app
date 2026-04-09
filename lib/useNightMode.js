"use client";
import { useEffect, useState } from "react";
import { getStoredNightModePreference, isNightModeEnabled } from "./nightModePreference";

/**
 * Shared hook for syncing night mode across all pages.
 * Listens to localStorage changes and re-evaluates every minute for AUTO mode.
 */
export function useNightMode() {
  const [nightMode, setNightMode] = useState(false);

  useEffect(() => {
    const sync = () => setNightMode(isNightModeEnabled(getStoredNightModePreference()));
    sync();
    const id = window.setInterval(sync, 60 * 1000);
    const handleStorage = (e) => {
      if (!e.key || e.key === "hibi_night_mode_preference") sync();
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return nightMode;
}
