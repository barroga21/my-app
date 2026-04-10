import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveAuthBootstrapState,
  resolveAuthSessionState,
} from "../lib/hooks/useAuthBootstrap";
import { createJournalSyncQueue } from "../lib/journalSyncQueue";
import {
  readMonthHabitChecks,
  writeMonthHabitChecks,
} from "../lib/repositories/habitsRepo";
import {
  readCalendarNotes,
  readCalendarRitual,
  writeCalendarNotes,
  writeCalendarRitual,
} from "../lib/repositories/calendarRepo";

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

describe("auth bootstrap critical flow", () => {
  it("redirects for missing user when guest mode is off", () => {
    expect(resolveAuthBootstrapState({ user: null, allowGuest: false })).toEqual({
      authReady: false,
      userId: null,
      user: null,
      shouldRedirect: true,
    });
  });

  it("allows guest mode and resolves session transitions", () => {
    expect(resolveAuthBootstrapState({ user: null, allowGuest: true })).toEqual({
      authReady: true,
      userId: null,
      user: null,
      shouldRedirect: false,
    });

    expect(resolveAuthSessionState({ sessionUser: { id: "u1", email: "a@b.com" }, allowGuest: false })).toEqual({
      user: { id: "u1", email: "a@b.com" },
      userId: "u1",
      shouldRedirect: false,
    });
  });
});

describe("journal save/sync critical flow", () => {
  it("persists queue for offline resume and flushes later", async () => {
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

    const queue = createJournalSyncQueue(supabase, "u1");
    queue.enqueue("2026-04-09", [{ id: "e1", text: "draft", updatedAt: 101 }], {
      localUpdatedAt: 101,
    });

    await flushAsyncQueue();

    expect(upsert).toHaveBeenCalledTimes(1);
    const persisted = JSON.parse(localStorage.getItem("hibi_journal_sync_queue_u1") || "[]");
    expect(persisted).toEqual([]);
  });

  it("detects stale remote writes and reports conflict without overwriting", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { updated_at: "2026-04-09T12:00:00.000Z" },
      error: null,
    });
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
    const onConflict = vi.fn();
    const queue = createJournalSyncQueue(supabase, "u1");

    queue.enqueue("2026-04-09", [{ id: "e1", text: "older", updatedAt: 100 }], {
      localUpdatedAt: 100,
      onStatusChange: ({ state }) => statuses.push(state),
      onConflict,
    });

    await flushAsyncQueue();

    expect(upsert).not.toHaveBeenCalled();
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(statuses).toContain("conflict");
  });

  it("retries failed sync work and succeeds after backoff window", async () => {
    let nowTick = 1000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowTick);

    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const upsert = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary network error"))
      .mockResolvedValueOnce({ error: null });

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

    queue.enqueue("2026-04-09", [{ id: "e1", text: "retry me", updatedAt: 100 }], {
      localUpdatedAt: 100,
      onStatusChange: ({ state }) => statuses.push(state),
    });

    await flushAsyncQueue();

    const queuedAfterFailure = JSON.parse(localStorage.getItem("hibi_journal_sync_queue_u1") || "[]");
    expect(queuedAfterFailure).toHaveLength(1);
    expect(queuedAfterFailure[0].retry).toBe(1);
    expect(statuses).toContain("retrying");

    nowTick = Number(queuedAfterFailure[0].nextAttemptAt) + 5;
    queue.resume({ onStatusChange: ({ state }) => statuses.push(state) });
    await flushAsyncQueue();

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem("hibi_journal_sync_queue_u1") || "[]")).toEqual([]);
    expect(statuses).toContain("idle");

    nowSpy.mockRestore();
  });
});

describe("habit toggle persistence critical flow", () => {
  it("persists month habit checks into primary+backup and reloads merged state", () => {
    writeMonthHabitChecks("u1", 2026, 3, { "Read-9": "dot", "Walk-9": "fill" });

    expect(readMonthHabitChecks("u1", 2026, 3)).toEqual({ "Read-9": "dot", "Walk-9": "fill" });
  });
});

describe("calendar day update critical flow", () => {
  it("updates notes and ritual payload for selected day", () => {
    writeCalendarNotes("u1", 2026, 3, { "2026-04-09": "Reflection" });
    writeCalendarRitual("u1", 2026, 3, {
      todosByDate: { "2026-04-09": [{ text: "Walk", done: true }] },
      moodByDate: { "2026-04-09": "warm" },
      reflectionByDate: { "2026-04-09": "Good energy" },
      photosByDate: { "2026-04-09": ["sb://hibi-media/calendar/u1/x.jpg"] },
    });

    expect(readCalendarNotes("u1", 2026, 3)).toEqual({ "2026-04-09": "Reflection" });
    expect(readCalendarRitual("u1", 2026, 3).moodByDate["2026-04-09"]).toBe("warm");
  });
});
