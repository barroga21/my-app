const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseWithSchemaGuard(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || parsed === undefined) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

export function sanitizeJournalEntriesMap(value) {
  if (!isObject(value)) return {};
  const next = {};

  Object.entries(value).forEach(([date, entries]) => {
    if (!DAY_KEY.test(date) || !Array.isArray(entries)) return;

    const cleaned = entries
      .filter((entry) => isObject(entry))
      .map((entry) => ({
        id: typeof entry.id === "string" ? entry.id : `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        text: typeof entry.text === "string" ? entry.text : "",
        mood: typeof entry.mood === "string" ? entry.mood : "neutral",
        tags: Array.isArray(entry.tags) ? entry.tags.filter((tag) => typeof tag === "string") : [],
        photos: Array.isArray(entry.photos) ? entry.photos.filter((photo) => typeof photo === "string") : [],
        hibiNote: typeof entry.hibiNote === "string" ? entry.hibiNote : "",
        starred: entry.starred === true,
        updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : null,
      }))
      .filter((entry) => entry.text || entry.tags.length || entry.photos.length);

    if (cleaned.length) {
      next[date] = cleaned;
    }
  });

  return next;
}

export function sanitizeHabitChecksMap(value) {
  if (!isObject(value)) return {};
  const next = {};
  Object.entries(value).forEach(([key, state]) => {
    if (typeof key !== "string") return;
    if (state === "dot" || state === "fill" || state === "empty") {
      next[key] = state;
    }
  });
  return next;
}

export function sanitizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === "string");
}

export function safeReadJSON(key, fallback, sanitizer) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = parseWithSchemaGuard(raw, fallback);
    return sanitizer ? sanitizer(parsed) : parsed;
  } catch {
    return fallback;
  }
}

export function safeWriteJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
