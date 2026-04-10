import { readOfflineStore } from "@/lib/offline/schema";
import { summarizeConflict } from "@/lib/offline/conflictPolicy";

export function getSyncInspectorSnapshot(userId) {
  const store = readOfflineStore(userId);
  const queue = store.sync.queue || [];
  const history = store.sync.history || [];

  const stateCounts = history.reduce((acc, item) => {
    const key = item?.status || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    version: store.version,
    pending: queue.length,
    queue,
    recentHistory: history.slice(-30).reverse(),
    replay: (store.sync.replay || []).slice(-20).reverse(),
    stateCounts,
    diagnostics: store.diagnostics,
  };
}

export function explainConflict(localEntries, remoteEntries) {
  const summary = summarizeConflict(localEntries, remoteEntries);
  return `local:${summary.localCount} remote:${summary.remoteCount} overlap:${summary.overlapCount} uniqueLocal:${summary.uniqueLocal} uniqueRemote:${summary.uniqueRemote}`;
}
