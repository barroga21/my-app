import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendSyncHistory,
  createOfflineSyncWorker,
  ensureOfflineStore,
  getSyncInspectorSnapshot,
} from "../lib/offline";

function makeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index) => Array.from(store.keys())[index] || null,
    get length() {
      return store.size;
    },
  };
}

async function flushAsyncQueue() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: makeStorage(),
    configurable: true,
    writable: true,
  });
});

describe("offline sync worker", () => {
  it("queues, syncs, and records history", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const queryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
      upsert,
    };
    const supabase = { from: () => queryBuilder };

    ensureOfflineStore("u1");

    const statuses = [];
    const worker = createOfflineSyncWorker({
      supabase,
      userId: "u1",
      onStatusChange: ({ state }) => statuses.push(state),
    });

    worker.enqueue("2026-04-10", [{ id: "e1", text: "entry" }], {});
    await flushAsyncQueue();

    expect(upsert).toHaveBeenCalledTimes(1);

    const inspector = getSyncInspectorSnapshot("u1");
    expect(inspector.stateCounts.synced).toBeGreaterThanOrEqual(1);
    expect(inspector.pending).toBeGreaterThanOrEqual(0);
    expect(statuses.includes("syncing")).toBe(true);
  });

  it("replays failed operations and records replay audit", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const queryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
      upsert,
    };
    const supabase = { from: () => queryBuilder };

    ensureOfflineStore("u1");
    appendSyncHistory("u1", {
      id: "history_conflict_1",
      type: "journal-day-upsert",
      status: "conflict",
      payload: {
        date: "2026-04-10",
        entries: [{ id: "e1", text: "local conflict" }],
        localUpdatedAt: 100,
      },
    });
    appendSyncHistory("u1", {
      id: "history_error_1",
      type: "journal-day-upsert",
      status: "error",
      payload: {
        date: "2026-04-11",
        entries: [{ id: "e2", text: "local error" }],
        localUpdatedAt: 110,
      },
    });

    const worker = createOfflineSyncWorker({
      supabase,
      userId: "u1",
    });

    const replayedCount = worker.replayFailed({ force: true });
    await flushAsyncQueue();
    worker.resume();
    await flushAsyncQueue();

    expect(replayedCount).toBe(2);
    expect(upsert).toHaveBeenCalledTimes(2);

    const inspector = getSyncInspectorSnapshot("u1");
    expect(inspector.replay[0].replayedCount).toBe(2);
    expect(Number(inspector.stateCounts.synced) || 0).toBeGreaterThanOrEqual(2);
    expect(inspector.pending).toBeGreaterThanOrEqual(0);
  });
});
