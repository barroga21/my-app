"use client";

import { useReducedMotion } from "@/lib/hooks/useReducedMotion";

/**
 * Wraps page content with a fade-up entrance animation on mount.
 * Respects prefers-reduced-motion automatically.
 */
export default function PageEntrance({ children, delay = "0ms" }) {
  const reducedMotion = useReducedMotion();

  return (
    <div
      style={{
        animation: reducedMotion
          ? "none"
          : `hibiPageEnter var(--hibi-motion-slow) var(--hibi-ease-enter) both`,
        animationDelay: delay,
      }}
    >
      {children}
    </div>
  );
}
