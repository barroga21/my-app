import { describe, expect, it } from "vitest";
import { mergeDayEntries, resolveEntryConflict, summarizeConflict } from "../lib/offline";

describe("offline conflict policy", () => {
  it("prefers latest update by default", () => {
    const local = { id: "a", text: "local", updatedAt: 10 };
    const remote = { id: "a", text: "remote", updatedAt: 20 };
    const resolved = resolveEntryConflict(local, remote);
    expect(resolved.text).toBe("remote");
  });

  it("merges text and metadata deterministically", () => {
    const local = { id: "a", text: "I felt calm", tags: ["gratitude"], updatedAt: 10 };
    const remote = { id: "a", text: "I felt nervous", tags: ["work"], updatedAt: 30 };
    const resolved = resolveEntryConflict(local, remote, "merge");
    expect(resolved.text.includes("Local:")).toBe(true);
    expect(resolved.text.includes("Remote:")).toBe(true);
    expect(resolved.tags).toEqual(["gratitude", "work"]);
  });

  it("builds merged day entries from local and remote sets", () => {
    const local = [{ id: "a", text: "one", updatedAt: 1 }];
    const remote = [{ id: "a", text: "two", updatedAt: 2 }, { id: "b", text: "three", updatedAt: 3 }];
    const merged = mergeDayEntries(local, remote, "prefer-latest");
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe("b");
  });

  it("summarizes overlap and uniqueness", () => {
    const summary = summarizeConflict(
      [{ id: "a" }, { id: "b" }],
      [{ id: "a" }, { id: "c" }, { id: "d" }]
    );
    expect(summary.overlapCount).toBe(1);
    expect(summary.uniqueLocal).toBe(1);
    expect(summary.uniqueRemote).toBe(2);
  });
});
