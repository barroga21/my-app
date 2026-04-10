import { beforeEach, describe, expect, it } from "vitest";
import {
  ensureOfflineStore,
  enqueueOfflineOp,
  offlineSchema,
  readOfflineStore,
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

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: makeStorage(),
    configurable: true,
    writable: true,
  });
});

describe("offline schema", () => {
  it("creates a current-version store", () => {
    const db = ensureOfflineStore("u1");
    expect(db.version).toBe(offlineSchema.CURRENT_VERSION);
    expect(db.sync.queue).toEqual([]);
    expect(db.journal.byDate).toEqual({});
  });

  it("imports legacy journal queue into offline store", () => {
    localStorage.setItem("hibi_journal_sync_queue_u1", JSON.stringify([
      { date: "2026-04-10", entries: [{ id: "e1", text: "hello" }], retry: 1 },
    ]));

    const db = ensureOfflineStore("u1");
    expect(db.sync.queue).toHaveLength(1);
    expect(db.sync.queue[0].payload.date).toBe("2026-04-10");
  });

  it("persists queued operations", () => {
    ensureOfflineStore("u1");
    enqueueOfflineOp("u1", {
      id: "op_1",
      type: "journal-day-upsert",
      status: "queued",
      payload: { date: "2026-04-11", entries: [] },
    });

    const db = readOfflineStore("u1");
    expect(db.sync.queue).toHaveLength(1);
    expect(db.sync.queue[0].id).toBe("op_1");
  });
});
