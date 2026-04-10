"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Animates a number from 0 to `target` over `duration` ms.
 * Starts counting only when `active` is true (combine with useScrollReveal).
 * Returns the current display value as an integer.
 */
export function useAnimatedCounter(target, active = true, duration = 600) {
  const reducedMotion = useReducedMotion();
  const numTarget = typeof target === "number" ? target : parseFloat(target) || 0;
  const skip = !active || reducedMotion || numTarget === 0;

  const valueRef = useRef(0);
  const rafRef = useRef(null);
  const subscribersRef = useRef(new Set());

  useEffect(() => {
    if (skip) {
      valueRef.current = numTarget;
      subscribersRef.current.forEach((cb) => cb());
      return;
    }

    const start = performance.now();
    const t = numTarget;

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) * (1 - progress);
      valueRef.current = Math.round(eased * t);
      subscribersRef.current.forEach((cb) => cb());

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    valueRef.current = 0;
    subscribersRef.current.forEach((cb) => cb());
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [numTarget, skip, duration]);

  return useSyncExternalStore(
    (cb) => {
      subscribersRef.current.add(cb);
      return () => subscribersRef.current.delete(cb);
    },
    () => valueRef.current
  );
}
