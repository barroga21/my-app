function defaultNormalize(entry) {
  if (!entry || typeof entry !== "object") return null;
  return entry;
}

export function buildConflictRows(localEntries = [], remoteEntries = [], normalizeEntry = defaultNormalize) {
  const rowMap = new Map();

  localEntries.forEach((entry, index) => {
    const key = entry?.id || `local-${index}`;
    rowMap.set(key, { key, local: normalizeEntry(entry), remote: null });
  });

  remoteEntries.forEach((entry, index) => {
    const key = entry?.id || `remote-${index}`;
    const existing = rowMap.get(key);
    if (existing) {
      existing.remote = normalizeEntry(entry);
      return;
    }
    rowMap.set(key, { key, local: null, remote: normalizeEntry(entry) });
  });

  return Array.from(rowMap.values());
}

export function mergeConflictEntry(localEntry, remoteEntry, normalizeEntry = defaultNormalize) {
  if (localEntry && !remoteEntry) return normalizeEntry(localEntry);
  if (remoteEntry && !localEntry) return normalizeEntry(remoteEntry);
  if (!localEntry && !remoteEntry) return null;

  const local = normalizeEntry(localEntry);
  const remote = normalizeEntry(remoteEntry);
  const localUpdatedAt = Number(local?.updatedAt) || 0;
  const remoteUpdatedAt = Number(remote?.updatedAt) || 0;
  const localText = String(local?.text || "").trim();
  const remoteText = String(remote?.text || "").trim();
  const mergedText =
    localText === remoteText
      ? local?.text || ""
      : [
          localText ? `Local:\n${local?.text || ""}` : "",
          remoteText ? `Remote:\n${remote?.text || ""}` : "",
        ]
          .filter(Boolean)
          .join("\n\n---\n\n");

  const mergedTags = Array.from(new Set([...(local?.tags || []), ...(remote?.tags || [])]));
  const mergedPhotos = Array.from(new Set([...(local?.photos || []), ...(remote?.photos || [])]));
  const preferRemote = remoteUpdatedAt >= localUpdatedAt;

  return normalizeEntry({
    id: local?.id || remote?.id,
    text: mergedText,
    mood: preferRemote ? remote?.mood : local?.mood,
    tags: mergedTags,
    photos: mergedPhotos,
    hibiNote: preferRemote ? remote?.hibiNote : local?.hibiNote,
    starred: Boolean(local?.starred || remote?.starred),
    updatedAt: Math.max(localUpdatedAt, remoteUpdatedAt),
  });
}

export function applyConflictChoices(localEntries = [], remoteEntries = [], choices = {}, normalizeEntry = defaultNormalize) {
  const rows = buildConflictRows(localEntries, remoteEntries, normalizeEntry);
  return rows
    .map((row) => {
      const choice = choices[row.key] || "merged";
      if (choice === "local") return row.local ? normalizeEntry(row.local) : null;
      if (choice === "remote") return row.remote ? normalizeEntry(row.remote) : null;
      return mergeConflictEntry(row.local, row.remote, normalizeEntry);
    })
    .filter(Boolean)
    .sort((a, b) => (Number(b?.updatedAt) || 0) - (Number(a?.updatedAt) || 0));
}