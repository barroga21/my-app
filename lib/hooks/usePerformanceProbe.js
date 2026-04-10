"use client";

import { useEffect, useRef } from "react";

function shouldEnableProbe() {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return false;
  return localStorage.getItem("hibi_perf_probe") === "1";
}

export function usePerformanceProbe(viewName, metrics = {}) {
  const renderStartRef = useRef(0);

  useEffect(() => {
    if (!shouldEnableProbe()) return;

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!renderStartRef.current) {
      renderStartRef.current = now;
      return;
    }
    const renderMs = Number((now - renderStartRef.current).toFixed(2));
    renderStartRef.current = now;

    const snapshot = {
      view: viewName,
      renderMs,
      at: Date.now(),
      ...metrics,
    };

    try {
      const raw = localStorage.getItem("hibi_perf_samples");
      const parsed = JSON.parse(raw || "[]");
      const previous = Array.isArray(parsed) ? parsed : [];
      const next = [...previous.slice(-199), snapshot];
      localStorage.setItem("hibi_perf_samples", JSON.stringify(next));
    } catch {
      // Ignore probe failures in production mode.
    }

    if (typeof window !== "undefined" && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent("hibi:perf-sample", { detail: snapshot }));
    }
  });
}
