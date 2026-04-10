import { createJournalSyncQueue } from "@/lib/journalSyncQueue";
import {
  appendSyncHistory,
  enqueueOfflineOp,
  readOfflineStore,
  recordReplayRun,
  replaceQueue,
  setOfflineWorkerState,
} from "@/lib/offline/schema";

function opId() {
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toQueueItem(date, entries, options = {}) {
  return {
    id: opId(),
    type: "journal-day-upsert",
    status: "queued",
    attempts: 0,
    createdAt: new Date().toISOString(),
    payload: {
      date,
      entries,
      localUpdatedAt: Number(options.localUpdatedAt) || Date.now(),
      force: options.force === true,
    },
  };
}

export function createOfflineSyncWorker({ supabase, userId, onStatusChange }) {
  const queue = createJournalSyncQueue(supabase, userId);
  let running = false;

  function emit(state, pending) {
    if (typeof onStatusChange === "function") {
      onStatusChange({ state, pending });
    }
  }

  function pendingCount() {
    return readOfflineStore(userId).sync.queue.length;
  }

  function markQueueStatus(opIdValue, status, patch = {}) {
    const store = readOfflineStore(userId);
    const nextQueue = store.sync.queue.map((op) => {
      if (op.id !== opIdValue) return op;
      return { ...op, status, ...patch };
    });
    replaceQueue(userId, nextQueue);
  }

  function completeQueueOp(opIdValue) {
    const store = readOfflineStore(userId);
    const op = store.sync.queue.find((item) => item.id === opIdValue);
    if (!op) return;
    replaceQueue(userId, store.sync.queue.filter((item) => item.id !== opIdValue));
    appendSyncHistory(userId, { ...op, status: "synced" });
  }

  function enqueue(date, entries, options = {}) {
    const op = toQueueItem(date, entries, options);
    enqueueOfflineOp(userId, op);
    emit("syncing", pendingCount());

    queue.enqueue(date, entries, {
      localUpdatedAt: op.payload.localUpdatedAt,
      force: op.payload.force,
      onStatusChange: ({ state }) => {
        setOfflineWorkerState(userId, state);
        emit(state, pendingCount());
      },
      onConflict: (meta) => {
        markQueueStatus(op.id, "conflict", { attempts: op.attempts + 1, conflictAt: Date.now() });
        appendSyncHistory(userId, {
          ...op,
          status: "conflict",
          conflictMeta: meta,
        });
        if (typeof options.onConflict === "function") {
          options.onConflict(meta);
        }
      },
      onSynced: ({ date: syncedDate }) => {
        completeQueueOp(op.id);
        emit("synced", pendingCount());
        if (typeof options.onSynced === "function") {
          options.onSynced({ date: syncedDate });
        }
      },
    });
  }

  function resume(options = {}) {
    if (running) return;
    running = true;
    setOfflineWorkerState(userId, "syncing");
    queue.resume({
      onStatusChange: ({ state }) => {
        setOfflineWorkerState(userId, state);
        emit(state, pendingCount());
        if (typeof options.onStatusChange === "function") {
          options.onStatusChange({ state, pending: pendingCount() });
        }
      },
    });
    running = false;
  }

  function replayFailed({ force = false } = {}) {
    const store = readOfflineStore(userId);
    const replayable = store.sync.history.filter((op) => op.status === "conflict" || op.status === "error");

    replayable.forEach((op) => {
      enqueue(op.payload.date, op.payload.entries, {
        localUpdatedAt: op.payload.localUpdatedAt,
        force: force || op?.payload?.force === true,
      });
    });

    recordReplayRun(userId, {
      replayedCount: replayable.length,
      force,
    });

    return replayable.length;
  }

  function snapshot() {
    return readOfflineStore(userId);
  }

  return {
    enqueue,
    resume,
    pendingCount,
    replayFailed,
    snapshot,
  };
}
