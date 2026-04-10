import { beforeEach, describe, expect, it } from "vitest";
import {
  hasSeenHabitTips,
  markHabitTipsSeen,
  readArchivedHabits,
  readHabitCloseouts,
  readHabitColors,
  readHabitNotes,
  readVacationDays,
  writeHabitCloseouts,
  writeHabitColors,
  writeHabitNotes,
  writeVacationDays,
} from "../lib/repositories/habitsRepo";
import {
  readCalendarHabitChecks,
  readCalendarHabitList,
  readCalendarNotes,
  readCalendarRitual,
  readJournalMoodMap,
  writeCalendarNotes,
  writeCalendarRitual,
} from "../lib/repositories/calendarRepo";

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

describe("habits repository", () => {
  it("reads and writes colors", () => {
    writeHabitColors("u1", { Read: "#22c55e" });
    expect(readHabitColors("u1")).toEqual({ Read: "#22c55e" });
  });

  it("reads and writes vacation days", () => {
    const days = new Set(["2026-04-01", "2026-04-02"]);
    writeVacationDays("u1", days);
    expect(readVacationDays("u1")).toEqual(days);
  });

  it("tracks habit tips seen state", () => {
    expect(hasSeenHabitTips("u1")).toBe(false);
    markHabitTipsSeen("u1");
    expect(hasSeenHabitTips("u1")).toBe(true);
  });

  it("reads and writes closeouts and notes", () => {
    const closeouts = { "2026-04-09": { helped: "Walk", slowed: "Phone", carry: "Start early" } };
    const notes = { "Read-9": "Felt focused" };

    writeHabitCloseouts("u1", 2026, 3, closeouts);
    writeHabitNotes("u1", 2026, 3, notes);

    expect(readHabitCloseouts("u1", 2026, 3)).toEqual(closeouts);
    expect(readHabitNotes("u1", 2026, 3)).toEqual(notes);
  });

  it("sanitizes archived habits", () => {
    localStorage.setItem("habit_archived_u1", JSON.stringify(["Read", 12, null, "Walk"]));
    expect(readArchivedHabits("u1")).toEqual(["Read", "Walk"]);
  });
});

describe("calendar repository", () => {
  it("reads and writes calendar notes and ritual payload", () => {
    const notes = { "2026-04-09": "Solid day" };
    const ritual = {
      todosByDate: { "2026-04-09": [{ text: "Read", done: true }] },
      moodByDate: { "2026-04-09": "steady" },
      reflectionByDate: { "2026-04-09": "Small wins" },
      photosByDate: { "2026-04-09": ["sb://hibi-media/calendar/u1/a.jpg"] },
    };

    writeCalendarNotes("u1", 2026, 3, notes);
    writeCalendarRitual("u1", 2026, 3, ritual);

    expect(readCalendarNotes("u1", 2026, 3)).toEqual(notes);
    expect(readCalendarRitual("u1", 2026, 3)).toEqual(ritual);
  });

  it("merges backup and primary habit checks", () => {
    localStorage.setItem("hibi_habit_checks_backup_u1_2026_04", JSON.stringify({ "Read-9": "dot", "Walk-9": "fill" }));
    localStorage.setItem("habit_checks_u1_2026_04", JSON.stringify({ "Read-9": "fill", "Meditate-9": "dot" }));

    expect(readCalendarHabitChecks("u1", 2026, 3)).toEqual({
      "Read-9": "fill",
      "Walk-9": "fill",
      "Meditate-9": "dot",
    });
  });

  it("reads sanitized habit list and journal mood map", () => {
    localStorage.setItem("habit_list_u1", JSON.stringify(["Read", 8, "Walk"]));
    localStorage.setItem("hibi_journal_u1_2026_all", JSON.stringify({ "2026-04-09": [{ mood: "warm" }] }));

    expect(readCalendarHabitList("u1")).toEqual(["Read", "Walk"]);
    expect(readJournalMoodMap("u1", 2026)).toEqual({ "2026-04-09": [{ mood: "warm" }] });
  });
});
