function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    id: typeof entry.id === "string" ? entry.id : "",
    text: typeof entry.text === "string" ? entry.text : "",
    mood: typeof entry.mood === "string" ? entry.mood : "neutral",
    tags: Array.isArray(entry.tags) ? entry.tags.filter((x) => typeof x === "string") : [],
    photos: Array.isArray(entry.photos) ? entry.photos.filter((x) => typeof x === "string") : [],
    starred: entry.starred === true,
    hibiNote: typeof entry.hibiNote === "string" ? entry.hibiNote : "",
    updatedAt: Number(entry.updatedAt) || 0,
  };
}

function byStablePriority(a, b) {
  const t = (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0);
  if (t !== 0) return t;
  return String(a.id || "").localeCompare(String(b.id || ""));
}

export function resolveEntryConflict(localEntry, remoteEntry, policy = "prefer-latest") {
  const local = normalizeEntry(localEntry);
  const remote = normalizeEntry(remoteEntry);

  if (!local && !remote) return null;
  if (!local) return remote;
  if (!remote) return local;

  if (policy === "prefer-local") return local;
  if (policy === "prefer-remote") return remote;

  if (policy === "merge") {
    const mergedText = local.text.trim() === remote.text.trim()
      ? local.text
      : [local.text ? `Local:\n${local.text}` : "", remote.text ? `Remote:\n${remote.text}` : ""]
          .filter(Boolean)
          .join("\n\n---\n\n");

    return {
      id: local.id || remote.id,
      text: mergedText,
      mood: (remote.updatedAt >= local.updatedAt ? remote.mood : local.mood) || "neutral",
      tags: Array.from(new Set([...(local.tags || []), ...(remote.tags || [])])).sort(),
      photos: Array.from(new Set([...(local.photos || []), ...(remote.photos || [])])),
      starred: Boolean(local.starred || remote.starred),
      hibiNote: remote.updatedAt >= local.updatedAt ? remote.hibiNote : local.hibiNote,
      updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    };
  }

  return remote.updatedAt >= local.updatedAt ? remote : local;
}

export function mergeDayEntries(localEntries = [], remoteEntries = [], policy = "prefer-latest") {
  const byId = new Map();

  localEntries.forEach((entry, index) => {
    const normalized = normalizeEntry(entry);
    if (!normalized) return;
    const key = normalized.id || `local-${index}`;
    byId.set(key, { local: normalized, remote: null, key });
  });

  remoteEntries.forEach((entry, index) => {
    const normalized = normalizeEntry(entry);
    if (!normalized) return;
    const key = normalized.id || `remote-${index}`;
    const existing = byId.get(key);
    if (existing) {
      existing.remote = normalized;
    } else {
      byId.set(key, { local: null, remote: normalized, key });
    }
  });

  const resolved = Array.from(byId.values())
    .map((row) => resolveEntryConflict(row.local, row.remote, policy))
    .filter(Boolean)
    .sort(byStablePriority);

  return resolved;
}

export function summarizeConflict(localEntries = [], remoteEntries = []) {
  const localCount = Array.isArray(localEntries) ? localEntries.length : 0;
  const remoteCount = Array.isArray(remoteEntries) ? remoteEntries.length : 0;
  const overlap = new Set((localEntries || []).map((e) => e?.id).filter(Boolean));
  let sameIds = 0;
  (remoteEntries || []).forEach((entry) => {
    if (entry?.id && overlap.has(entry.id)) sameIds += 1;
  });
  return {
    localCount,
    remoteCount,
    overlapCount: sameIds,
    uniqueLocal: Math.max(0, localCount - sameIds),
    uniqueRemote: Math.max(0, remoteCount - sameIds),
  };
}
