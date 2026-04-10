import { describe, expect, it } from "vitest";
import { applyConflictChoices, buildConflictRows } from "../lib/offline/conflictResolution";

function normalizeEntry(raw) {
  return {
    id: raw?.id || "",
    text: typeof raw?.text === "string" ? raw.text : "",
    mood: typeof raw?.mood === "string" ? raw.mood : "neutral",
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
    photos: Array.isArray(raw?.photos) ? raw.photos : [],
    hibiNote: typeof raw?.hibiNote === "string" ? raw.hibiNote : "",
    starred: raw?.starred === true,
    updatedAt: typeof raw?.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

describe("journal conflict resolution selection flow", () => {
  it("applies explicit local/remote/merged selections deterministically", () => {
    const localEntries = [
      { id: "shared", text: "local shared text", mood: "deep", tags: ["local"], updatedAt: 100 },
      { id: "local-only", text: "keep local", mood: "warm", updatedAt: 90 },
    ];
    const remoteEntries = [
      { id: "shared", text: "remote shared text", mood: "cool", tags: ["remote"], updatedAt: 120 },
      { id: "remote-only", text: "keep remote", mood: "neutral", updatedAt: 95 },
    ];

    const rows = buildConflictRows(localEntries, remoteEntries, normalizeEntry);
    const choices = {
      shared: "merged",
      "local-only": "local",
      "remote-only": "remote",
    };

    const resolved = applyConflictChoices(localEntries, remoteEntries, choices, normalizeEntry);

    expect(rows).toHaveLength(3);
    expect(resolved).toHaveLength(3);

    const mergedShared = resolved.find((entry) => entry.id === "shared");
    expect(mergedShared.text).toContain("Local:");
    expect(mergedShared.text).toContain("Remote:");
    expect(mergedShared.tags).toEqual(expect.arrayContaining(["local", "remote"]));
    expect(mergedShared.updatedAt).toBe(120);

    expect(resolved.find((entry) => entry.id === "local-only")?.text).toBe("keep local");
    expect(resolved.find((entry) => entry.id === "remote-only")?.text).toBe("keep remote");
  });
});