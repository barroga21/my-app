import { describe, expect, it, vi } from "vitest";
import {
  INTERACTION_TUNING,
  shouldTriggerPullRefresh,
  shouldTriggerSwipeDelete,
} from "../lib/interactionTuning";

describe("interaction tuning", () => {
  it("triggers pull-to-refresh only for sufficient vertical drag", () => {
    const start = { x: 100, y: 20, at: 0 };

    expect(shouldTriggerPullRefresh(start, { clientX: 102, clientY: 130 })).toBe(true);
    expect(shouldTriggerPullRefresh(start, { clientX: 170, clientY: 130 })).toBe(false);
    expect(shouldTriggerPullRefresh(start, { clientX: 101, clientY: 70 })).toBe(false);
  });

  it("triggers swipe-delete only with fast left swipe and low drift", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(300);
    const start = { x: 220, y: 60, at: 0 };

    expect(shouldTriggerSwipeDelete(start, { clientX: 90, clientY: 64 }, INTERACTION_TUNING.swipeDelete)).toBe(true);
    expect(shouldTriggerSwipeDelete(start, { clientX: 130, clientY: 80 }, INTERACTION_TUNING.swipeDelete)).toBe(false);

    nowSpy.mockRestore();
  });
});
