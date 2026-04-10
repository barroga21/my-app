"use client";

import { useMemo, useRef } from "react";

export function useLongPress(onLongPress, { delay = 420 } = {}) {
  const timerRef = useRef(null);

  const handlers = useMemo(() => {
    const clear = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const start = (...args) => {
      clear();
      timerRef.current = setTimeout(() => {
        onLongPress?.(...args);
      }, delay);
    };

    return {
      onMouseDown: start,
      onMouseUp: clear,
      onMouseLeave: clear,
      onTouchStart: start,
      onTouchEnd: clear,
      onTouchCancel: clear,
    };
  }, [delay, onLongPress]);

  return handlers;
}
