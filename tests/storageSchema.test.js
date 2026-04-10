import { describe, expect, it } from "vitest";
import {
  sanitizeHabitChecksMap,
  sanitizeJournalEntriesMap,
  sanitizeStringArray,
} from "../lib/storageSchema";

describe("storage schema guards", () => {
  it("sanitizes journal entries map and removes invalid records", () => {
    const input = {
      "2026-03-03": [
        { id: "a", text: "hello", mood: "warm", tags: ["tag"], photos: [], starred: true, updatedAt: 1 },
        { id: "b", text: "", tags: [], photos: [] },
      ],
      "bad-date": [{ text: "ignored" }],
    };

    const result = sanitizeJournalEntriesMap(input);
    expect(Object.keys(result)).toEqual(["2026-03-03"]);
    expect(result["2026-03-03"]).toHaveLength(1);
    expect(result["2026-03-03"][0].id).toBe("a");
  });

  it("keeps only supported habit check states", () => {
    const result = sanitizeHabitChecksMap({ "Read-1": "dot", "Read-2": "fill", "Read-3": "oops" });
    expect(result).toEqual({ "Read-1": "dot", "Read-2": "fill" });
  });

  it("sanitizes string arrays", () => {
    const result = sanitizeStringArray(["one", 2, "three", null]);
    expect(result).toEqual(["one", "three"]);
  });
});
