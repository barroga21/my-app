"use client";
import React, { useEffect, useState } from "react";

const MILESTONES = [7, 14, 21, 30, 50, 75, 100, 150, 200, 365];

const MESSAGES = {
  7: "One week strong! 🌱 You're building something real.",
  14: "Two weeks! 🌿 Your consistency is showing.",
  21: "21 days — a habit is born! 🎯",
  30: "A full month! 🌟 That's extraordinary discipline.",
  50: "50 days! 🔥 You're in rare territory.",
  75: "75 days! 💎 Less than 10% make it this far.",
  100: "100 DAYS! 🏆 You're unstoppable.",
  150: "150 days! 🌊 This is who you are now.",
  200: "200 days! ⭐ Truly remarkable dedication.",
  365: "ONE FULL YEAR! 🎉🏅 You did the impossible.",
};

/**
 * Shows a celebration when the user hits a streak milestone.
 */
export default function MilestoneCelebration({ streak, journalStreak, nightMode }) {
  const [show, setShow] = useState(false);
  const [milestoneType, setMilestoneType] = useState(null);
  const [milestoneValue, setMilestoneValue] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;

    const checkKey = (type, value) => {
      const key = `hibi_milestone_seen_${type}_${value}`;
      if (localStorage.getItem(key)) return false;
      return true;
    };

    // Check habit streak milestones
    for (const ms of MILESTONES) {
      if (streak >= ms && checkKey("habit", ms)) {
        setMilestoneType("habit");
        setMilestoneValue(ms);
        setShow(true);
        localStorage.setItem(`hibi_milestone_seen_habit_${ms}`, "1");
        return;
      }
    }

    // Check journal streak milestones
    for (const ms of MILESTONES) {
      if (journalStreak >= ms && checkKey("journal", ms)) {
        setMilestoneType("journal");
        setMilestoneValue(ms);
        setShow(true);
        localStorage.setItem(`hibi_milestone_seen_journal_${ms}`, "1");
        return;
      }
    }
  }, [streak, journalStreak, dismissed]);

  if (!show) return null;

  const message = MESSAGES[milestoneValue] || `${milestoneValue} days! Amazing! 🎉`;
  const typeLabel = milestoneType === "habit" ? "Habit Streak" : "Journal Streak";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(8px)",
        animation: "hibiPageEnter 0.4s ease",
      }}
      onClick={() => { setShow(false); setDismissed(true); }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: nightMode
            ? "linear-gradient(145deg, #0f1a14, #14281c)"
            : "linear-gradient(145deg, #f0faf0, #d8f0d8)",
          border: `2px solid ${nightMode ? "rgba(34,197,94,0.4)" : "rgba(46,125,50,0.3)"}`,
          borderRadius: 24,
          padding: "40px 36px",
          maxWidth: 400,
          textAlign: "center",
          boxShadow: nightMode
            ? "0 16px 64px rgba(34,197,94,0.2), 0 0 0 1px rgba(34,197,94,0.1)"
            : "0 16px 64px rgba(46,125,50,0.15)",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 12 }}>
          {milestoneValue >= 100 ? "🏆" : milestoneValue >= 30 ? "🌟" : "🎉"}
        </div>
        <p style={{
          margin: "0 0 4px",
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 1.5,
          color: nightMode ? "#4ade80" : "#2e7d32",
        }}>
          {typeLabel} Milestone
        </p>
        <h2 style={{
          margin: "0 0 8px",
          fontSize: 36,
          fontWeight: 900,
          color: nightMode ? "#e9ecef" : "#0d2a14",
        }}>
          {milestoneValue} Days
        </h2>
        <p style={{
          margin: "0 0 24px",
          color: nightMode ? "#8a9e8a" : "#2e6e34",
          fontSize: 16,
          lineHeight: 1.5,
        }}>
          {message}
        </p>
        <button
          onClick={() => { setShow(false); setDismissed(true); }}
          style={{
            border: "none",
            background: nightMode ? "#22c55e" : "#2e7d32",
            color: "#fff",
            padding: "12px 28px",
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            boxShadow: nightMode ? "0 4px 16px rgba(34,197,94,0.3)" : "0 4px 16px rgba(46,125,50,0.25)",
          }}
        >
          Keep Going! →
        </button>
      </div>
    </div>
  );
}
