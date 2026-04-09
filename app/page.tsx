"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  getStoredNightModePreference,
  isNightModeEnabled,
} from "@/lib/nightModePreference";

const gentlePresences = [
  "Hibi greets you softly. Let today begin gently.",
  "A small beginning is enough. You can build from here.",
  "Quiet progress still counts. Keep your rhythm kind.",
  "You do not need a perfect day, only a present one.",
  "One intentional step can shape the whole day.",
];

const hibiMoodGradient =
  "linear-gradient(135deg, #F4C7A1 0%, #E8DCC2 25%, #C8D8C0 50%, #BFCAD8 75%, #8A94A6 100%)";

export default function HomePage() {
  const [message, setMessage] = useState(gentlePresences[0]);
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("Your");
  const [nightMode, setNightMode] = useState(false);
  const [moodPercent, setMoodPercent] = useState(50);
  const [rhythmLabel, setRhythmLabel] = useState("Steady");
  const [streak, setStreak] = useState(0);
  const router = useRouter();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const seed = useMemo(() => {
    return now.getDate() + now.getMonth() + now.getFullYear() + now.getHours() + now.getMinutes();
  }, [now]);

  useEffect(() => {
    const index = seed % gentlePresences.length;
    setMessage(gentlePresences[index]);
  }, [seed]);

  useEffect(() => {
    const syncNightMode = () => {
      const preference = getStoredNightModePreference();
      setNightMode(isNightModeEnabled(preference));
    };

    syncNightMode();

    const intervalId = window.setInterval(syncNightMode, 60 * 1000);
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === "hibi_night_mode_preference") {
        syncNightMode();
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    function deriveDisplayName(user: any) {
      const rawName =
        user?.user_metadata?.full_name ||
        user?.user_metadata?.display_name ||
        user?.user_metadata?.name ||
        user?.user_metadata?.preferred_name ||
        "";

      const fromMetadata = String(rawName || "").trim();
      if (fromMetadata) return fromMetadata;

      const email = String(user?.email || "").trim();
      if (email.includes("@")) {
        const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
        if (local) {
          return local
            .split(" ")
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");
        }
      }

      return "Your";
    }

    async function loadUser() {
      if (!supabase) {
        setAuthReady(true);
        return;
      }

      const { data } = await supabase.auth.getUser();
      const currentUserId = data?.user?.id || null;
      setUserId(currentUserId);
      setDisplayName(currentUserId ? deriveDisplayName(data?.user) : "Your");
      setAuthReady(true);

      const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
        setUserId(session?.user?.id || null);
        setDisplayName(session?.user ? deriveDisplayName(session.user) : "Your");
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    }

    loadUser();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    const activeUser = userId || "guest";
    const key = `habit_checks_${activeUser}_${year}_${String(month + 1).padStart(2, "0")}`;
    let map = {};

    try {
      const raw = localStorage.getItem(key);
      map = raw ? JSON.parse(raw) : {};
    } catch {
      map = {};
    }

    const doneDays = new Set<number>();
    Object.entries(map).forEach(([habitDay, value]) => {
      if (value !== "dot") return;
      const parts = String(habitDay).split("-");
      const day = Number(parts[parts.length - 1]);
      if (!Number.isNaN(day)) doneDays.add(day);
    });

    const elapsed = now.getDate();
    const doneCount = Array.from(doneDays).filter((day) => day <= elapsed).length;
    const percent = elapsed ? Math.max(8, Math.round((doneCount / elapsed) * 100)) : 50;
    setMoodPercent(Math.min(100, percent));

    let streakCount = 0;
    for (let day = elapsed; day >= 1; day--) {
      if (doneDays.has(day)) {
        streakCount += 1;
      } else {
        break;
      }
    }
    setStreak(streakCount);

    if (percent >= 70) setRhythmLabel("Grounded");
    else if (percent >= 40) setRhythmLabel("Steady");
    else setRhythmLabel("Soft");
  }, [userId, year, month, now]);

  const gentleSuggestion =
    streak >= 5
      ? "Your rhythm is stable. Protect it with one non-negotiable habit today."
      : rhythmLabel === "Soft"
      ? "Keep today light: choose one anchor habit and let that be enough."
      : "Begin with a two-minute start to make momentum easier.";

  const titleName = displayName.trim();
  const possessiveName = titleName.endsWith("s") || titleName.endsWith("S") ? `${titleName}'` : `${titleName}'s`;

  if (!authReady) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: nightMode
            ? "linear-gradient(165deg, #0f1113 0%, #15181c 50%, #1c2025 100%)"
            : "linear-gradient(150deg, #fdf6ec 0%, #e8f5e9 55%, #c8e6c9 100%)",
          color: nightMode ? "#e9ecef" : "#14532d",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Loading Hibi...
      </main>
    );
  }

  if (!userId) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: nightMode
            ? "linear-gradient(165deg, #0f1113 0%, #15181c 50%, #1c2025 100%)"
            : "linear-gradient(150deg, #fdf6ec 0%, #e8f5e9 55%, #c8e6c9 100%)",
        }}
      >
        <section
          style={{
            width: "100%",
            maxWidth: 700,
            background: nightMode ? "#171a1fcc" : "#ffffffcc",
            border: `1px solid ${nightMode ? "#2b3139" : "#dcebdc"}`,
            borderRadius: 22,
            boxShadow: nightMode ? "0 12px 30px #00000066" : "0 12px 30px #2e7d321f",
            padding: "36px 28px",
            textAlign: "center",
          }}
        >
          <p style={{ margin: 0, letterSpacing: 1.8, textTransform: "uppercase", color: nightMode ? "#b6bdc7" : "#2e7d32", fontWeight: 700, fontSize: 12 }}>
            Hibi
          </p>
          <h1 style={{ margin: "10px 0 8px", color: nightMode ? "#e9ecef" : "#14532d", fontSize: "clamp(34px, 7vw, 56px)", lineHeight: 1.04, fontWeight: 800 }}>
            Daily Space
          </h1>
          <p style={{ margin: "12px auto 0", color: nightMode ? "#c9d1da" : "#1b5e20", maxWidth: 520, fontSize: "clamp(16px, 3vw, 20px)", lineHeight: 1.45 }}>
            Hibi greets you softly. Log in to begin your day with calm and intention.
          </p>
          <div style={{ marginTop: 28, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/login"
              style={{ textDecoration: "none", background: "#2e7d32", color: "#fff", padding: "10px 18px", borderRadius: 10, fontWeight: 700 }}
            >
              Log In
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        background: nightMode
          ? "linear-gradient(165deg, #0f1113 0%, #15181c 50%, #1c2025 100%)"
          : "linear-gradient(150deg, #fdf6ec 0%, #e8f5e9 55%, #c8e6c9 100%)",
        fontFamily: "system-ui, sans-serif",
        color: nightMode ? "#e9ecef" : "#14532d",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          marginBottom: 18,
          position: "relative",
        }}
      >
        <Link
          href="/"
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            textDecoration: "none",
            fontWeight: 900,
            fontSize: 28,
            color: nightMode ? "#e9ecef" : "#14532d",
            letterSpacing: 1.5,
            paddingLeft: 12,
            userSelect: "none",
          }}
        >
          Hibi
        </Link>
        <Link href="/calendar" style={{ textDecoration: "none", background: nightMode ? "#1c2127" : "#e8f5e9", color: nightMode ? "#e9ecef" : "#14532d", padding: "10px 16px", borderRadius: 10, fontWeight: 700, border: `1.5px solid ${nightMode ? "#2b3139" : "#2e7d32"}` }}>
          Calendar
        </Link>
        <Link href="/habits" style={{ textDecoration: "none", background: nightMode ? "#1c2127" : "#e8f5e9", color: nightMode ? "#e9ecef" : "#14532d", padding: "10px 16px", borderRadius: 10, fontWeight: 700, border: `1.5px solid ${nightMode ? "#2b3139" : "#2e7d32"}` }}>
          Habit Tracker
        </Link>
        <Link href="/today" style={{ textDecoration: "none", background: nightMode ? "#1c2127" : "#e8f5e9", color: nightMode ? "#e9ecef" : "#14532d", padding: "10px 16px", borderRadius: 10, fontWeight: 700, border: `1.5px solid ${nightMode ? "#2b3139" : "#2e7d32"}` }}>
          Journal
        </Link>
        <Link href="/profile" style={{ textDecoration: "none", background: nightMode ? "#1c2127" : "#e8f5e9", color: nightMode ? "#e9ecef" : "#14532d", padding: "10px 16px", borderRadius: 10, fontWeight: 700, border: `1.5px solid ${nightMode ? "#2b3139" : "#2e7d32"}` }}>
          Profile
        </Link>
        <button
          onClick={async () => {
            if (supabase) {
              await supabase.auth.signOut();
            }
            router.replace("/login");
          }}
          style={{ textDecoration: "none", background: nightMode ? "#1c2127" : "#e8f5e9", color: nightMode ? "#e9ecef" : "#14532d", padding: "10px 16px", borderRadius: 10, fontWeight: 700, border: `1.5px solid ${nightMode ? "#2b3139" : "#2e7d32"}`, cursor: "pointer" }}
        >
          Log Out
        </button>
      </div>

      <section
        style={{
          width: "100%",
          maxWidth: 860,
          margin: "0 auto",
          background: nightMode ? "#171a1fcc" : "#ffffffcc",
          border: `1px solid ${nightMode ? "#2b3139" : "#dcebdc"}`,
          borderRadius: 22,
          boxShadow: nightMode ? "0 12px 30px #00000066" : "0 12px 30px #2e7d321f",
          padding: "30px 24px",
        }}
      >
        <p style={{ margin: 0, color: nightMode ? "#b6bdc7" : "#2e7d32", fontWeight: 700, letterSpacing: 1 }}>{dateLabel}</p>
        <h1 style={{ margin: "8px 0 6px", fontSize: "clamp(30px, 6vw, 48px)", lineHeight: 1.08 }}>{possessiveName} Daily Space</h1>
        <p style={{ margin: "0 0 16px", color: nightMode ? "#c9d1da" : "#1b5e20", fontSize: 18 }}>{message}</p>

        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ background: nightMode ? "#1b2026" : "#f4faf4", border: `1px solid ${nightMode ? "#2d3440" : "#d5e7d6"}`, borderRadius: 14, padding: 14 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 700, color: nightMode ? "#e9ecef" : "#14532d" }}>Your mood spectrum for {monthLabel}</p>
            <div style={{ position: "relative", height: 18, borderRadius: 999, background: hibiMoodGradient }}>
              <span
                style={{
                  position: "absolute",
                  left: `${moodPercent}%`,
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#fff",
                  border: "2px solid #14532d",
                  boxShadow: "0 1px 6px #14532d44",
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <div style={{ background: nightMode ? "#1b2026" : "#f4faf4", border: `1px solid ${nightMode ? "#2d3440" : "#d5e7d6"}`, borderRadius: 14, padding: 14 }}>
              <p style={{ margin: "0 0 4px", color: nightMode ? "#b6bdc7" : "#2e7d32", fontWeight: 700 }}>Rhythm</p>
              <p style={{ margin: 0, color: nightMode ? "#e9ecef" : "#14532d", fontSize: 24, fontWeight: 800 }}>{rhythmLabel}</p>
            </div>
            <div style={{ background: nightMode ? "#1b2026" : "#f4faf4", border: `1px solid ${nightMode ? "#2d3440" : "#d5e7d6"}`, borderRadius: 14, padding: 14 }}>
              <p style={{ margin: "0 0 4px", color: nightMode ? "#b6bdc7" : "#2e7d32", fontWeight: 700 }}>Current streak</p>
              <p style={{ margin: 0, color: nightMode ? "#e9ecef" : "#14532d", fontSize: 24, fontWeight: 800 }}>{streak} day{streak === 1 ? "" : "s"}</p>
            </div>
          </div>

          <div style={{ background: nightMode ? "#1b2026" : "#f4faf4", border: `1px solid ${nightMode ? "#2d3440" : "#d5e7d6"}`, borderRadius: 14, padding: 14 }}>
            <p style={{ margin: "0 0 6px", color: nightMode ? "#b6bdc7" : "#2e7d32", fontWeight: 700 }}>Gentle suggestion</p>
            <p style={{ margin: 0, color: nightMode ? "#e9ecef" : "#14532d" }}>{gentleSuggestion}</p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/habits" style={{ textDecoration: "none", background: nightMode ? "#2b3139" : "#2e7d32", color: "#fff", padding: "10px 16px", borderRadius: 10, fontWeight: 700 }}>
              Go to today's habits
            </Link>
            <Link href="/today" style={{ textDecoration: "none", background: nightMode ? "#1c2127" : "#e8f5e9", color: nightMode ? "#e9ecef" : "#14532d", padding: "10px 16px", borderRadius: 10, fontWeight: 700, border: `1.5px solid ${nightMode ? "#2b3139" : "#2e7d32"}` }}>
              Open Journal
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
