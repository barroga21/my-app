import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOneThing,
  getOneThing,
  setOneThing,
} from "../lib/repositories/homeOneThingRepo";
import {
  getJournalSidebarWidth,
  getJournalWordGoal,
  hasSeenJournalTips,
  markJournalTipsSeen,
  readJournalYearMap,
  setJournalSidebarWidth,
  setJournalWordGoal,
  writeJournalYearMap,
} from "../lib/repositories/journalSettingsRepo";
import { createJournalSyncQueue } from "../lib/journalSyncQueue";

async function flushAsyncQueue() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

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
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: makeStorage(),
    configurable: true,
    writable: true,
  });
});

describe("home one-thing repository", () => {
  it("sets, reads, and clears one thing", () => {
    const date = new Date("2026-04-10T12:00:00Z");
    setOneThing("u1", date, "Take a 20 minute walk");

    expect(getOneThing("u1", date)).toBe("Take a 20 minute walk");

    clearOneThing("u1", date);
    expect(getOneThing("u1", date)).toBe("");
  });
});

describe("journal settings repository", () => {
  it("clamps and persists sidebar width", () => {
    setJournalSidebarWidth("u1", 999);
    expect(getJournalSidebarWidth("u1", 200)).toBe(360);

    setJournalSidebarWidth("u1", 120);
    expect(getJournalSidebarWidth("u1", 200)).toBe(170);
  });

  it("tracks journal tips state and word goal", () => {
    expect(hasSeenJournalTips("u1")).toBe(false);
    markJournalTipsSeen("u1");
    expect(hasSeenJournalTips("u1")).toBe(true);

    setJournalWordGoal("u1", 250);
    expect(getJournalWordGoal("u1")).toBe(250);
  });

  it("reads and writes yearly journal map safely", () => {
    const payload = {
      "2026-04-10": [
        { id: "entry_1", text: "hello", mood: "neutral", tags: [], photos: [], starred: false },
      ],
    };

    writeJournalYearMap("u1", 2026, payload);
    expect(readJournalYearMap("u1", 2026)).toEqual(payload);
  });
});

describe("journal sync queue", () => {
  it("emits sync status changes during successful sync", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const queryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
      upsert,
    };
    const supabase = {
      from: () => queryBuilder,
    };

    const statuses = [];
    const queue = createJournalSyncQueue(supabase, "u1");

    queue.enqueue(
      "2026-04-10",
      [{ id: "e1", text: "entry" }],
      {
        onStatusChange: ({ state }) => statuses.push(state),
      }
    );

    await flushAsyncQueue();

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(statuses).toContain("syncing");
    expect(statuses).toContain("synced");
    expect(statuses).toContain("idle");
  });
});
