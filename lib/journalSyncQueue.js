const MAX_RETRIES = 4;
const MAX_BACKOFF_MS = 5000;

function queueStorageKey(userId) {
  return `hibi_journal_sync_queue_${userId}`;
}

function statusStorageKey(userId) {
  return `hibi_journal_sync_status_${userId}`;
}

function parseQueue(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.date === "string" && Array.isArray(item.entries));
  } catch {
    return [];
  }
}

export function createJournalSyncQueue(supabase, userId) {
  let running = false;
  const queue = typeof localStorage !== "undefined" ? parseQueue(localStorage.getItem(queueStorageKey(userId))) : [];
  let status = "idle";

  function persistQueue() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(queueStorageKey(userId), JSON.stringify(queue));
    } catch {
      // ignore storage quota failures
    }
  }

  async function fetchRemoteUpdatedAt(date) {
    const { data, error } = await supabase
      .from("journal_entries")
      .select("updated_at")
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle();

    if (error) throw error;
    if (!data?.updated_at) return null;
    const parsed = new Date(data.updated_at).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  function setStatus(nextStatus, meta = {}) {
    status = nextStatus;
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(
          statusStorageKey(userId),
          JSON.stringify({ state: nextStatus, pending: queue.length, ts: Date.now() })
        );
      } catch {
        // ignore storage quota failures
      }
    }
    if (typeof meta.onStatusChange === "function") {
      meta.onStatusChange({
        state: nextStatus,
        pending: queue.length,
      });
    }
  }

  async function processQueue(onStatusChange) {
    if (running || !supabase || !userId) return;
    running = true;

    let processedAny = false;
    const cycleCount = queue.length;
    if (cycleCount) {
      setStatus("syncing", { onStatusChange });
    }

    for (let i = 0; i < cycleCount; i++) {
      if (!queue.length) break;
      const item = queue.shift();
      const now = Date.now();

      if (item.nextAttemptAt && item.nextAttemptAt > now) {
        queue.push(item);
        continue;
      }

      try {
        const remoteUpdatedAt = await fetchRemoteUpdatedAt(item.date);
        if (!item.force && remoteUpdatedAt && item.localUpdatedAt && remoteUpdatedAt > item.localUpdatedAt) {
          processedAny = true;
          setStatus("conflict", { onStatusChange });
          if (typeof item.onConflict === "function") {
            item.onConflict({ date: item.date, remoteUpdatedAt, localUpdatedAt: item.localUpdatedAt });
          }
          continue;
        }

        await supabase.from("journal_entries").upsert(
          {
            user_id: userId,
            date: item.date,
            entries: item.entries,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,date" }
        );
        processedAny = true;
        if (typeof item.onSynced === "function") {
          item.onSynced({ date: item.date });
        }
        setStatus(queue.length ? "syncing" : "synced", { onStatusChange });
      } catch {
        if (item.retry < MAX_RETRIES) {
          const nextRetry = item.retry + 1;
          setStatus("retrying", { onStatusChange });
          const nextAttemptAt = Date.now() + Math.min(MAX_BACKOFF_MS, 250 * Math.pow(2, nextRetry));
          queue.push({ ...item, retry: nextRetry, nextAttemptAt });
          setStatus("syncing", { onStatusChange });
        } else {
          queue.push({ ...item, nextAttemptAt: Date.now() + MAX_BACKOFF_MS });
          setStatus("error", { onStatusChange });
        }
      }

      persistQueue();
    }

    running = false;

    if (!queue.length) {
      setStatus("idle", { onStatusChange });
      persistQueue();
    } else if (!processedAny || status === "error" || status === "retrying") {
      setStatus(status === "conflict" ? "conflict" : "retrying", { onStatusChange });
      persistQueue();
    }
  }

  return {
    enqueue(date, entries, options = {}) {
      const existingIndex = queue.findIndex((item) => item.date === date);
      const payload = {
        date,
        entries,
        retry: 0,
        nextAttemptAt: 0,
        localUpdatedAt: Number(options.localUpdatedAt) || Date.now(),
        force: options.force === true,
        onConflict: options.onConflict,
        onSynced: options.onSynced,
      };
      if (existingIndex >= 0) {
        queue.splice(existingIndex, 1, payload);
      } else {
        queue.push(payload);
      }
      persistQueue();
      processQueue(options.onStatusChange);
    },
    resume(options = {}) {
      processQueue(options.onStatusChange);
    },
    pendingCount() {
      return queue.length;
    },
  };
}
