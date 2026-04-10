"use client";

const BUFFER_KEY = "hibi_observability_buffer";
const MAX_BUFFER = 200;
const SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function parseBoolean(value, fallback = false) {
  if (value == null) return fallback;
  return String(value).toLowerCase() === "true";
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getConfig() {
  if (typeof process === "undefined") {
    return { enabled: false, sampleRate: 1, endpoint: "/api/observability" };
  }

  const enabled = parseBoolean(process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED, false);
  const sampleRate = Math.min(1, Math.max(0, parseNumber(process.env.NEXT_PUBLIC_OBSERVABILITY_SAMPLE_RATE, 1)));
  const endpoint = process.env.NEXT_PUBLIC_OBSERVABILITY_ENDPOINT || "/api/observability";

  return {
    enabled,
    sampleRate,
    endpoint,
  };
}

function appendToLocalBuffer(payload) {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    const parsed = JSON.parse(raw || "[]");
    const buffer = Array.isArray(parsed) ? parsed : [];
    buffer.push(payload);
    localStorage.setItem(BUFFER_KEY, JSON.stringify(buffer.slice(-MAX_BUFFER)));
  } catch {
    // Ignore local buffer errors in production.
  }
}

async function sendPayload(payload, endpoint) {
  if (typeof fetch === "undefined") return;

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Network failures are non-blocking by design.
  }
}

export function trackEvent(name, details = {}, options = {}) {
  const config = getConfig();
  const sampleRate = options.sampleRateOverride ?? config.sampleRate;
  if (!config.enabled && !options.force) return;
  if (!options.force && Math.random() > sampleRate) return;

  const payload = {
    name,
    details,
    sessionId: SESSION_ID,
    path: typeof window !== "undefined" ? window.location.pathname : "unknown",
    ts: Date.now(),
    ua: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
  };

  appendToLocalBuffer(payload);
  sendPayload(payload, options.endpoint || config.endpoint);
}

export function initObservability() {
  const config = getConfig();
  if (!config.enabled || typeof window === "undefined") return () => {};

  function onError(event) {
    trackEvent("window_error", {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  }

  function onUnhandledRejection(event) {
    const reason = event.reason;
    trackEvent("unhandled_rejection", {
      reason: typeof reason === "string" ? reason : reason?.message || "unknown",
    });
  }

  function onOnline() {
    trackEvent("network_online", { online: true });
  }

  function onOffline() {
    trackEvent("network_offline", { online: false });
  }

  function onVisibilityChange() {
    trackEvent("visibility_change", { state: document.visibilityState });
  }

  function onStorage(event) {
    if (!event.key) return;
    if (!event.key.includes("_sync_status_")) return;
    try {
      const value = JSON.parse(event.newValue || "{}");
      trackEvent("sync_status_change", {
        key: event.key,
        state: value.state || "unknown",
        pending: Number(value.pending) || 0,
      });
    } catch {
      trackEvent("sync_status_change", {
        key: event.key,
        state: "malformed",
      });
    }
  }

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisibilityChange);

  trackEvent("observability_initialized", {
    sampleRate: config.sampleRate,
  }, { force: true });

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
