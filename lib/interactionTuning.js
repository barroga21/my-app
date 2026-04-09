export const INTERACTION_TUNING = {
  pullToRefresh: {
    distance: 96,
    maxSideDrift: 36,
    hapticMs: 14,
    completeDelayMs: 450,
  },
  swipeDelete: {
    distance: 100,
    maxVerticalDrift: 18,
    maxDurationMs: 520,
    minSpeedPxPerMs: 0.24,
  },
  haptics: {
    journalDeleteMs: 12,
    habitDeleteMs: 10,
    habitCheckMs: 22,
  },
};

export function triggerHaptic(durationMs) {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(durationMs);
  }
}

export function shouldTriggerPullRefresh(start, touch, config = INTERACTION_TUNING.pullToRefresh) {
  const dy = touch.clientY - start.y;
  const dx = Math.abs(touch.clientX - start.x);
  return dy > config.distance && dx < config.maxSideDrift;
}

export function shouldTriggerSwipeDelete(start, touch, config = INTERACTION_TUNING.swipeDelete) {
  const dx = touch.clientX - start.x;
  const dy = Math.abs(touch.clientY - start.y);
  const dt = Math.max(1, Date.now() - start.at);
  const speed = Math.abs(dx) / dt;

  return (
    dx < -config.distance &&
    dy < config.maxVerticalDrift &&
    dt < config.maxDurationMs &&
    speed > config.minSpeedPxPerMs
  );
}
