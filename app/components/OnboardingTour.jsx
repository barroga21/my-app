"use client";
import React, { useEffect, useRef, useState } from "react";

const TOUR_STEPS = [
  {
    target: ".hibi-home-stat-tiles",
    title: "Your Stats",
    body: "Track your rhythm, streaks, and words written at a glance.",
    position: "bottom",
  },
  {
    target: ".hibi-home-cta-row",
    title: "Quick Access",
    body: "Jump straight into your habit studio or journal from here.",
    position: "top",
  },
  {
    target: ".hibi-top-nav",
    title: "Navigate Hibi",
    body: "Switch between Calendar, Habits, Journal, Review, and Profile.",
    position: "bottom",
  },
  {
    target: ".hibi-quick-actions",
    title: "Quick Actions",
    body: "Journal, search, review, or browse tags — all one tap away.",
    position: "top",
  },
];

const SEEN_KEY = (userId) => `hibi_onboarding_tour_seen_${userId}`;

export default function OnboardingTour({ userId, nightMode }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const tooltipRef = useRef(null);

  useEffect(() => {
    if (!userId) return;
    const seen = localStorage.getItem(SEEN_KEY(userId));
    if (seen) return;

    // Delay tour start for page to render
    const timer = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(timer);
  }, [userId]);

  useEffect(() => {
    if (!visible) return;
    const current = TOUR_STEPS[step];
    if (!current) return;

    const el = document.querySelector(current.target);
    if (!el) {
      // Skip missing targets
      if (step < TOUR_STEPS.length - 1) setStep(step + 1);
      else finishTour();
      return;
    }

    const rect = el.getBoundingClientRect();
    setPos({
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height,
    });

    // Scroll into view
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [step, visible]);

  function finishTour() {
    setVisible(false);
    if (userId) localStorage.setItem(SEEN_KEY(userId), "1");
  }

  function nextStep() {
    if (step < TOUR_STEPS.length - 1) setStep(step + 1);
    else finishTour();
  }

  function skipTour() {
    finishTour();
  }

  if (!visible || step >= TOUR_STEPS.length) return null;

  const current = TOUR_STEPS[step];
  const isBottom = current.position === "bottom";

  const tooltipStyle = {
    position: "absolute",
    top: isBottom ? pos.top + pos.height + 12 : pos.top - 12,
    left: Math.max(16, pos.left + pos.width / 2 - 160),
    transform: isBottom ? "none" : "translateY(-100%)",
    width: 320,
    maxWidth: "calc(100vw - 32px)",
    background: nightMode ? "#1a1f28" : "#fff",
    border: `1.5px solid ${nightMode ? "rgba(34,197,94,0.3)" : "rgba(46,125,50,0.2)"}`,
    borderRadius: 16,
    padding: "18px 20px",
    boxShadow: nightMode ? "0 12px 40px rgba(0,0,0,0.6)" : "0 12px 40px rgba(0,0,0,0.12)",
    zIndex: 1300,
  };

  return (
    <>
      {/* Dim overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1250,
          pointerEvents: "none",
        }}
      />

      {/* Spotlight cutout */}
      <div
        style={{
          position: "absolute",
          top: pos.top - 4,
          left: pos.left - 4,
          width: pos.width + 8,
          height: pos.height + 8,
          borderRadius: 12,
          boxShadow: `0 0 0 9999px rgba(0,0,0,${nightMode ? "0.5" : "0.3"})`,
          zIndex: 1260,
          pointerEvents: "none",
        }}
      />

      {/* Tooltip */}
      <div ref={tooltipRef} style={tooltipStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 1,
            color: nightMode ? "#4ade80" : "#2e7d32",
          }}>
            Step {step + 1} of {TOUR_STEPS.length}
          </span>
          <button
            onClick={skipTour}
            style={{
              border: "none",
              background: "transparent",
              color: nightMode ? "#6a7a6a" : "#999",
              fontSize: 12,
              cursor: "pointer",
              padding: "2px 6px",
            }}
          >
            Skip
          </button>
        </div>
        <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: nightMode ? "#e9ecef" : "#0d2a14" }}>
          {current.title}
        </h3>
        <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.5, color: nightMode ? "#8a9e8a" : "#4a7a50" }}>
          {current.body}
        </p>

        {/* Progress dots */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ display: "flex", gap: 4, flex: 1 }}>
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: i <= step
                    ? (nightMode ? "#22c55e" : "#2e7d32")
                    : (nightMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"),
                  transition: "background 0.3s ease",
                }}
              />
            ))}
          </div>
          <button
            onClick={nextStep}
            style={{
              border: "none",
              background: nightMode ? "#22c55e" : "#2e7d32",
              color: "#fff",
              padding: "8px 16px",
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {step < TOUR_STEPS.length - 1 ? "Next" : "Done!"}
          </button>
        </div>
      </div>
    </>
  );
}
