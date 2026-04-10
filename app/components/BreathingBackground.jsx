"use client";

import { useReducedMotion } from "@/lib/hooks/useReducedMotion";

/**
 * Ambient pulsating/breathing background layers.
 * Place as the first child inside a `<main>` that has
 * `position: "relative"` and `overflow: "hidden"`.
 */
export default function BreathingBackground({ nightMode }) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return null;

  const ease = "cubic-bezier(0.45,0.05,0.55,0.95)";

  return (
    <>
      {/* Primary breath — full-screen tint pulse */}
      <div
        aria-hidden
        style={{
          "--breath-lo": nightMode ? "0.04" : "0.06",
          "--breath-hi": nightMode ? "0.10" : "0.13",
          "--breath-blur-lo": "80px",
          "--breath-blur-hi": "100px",
          position: "absolute",
          inset: "-20%",
          borderRadius: "50%",
          background: nightMode
            ? "radial-gradient(ellipse at 40% 45%, rgba(90,174,126,0.22), rgba(46,125,50,0.06) 55%, transparent 80%)"
            : "radial-gradient(ellipse at 40% 45%, rgba(90,174,126,0.28), rgba(46,125,50,0.08) 55%, transparent 80%)",
          animation: `breathPulse 12s ${ease} infinite, breathDrift 32s ${ease} infinite`,
          pointerEvents: "none",
          zIndex: -1,
        }}
      />
      {/* Secondary breath — warm counter-drift */}
      <div
        aria-hidden
        style={{
          "--breath-lo": nightMode ? "0.03" : "0.05",
          "--breath-hi": nightMode ? "0.08" : "0.11",
          "--breath-blur-lo": "90px",
          "--breath-blur-hi": "110px",
          position: "absolute",
          inset: "-15%",
          borderRadius: "50%",
          background: nightMode
            ? "radial-gradient(ellipse at 65% 60%, rgba(224,143,109,0.15), rgba(180,120,80,0.04) 50%, transparent 78%)"
            : "radial-gradient(ellipse at 65% 60%, rgba(224,163,109,0.20), rgba(180,140,80,0.06) 50%, transparent 78%)",
          animation: `breathPulse 14s ${ease} infinite -4s, breathDrift 38s ${ease} infinite reverse`,
          pointerEvents: "none",
          zIndex: -1,
        }}
      />
      {/* Tertiary — subtle hue-shifting veil */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: "-10%",
          borderRadius: "40%",
          background: nightMode
            ? "radial-gradient(ellipse at 50% 40%, rgba(90,140,126,0.07), transparent 65%)"
            : "radial-gradient(ellipse at 50% 40%, rgba(90,160,126,0.10), transparent 65%)",
          animation: `breathHueShift 28s ${ease} infinite`,
          pointerEvents: "none",
          zIndex: -1,
        }}
      />
    </>
  );
}
