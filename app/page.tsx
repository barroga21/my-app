"use client";

import Link from "next/link";
import { TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useNightMode } from "@/lib/useNightMode";
import { useAuthBootstrap } from "@/lib/hooks/useAuthBootstrap";
import { getStoredNightModePreference, setStoredNightModePreference, NIGHT_MODE_OPTIONS } from "@/lib/nightModePreference";
import { INTERACTION_TUNING, shouldTriggerPullRefresh, triggerHaptic } from "@/lib/interactionTuning";
import { habitChecksKey, journalYearKey } from "@/lib/dateKeys";
import {
  clearOneThing as clearOneThingRepo,
  getOneThing as getOneThingRepo,
  setOneThing as setOneThingRepo,
} from "@/lib/repositories/homeOneThingRepo";
import OnboardingChecklist from "@/app/components/home/OnboardingChecklist";
import StatCard from "@/app/components/home/StatCard";
import NavBar from "@/app/components/NavBar";
import { useScrollReveal } from "@/lib/hooks/useScrollReveal";

const gentlePresences = [
  "Small steps still count. Your pace is enough today.",
  "Breathe, begin, and let the day unfold gently.",
  "You do not need perfect progress to make meaningful progress.",
  "Choose one kind action for yourself before everything else.",
];

export default function HomePage() {
  const [message, setMessage] = useState(gentlePresences[0]);
  const [displayName, setDisplayName] = useState("Your");
  const { authReady, userId, user } = useAuthBootstrap({ supabase, allowGuest: true });
  const nightMode = useNightMode();
  const [moodPercent, setMoodPercent] = useState(50);
  const [rhythmLabel, setRhythmLabel] = useState("Steady");
  const [streak, setStreak] = useState(0);
  const [todayJournalCount, setTodayJournalCount] = useState(0);
  const [todayHabitsDone, setTodayHabitsDone] = useState(0);
  const [totalHabits, setTotalHabits] = useState(0);
  const [quickHabitList, setQuickHabitList] = useState<string[]>([]);
  const [quickChecked, setQuickChecked] = useState<Record<string, string>>({});
  const [oneThing, setOneThing] = useState("");
  const [oneThingInput, setOneThingInput] = useState("");
  const [oneThingSet, setOneThingSet] = useState(false);
  const [journalStreak, setJournalStreak] = useState(0);
  const [wordsThisMonth, setWordsThisMonth] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [nightModePref, setNightModePref] = useState(NIGHT_MODE_OPTIONS.AUTO);
  const pullStart = useRef({ x: 0, y: 0, at: 0 });
  const pullActive = useRef(false);
  const pullTriggered = useRef(false);
  const revealOneThing = useScrollReveal(0.2);
  const revealWeekly = useScrollReveal(0.15);
  const revealMonthly = useScrollReveal(0.15);

  const [minuteTick, setMinuteTick] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`;
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date();
      setMinuteTick(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`);
    }, 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const now = useMemo(() => {
    const [year, month, day, hour, minute] = minuteTick.split("-").map(Number);
    return new Date(year, month, day, hour, minute);
  }, [minuteTick]);

  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const seed = useMemo(() => {
    return day + month + year + hour + minute;
  }, [day, hour, minute, month, year]);

  useEffect(() => {
    const index = seed % gentlePresences.length;
    setMessage(gentlePresences[index]);
  }, [seed]);

  useEffect(() => {
    const syncPref = () => setNightModePref(getStoredNightModePreference());
    syncPref();
    window.addEventListener("storage", syncPref);
    return () => window.removeEventListener("storage", syncPref);
  }, []);

  useEffect(() => {
    function deriveDisplayName(activeUser: { user_metadata?: Record<string, unknown>; email?: string } | null | undefined) {
      const rawName =
        activeUser?.user_metadata?.full_name ||
        activeUser?.user_metadata?.display_name ||
        activeUser?.user_metadata?.name ||
        activeUser?.user_metadata?.preferred_name ||
        "";

      const fromMetadata = String(rawName || "").trim();
      if (fromMetadata) return fromMetadata;

      const email = String(activeUser?.email || "").trim();
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

    setDisplayName(userId ? deriveDisplayName(user) : "Your");
  }, [user, userId]);

  useEffect(() => {
    const activeUser = userId || "guest";
    const key = habitChecksKey(activeUser, year, month);
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

    const elapsed = day;
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
  }, [day, month, userId, year]);

  useEffect(() => {
    if (!userId) return;
    const yr = year;
    const mo = month + 1;
      const dateKey = `${yr}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    try {
      const journalRaw = localStorage.getItem(journalYearKey(userId, yr));
      const journalData = journalRaw ? JSON.parse(journalRaw) : {};
      const todayEntries = journalData[dateKey];
      setTodayJournalCount(Array.isArray(todayEntries) ? todayEntries.length : 0);
      // Compute journal streak (consecutive days with at least one entry going back from today)
      let jStreak = 0;
      for (let d = day; d >= 1; d--) {
        const dk = `${yr}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        if (Array.isArray(journalData[dk]) && journalData[dk].length > 0) jStreak++;
        else break;
      }
      setJournalStreak(jStreak);
      let wordCount = 0;
      const monthPrefix = `${yr}-${String(mo).padStart(2, "0")}-`;
      Object.entries(journalData).forEach(([key, dayEntries]) => {
        if (!key.startsWith(monthPrefix) || !Array.isArray(dayEntries)) return;
        (dayEntries as Array<{ text?: string }>).forEach((entry) => {
          const text = (entry.text || "").trim();
          if (text) wordCount += text.split(/\s+/).length;
        });
      });
      setWordsThisMonth(wordCount);
    } catch {}
    try {
      const habitListRaw = localStorage.getItem(`habit_list_${userId}`);
      const habitList: string[] = habitListRaw ? JSON.parse(habitListRaw) : [];
      setTotalHabits(habitList.length);
      const habitsKey = habitChecksKey(userId, yr, mo - 1);
      const habitsRaw = localStorage.getItem(habitsKey);
      const habitsChecks: Record<string, string> = habitsRaw ? JSON.parse(habitsRaw) : {};
      let done = 0;
      habitList.forEach((habit) => {
        if (habitsChecks[`${habit}-${day}`] === "dot") done++;
      });
      setTodayHabitsDone(done);
      setQuickHabitList(habitList);
      setQuickChecked(habitsChecks);
    } catch {}
  }, [day, month, refreshTick, userId, year]);  // Night mode toggle
  function toggleNight() {
    const cur = getStoredNightModePreference();
    const next = cur === NIGHT_MODE_OPTIONS.ON ? NIGHT_MODE_OPTIONS.OFF
      : cur === NIGHT_MODE_OPTIONS.OFF ? NIGHT_MODE_OPTIONS.AUTO
      : NIGHT_MODE_OPTIONS.ON;
    setStoredNightModePreference(next);
    setNightModePref(next);
    // Smooth theme crossfade
    document.body.classList.add("hibi-theme-transition");
    setTimeout(() => document.body.classList.remove("hibi-theme-transition"), 500);
    try { window.dispatchEvent(new Event("storage")); } catch {}
  }

  // Pull-to-refresh handlers
  function handleTouchStart(e: TouchEvent<HTMLDivElement>) {
    if (window.scrollY === 0) {
      pullStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() };
      pullActive.current = true;
      pullTriggered.current = false;
    }
  }
  function handleTouchMove(e: TouchEvent<HTMLDivElement>) {
    if (!pullActive.current) return;
    if (!pullTriggered.current && shouldTriggerPullRefresh(pullStart.current, e.touches[0])) {
      setRefreshing(true);
      pullTriggered.current = true;
      triggerHaptic(INTERACTION_TUNING.pullToRefresh.hapticMs);
    }
  }
  function handleTouchEnd() {
    if (pullTriggered.current) {
      setTimeout(() => {
        setRefreshTick((t) => t + 1);
        setRefreshing(false);
      }, INTERACTION_TUNING.pullToRefresh.completeDelayMs);
    }
    pullActive.current = false;
    pullTriggered.current = false;
  }
  useEffect(() => {
    if (!userId) return;
    try {
      const raw = getOneThingRepo(userId, new Date());
      if (raw) {
        setOneThing(raw);
        setOneThingSet(true);
        setOneThingInput(raw);
      } else {
        setOneThing("");
        setOneThingSet(false);
        setOneThingInput("");
      }
    } catch {}
  }, [userId]);

  function commitOneThing() {
    const trimmed = oneThingInput.trim();
    if (!trimmed || !userId) return;
    try {
      setOneThingRepo(userId, new Date(), trimmed);
    } catch {}
    setOneThing(trimmed);
    setOneThingSet(true);
  }

  function clearOneThing() {
    if (!userId) return;
    try {
      clearOneThingRepo(userId, new Date());
    } catch {}
    setOneThing("");
    setOneThingSet(false);
    setOneThingInput("");
  }

  // Weekly summary card — shown on Sundays evening
  const isSundayEvening = now.getDay() === 0 && hour >= 17;
  const weekStats = useMemo(() => {
    if (!userId || !isSundayEvening) return null;
    try {
      const jRaw = localStorage.getItem(`hibi_journal_${userId}_${year}_all`);
      const jData = jRaw ? JSON.parse(jRaw) : {};
      const habitsKey = habitChecksKey(userId, year, month);
      const habitsRaw = localStorage.getItem(habitsKey);
      const habitsChecksData: Record<string, string> = habitsRaw ? JSON.parse(habitsRaw) : {};
      const habitListRaw = localStorage.getItem(`habit_list_${userId}`);
      const habitList: string[] = habitListRaw ? JSON.parse(habitListRaw) : [];
      let journalDays = 0, habitDays = 0, totalWordsWeek = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const dayEntries = jData[dk];
        if (Array.isArray(dayEntries) && dayEntries.length > 0) {
          journalDays++;
          (dayEntries as Array<{ text?: string }>).forEach((e) => {
            const t = (e.text || "").trim();
            if (t) totalWordsWeek += t.split(/\s+/).length;
          });
        }
        const dayNum = d.getDate();
        if (habitList.some((h) => habitsChecksData[`${h}-${dayNum}`] === "dot")) habitDays++;
      }
      return { journalDays, habitDays, totalWordsWeek };
    } catch { return null; }
  }, [userId, isSundayEvening, year, month, now]);

  // Monthly review (last month stats) — shown on 1st of month
  const isFirstOfMonth = day === 1;
  const prevMonthLabel = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [now]);
  const prevMonthStats = useMemo(() => {
    if (!userId || !isFirstOfMonth) return null;
    const prev = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const daysInPrev = new Date(prevYear, prev + 1, 0).getDate();
    try {
      const habitListRaw = localStorage.getItem(`habit_list_${userId}`);
      const habitList: string[] = habitListRaw ? JSON.parse(habitListRaw) : [];
      const habitsKey = habitChecksKey(userId, prevYear, prev);
      const habitsRaw = localStorage.getItem(habitsKey);
      const habitsChecks: Record<string, string> = habitsRaw ? JSON.parse(habitsRaw) : {};
      let habitDoneDays = 0;
      for (let d = 1; d <= daysInPrev; d++) {
        const anyDone = habitList.some((h) => habitsChecks[`${h}-${d}`] === "dot");
        if (anyDone) habitDoneDays++;
      }
      const journalRaw = localStorage.getItem(`hibi_journal_${userId}_${prevYear}_all`);
      const journalData = journalRaw ? JSON.parse(journalRaw) : {};
      let journalEntries = 0;
      for (let d = 1; d <= daysInPrev; d++) {
        const dk = `${prevYear}-${String(prev + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        journalEntries += Array.isArray(journalData[dk]) ? journalData[dk].length : 0;
      }
      return { habitDoneDays, journalEntries, daysInPrev };
    } catch {
      return null;
    }
  }, [userId, isFirstOfMonth, now]);

  // Streak protection nudge — show after 9 PM if habits incomplete
  const showStreakNudge = hour >= 21 && todayHabitsDone < totalHabits && totalHabits > 0;
  const allHabitsDone = totalHabits > 0 && todayHabitsDone >= totalHabits;

  function toggleQuickHabit(habit: string) {    if (!userId) return;
    const td = new Date();
    const day = td.getDate();
    const yr = td.getFullYear();
    const mo = td.getMonth() + 1;
    const key = `${habit}-${day}`;
    const storageKey = habitChecksKey(userId, yr, mo - 1);
    const isDone = quickChecked[key] === "dot";
    const next = { ...quickChecked, [key]: isDone ? "empty" : "dot" };
    setQuickChecked(next);
    setTodayHabitsDone((d) => isDone ? Math.max(0, d - 1) : d + 1);
    try {
      const raw = localStorage.getItem(storageKey);
      const existing: Record<string, string> = raw ? JSON.parse(raw) : {};
      localStorage.setItem(storageKey, JSON.stringify({ ...existing, [key]: isDone ? "empty" : "dot" }));
    } catch {}
  }

  const gentleSuggestion =
    streak >= 5
      ? "Your rhythm is stable. Protect it with one non-negotiable habit today."
      : rhythmLabel === "Soft"
      ? "Keep today light: choose one anchor habit and let that be enough."
      : "Begin with a two-minute start to make momentum easier.";

  const titleName = displayName.trim();
  const possessiveName = titleName.endsWith("s") || titleName.endsWith("S") ? `${titleName}'` : `${titleName}'s`;
  const onboardingSteps = [
    { done: Boolean(oneThingSet), label: "Set your One Thing" },
    { done: todayHabitsDone > 0, label: "Check one habit" },
    { done: todayJournalCount > 0, label: "Write one journal entry" },
  ];

  if (!authReady) {
    return (
      <main
        style={{
          minHeight: "100vh",
          padding: "28px 24px",
          background: nightMode
            ? "linear-gradient(145deg, #070b0d 0%, #0c1117 35%, #101820 70%, #0e1a14 100%)"
            : "linear-gradient(145deg, #f7fbf4 0%, #eef7e8 40%, #e0f0da 75%, #d4ead4 100%)",
          fontFamily: "var(--font-manrope), sans-serif",
        }}
      >
        <div style={{ maxWidth: 820, margin: "0 auto", display: "grid", gap: 14, paddingTop: 60 }} role="status" aria-label="Loading your dashboard">
          <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 48, borderRadius: 999, maxWidth: 500, marginBottom: 8 }} aria-hidden="true" />
          <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 36, borderRadius: 12, maxWidth: 280 }} aria-hidden="true" />
          <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 22, borderRadius: 8, maxWidth: 420 }} aria-hidden="true" />
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
            <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 80, borderRadius: 16 }} aria-hidden="true" />
            <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 80, borderRadius: 16 }} aria-hidden="true" />
          </div>
          <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 60, borderRadius: 16 }} aria-hidden="true" />
          <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 100, borderRadius: 16 }} aria-hidden="true" />
        </div>
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
          <h1 className="hibi-brand-headline hibi-shimmer-text" style={{ margin: "10px 0 8px", fontSize: "clamp(34px, 7vw, 56px)", lineHeight: 1.04, fontWeight: 800 }}>
            Daily Studio
          </h1>
          <p style={{ margin: "12px auto 0", color: nightMode ? "#c9d1da" : "#1b5e20", maxWidth: 520, fontSize: "clamp(16px, 3vw, 20px)", lineHeight: 1.45 }}>
            Hibi greets you softly. Log in to shape your day with calm momentum and clear intent.
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
      className="hibi-aurora-bg"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        minHeight: "100vh",
        padding: "28px 24px",
        background: nightMode
          ? "linear-gradient(145deg, #070b0d 0%, #0c1117 35%, #101820 70%, #0e1a14 100%)"
          : "linear-gradient(145deg, #f7fbf4 0%, #eef7e8 40%, #e0f0da 75%, #d4ead4 100%)",
        fontFamily: "var(--font-manrope), sans-serif",
        color: nightMode ? "#e9ecef" : "#0d2a14",
        animation: "hibiPageEnter var(--hibi-motion-slow) var(--hibi-ease-enter)",
      }}
    >
      {refreshing ? <div className="hibi-pull-indicator" aria-hidden="true" /> : null}
      {/* Streak protection nudge — after 9PM with incomplete habits */}
      {showStreakNudge && (
        <div
          style={{
            maxWidth: 820,
            margin: "0 auto 16px",
            background: nightMode ? "rgba(251,146,60,0.12)" : "rgba(251,146,60,0.10)",
            border: `1px solid ${nightMode ? "rgba(251,146,60,0.35)" : "rgba(194,98,10,0.28)"}`,
            borderRadius: 16,
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 20 }}>🌙</span>
          <div style={{ flex: 1 }}>
            <span style={{ color: nightMode ? "#fdba74" : "#c2620a", fontWeight: 700, fontSize: 14 }}>
              {streak > 0 ? `Your ${streak}-day streak ends tonight.` : "Night is here."}{" "}
            </span>
            <span style={{ color: nightMode ? "#fcd34d" : "#92400e", fontSize: 13 }}>
              {totalHabits - todayHabitsDone} habit{totalHabits - todayHabitsDone === 1 ? "" : "s"} still to go.
            </span>
          </div>
          <Link href="/habits" style={{ textDecoration: "none", background: nightMode ? "rgba(251,146,60,0.22)" : "rgba(194,98,10,0.12)", color: nightMode ? "#fdba74" : "#c2620a", padding: "5px 12px", borderRadius: 999, fontWeight: 700, fontSize: 12 }}>
            Go →
          </Link>
        </div>
      )}
      <div style={{ maxWidth: 900, margin: "0 auto 28px" }}>
        <NavBar activePage="home" />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button
            type="button"
            onClick={toggleNight}
            style={{
              border: `1px solid ${nightMode ? "rgba(255,255,255,0.12)" : "rgba(46,125,50,0.22)"}`,
              background: nightMode ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.75)",
              color: nightMode ? "#d9e3ee" : "#14532d",
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
            title="Toggle day/night mode (cycles On, Off, Auto)"
          >
            Theme: {nightModePref === NIGHT_MODE_OPTIONS.ON ? "On" : nightModePref === NIGHT_MODE_OPTIONS.OFF ? "Off" : "Auto"}
          </button>
        </div>
      </div>

      <section
        style={{
          width: "100%",
          maxWidth: 820,
          margin: "0 auto",
          background: nightMode ? "rgba(12,16,22,0.82)" : "rgba(255,255,255,0.80)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: `1px solid ${nightMode ? "rgba(255,255,255,0.06)" : "rgba(46,125,50,0.11)"}`,
          borderRadius: 24,
          boxShadow: nightMode ? "0 8px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4)" : "0 8px 40px rgba(46,125,50,0.10), 0 2px 8px rgba(0,0,0,0.04)",
          padding: "32px 28px",
        }}
      >
        <p style={{ margin: 0, color: nightMode ? "#6a7a6a" : "#4a7a50", fontWeight: 600, letterSpacing: 0.8, fontSize: 12, textTransform: "uppercase" }}>{dateLabel}</p>
        <h1 className="hibi-brand-headline" style={{ margin: "8px 0 6px", fontSize: "clamp(28px, 5.5vw, 44px)", lineHeight: 1.06, fontWeight: 800, letterSpacing: -0.5 }}>{possessiveName} Daily Studio</h1>
        <p style={{ margin: "0 0 20px", color: nightMode ? "#8a9e8a" : "#2e6e34", fontSize: 17, lineHeight: 1.5 }}>{message}</p>

        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.05)", border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)"}`, borderRadius: 16, padding: "14px 16px" }}>
            <p style={{ margin: "0 0 10px", fontWeight: 700, color: nightMode ? "#8a9e8a" : "#2e6e34", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8 }}>Monthly momentum for {monthLabel}</p>
            <div style={{ position: "relative", height: 14, borderRadius: 999, background: "linear-gradient(90deg, #f59e0b 0%, #4ade80 55%, #16a34a 100%)", boxShadow: "0 2px 8px rgba(46,125,50,0.25)" }}>
              <span
                style={{
                  position: "absolute",
                  left: `${moodPercent}%`,
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "#fff",
                  border: "2.5px solid #14532d",
                  boxShadow: "0 2px 8px rgba(20,83,45,0.35)",
                  transition: "left 0.5s ease",
                }}
              />
            </div>
          </div>

          <div className="hibi-home-stat-tiles" style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <StatCard label="Rhythm" value={rhythmLabel} nightMode={nightMode} delay="var(--hibi-stagger-home-1)" />
            <StatCard label="Habit Streak" value={streak} suffix={` day${streak === 1 ? "" : "s"}`} nightMode={nightMode} delay="var(--hibi-stagger-home-2)" />
            <StatCard label="Journal Streak" value={journalStreak} suffix={` day${journalStreak === 1 ? "" : "s"}`} nightMode={nightMode} delay="var(--hibi-stagger-home-3)" />
            <StatCard label="This Month" value={wordsThisMonth >= 1000 ? `${(wordsThisMonth / 1000).toFixed(1)}k` : wordsThisMonth} suffix=" words" nightMode={nightMode} delay="var(--hibi-stagger-home-4)" />
          </div>

          <div style={{ background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.05)", border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)"}`, borderRadius: 16, padding: "14px 16px" }}>
            <p style={{ margin: "0 0 6px", color: nightMode ? "#6a7a6a" : "#4a7a50", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>Momentum cue</p>
            <p style={{ margin: 0, color: nightMode ? "#c9d1da" : "#1a4a22", lineHeight: 1.55 }}>{gentleSuggestion}</p>
          </div>

          <OnboardingChecklist steps={onboardingSteps} nightMode={nightMode} />

          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginBottom: 0 }}>
            <div style={{ background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.05)", border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)"}`, borderRadius: 16, padding: "14px 16px" }}>
              <p style={{ margin: "0 0 2px", color: nightMode ? "#6a7a6a" : "#4a7a50", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>Habits today</p>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 24, letterSpacing: -0.5, color: nightMode ? "#e9ecef" : "#0d2a14" }}>
                {todayHabitsDone}<span style={{ fontSize: 14, fontWeight: 500, color: nightMode ? "#6a7a6a" : "#4a7a50" }}> / {totalHabits}</span>
              </p>
            </div>
            <div style={{ background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.05)", border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)"}`, borderRadius: 16, padding: "14px 16px" }}>
              <p style={{ margin: "0 0 2px", color: nightMode ? "#6a7a6a" : "#4a7a50", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>Journal today</p>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 24, letterSpacing: -0.5, color: nightMode ? "#e9ecef" : "#0d2a14" }}>
                {todayJournalCount}<span style={{ fontSize: 14, fontWeight: 500, color: nightMode ? "#6a7a6a" : "#4a7a50" }}> {todayJournalCount === 1 ? "entry" : "entries"}</span>
              </p>
            </div>
          </div>

          <div className="hibi-home-cta-row" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/habits" style={{ textDecoration: "none", background: nightMode ? "#22c55e" : "#1a6e36", color: "#fff", padding: "10px 20px", borderRadius: 999, fontWeight: 700, boxShadow: nightMode ? "0 2px 12px rgba(34,197,94,0.35)" : "0 2px 12px rgba(26,110,54,0.30)", fontSize: 14, animation: allHabitsDone ? "hibiPulseGreen var(--hibi-motion-slow) var(--hibi-ease-standard) infinite" : "none" }}>
              Open Habit Studio →
            </Link>
            <Link href="/today" style={{ textDecoration: "none", background: nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.09)", color: nightMode ? "#c9d1da" : "#1a5c1e", padding: "10px 20px", borderRadius: 999, fontWeight: 600, border: `1px solid ${nightMode ? "rgba(255,255,255,0.10)" : "rgba(46,125,50,0.18)"}`, fontSize: 14 }}>
              Open Journal Studio
            </Link>
          </div>
        </div>
      </section>

      {/* "One Thing" daily focus */}
      <section
        ref={revealOneThing.ref}
        className={`hibi-reveal${revealOneThing.visible ? " hibi-revealed" : ""}`}
        style={{
          width: "100%",
          maxWidth: 820,
          margin: "16px auto 0",
          background: nightMode ? "rgba(34,197,94,0.07)" : "rgba(26,110,54,0.05)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: `1px solid ${nightMode ? "rgba(34,197,94,0.18)" : "rgba(26,110,54,0.16)"}`,
          borderRadius: 24,
          boxShadow: nightMode ? "0 4px 24px rgba(34,197,94,0.06)" : "0 4px 24px rgba(26,110,54,0.06)",
          padding: "24px 28px",
        }}
      >
        <p style={{ margin: "0 0 6px", color: nightMode ? "#4ade80" : "#1a6e36", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
          ✦ One Thing
        </p>
        <p style={{ margin: "0 0 14px", color: nightMode ? "#8a9e8a" : "#4a7a50", fontSize: 13 }}>
          What is the one meaningful move you want to complete today?
        </p>
        {oneThingSet ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 20 }}>⭐</span>
            <span style={{ flex: 1, color: nightMode ? "#e9ecef" : "#0d2a14", fontWeight: 700, fontSize: 16, lineHeight: 1.4 }}>{oneThing}</span>
            <button
              onClick={clearOneThing}
              style={{ border: "none", background: "transparent", color: nightMode ? "#6a7a6a" : "#8a9a80", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "4px 8px", borderRadius: 8 }}
            >
              Clear
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={oneThingInput}
              onChange={(e) => setOneThingInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitOneThing(); }}
              placeholder="Name your one focus for today…"
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 12,
                border: `1.5px solid ${nightMode ? "rgba(34,197,94,0.25)" : "rgba(26,110,54,0.22)"}`,
                background: nightMode ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.6)",
                color: nightMode ? "#e9ecef" : "#0d2a14",
                fontSize: 14,
                outline: "none",
              }}
            />
            <button
              onClick={commitOneThing}
              style={{
                border: "none",
                background: nightMode ? "#22c55e" : "#1a6e36",
                color: "#fff",
                padding: "10px 16px",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Save Focus ★
            </button>
          </div>
        )}
      </section>

      {isSundayEvening && weekStats && (
        <section
          ref={revealWeekly.ref}
          className={`hibi-reveal${revealWeekly.visible ? " hibi-revealed" : ""}`}
          style={{
            width: "100%",
            maxWidth: 820,
            margin: "16px auto 0",
            background: nightMode ? "rgba(12,16,22,0.82)" : "rgba(255,255,255,0.80)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${nightMode ? "rgba(255,255,255,0.06)" : "rgba(46,125,50,0.11)"}`,
            borderRadius: 24,
            boxShadow: nightMode ? "0 8px 40px rgba(0,0,0,0.55)" : "0 8px 40px rgba(46,125,50,0.10)",
            padding: "24px 28px",
          }}
        >
          <p style={{ margin: "0 0 4px", color: nightMode ? "#6a7a6a" : "#4a7a50", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>🌤 Weekly Recap</p>
          <h2 style={{ margin: "0 0 14px", fontSize: "clamp(18px, 4vw, 24px)", fontWeight: 800, color: nightMode ? "#e9ecef" : "#0d2a14" }}>This Week</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <div style={{ background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.05)", borderRadius: 14, padding: "12px 14px", border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.10)"}` }}>
              <p style={{ margin: "0 0 2px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>Journal Days</p>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 28, color: nightMode ? "#e9ecef" : "#0d2a14" }}>{weekStats.journalDays}<span style={{ fontSize: 13, fontWeight: 500, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>/7</span></p>
            </div>
            <div style={{ background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.05)", borderRadius: 14, padding: "12px 14px", border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.10)"}` }}>
              <p style={{ margin: "0 0 2px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>Habit Days</p>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 28, color: nightMode ? "#e9ecef" : "#0d2a14" }}>{weekStats.habitDays}<span style={{ fontSize: 13, fontWeight: 500, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>/7</span></p>
            </div>
            <div style={{ background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.05)", borderRadius: 14, padding: "12px 14px", border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.10)"}` }}>
              <p style={{ margin: "0 0 2px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>Words</p>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 28, color: nightMode ? "#e9ecef" : "#0d2a14" }}>{weekStats.totalWordsWeek >= 1000 ? `${(weekStats.totalWordsWeek / 1000).toFixed(1)}k` : weekStats.totalWordsWeek}</p>
            </div>
          </div>
        </section>
      )}

      {/* Monthly Review Card — shown on 1st of month */}
      {isFirstOfMonth && prevMonthStats && (
        <section
          ref={revealMonthly.ref}
          className={`hibi-reveal${revealMonthly.visible ? " hibi-revealed" : ""}`}
          style={{
            width: "100%",
            maxWidth: 820,
            margin: "16px auto 0",
            background: nightMode ? "rgba(12,16,22,0.82)" : "rgba(255,255,255,0.80)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${nightMode ? "rgba(255,255,255,0.06)" : "rgba(46,125,50,0.11)"}`,
            borderRadius: 24,
            boxShadow: nightMode ? "0 8px 40px rgba(0,0,0,0.55)" : "0 8px 40px rgba(46,125,50,0.10)",
            padding: "24px 28px",
          }}
        >
          <p style={{ margin: "0 0 4px", color: nightMode ? "#6a7a6a" : "#4a7a50", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>🌿 Monthly Review</p>
          <h2 style={{ margin: "0 0 14px", fontSize: "clamp(18px, 4vw, 24px)", fontWeight: 800, color: nightMode ? "#e9ecef" : "#0d2a14" }}>{prevMonthLabel}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <div style={{ background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.05)", borderRadius: 14, padding: "12px 14px", border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.10)"}` }}>
              <p style={{ margin: "0 0 2px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>Active Days</p>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 28, color: nightMode ? "#e9ecef" : "#0d2a14" }}>
                {prevMonthStats.habitDoneDays}
                <span style={{ fontSize: 13, fontWeight: 500, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>/{prevMonthStats.daysInPrev}</span>
              </p>
            </div>
            <div style={{ background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.05)", borderRadius: 14, padding: "12px 14px", border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.10)"}` }}>
              <p style={{ margin: "0 0 2px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>Journal Entries</p>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 28, color: nightMode ? "#e9ecef" : "#0d2a14" }}>{prevMonthStats.journalEntries}</p>
            </div>
            <div style={{ background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.05)", borderRadius: 14, padding: "12px 14px", border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.10)"}` }}>
              <p style={{ margin: "0 0 2px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>Completion Rate</p>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 28, color: nightMode ? "#e9ecef" : "#0d2a14" }}>
                {prevMonthStats.daysInPrev > 0 ? Math.round((prevMonthStats.habitDoneDays / prevMonthStats.daysInPrev) * 100) : 0}
                <span style={{ fontSize: 13, fontWeight: 500, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>%</span>
              </p>
            </div>
          </div>
        </section>
      )}

      <section
        style={{
          width: "100%",
          maxWidth: 820,
          margin: "16px auto 0",
          background: nightMode ? "rgba(12,16,22,0.82)" : "rgba(255,255,255,0.80)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: `1px solid ${nightMode ? "rgba(255,255,255,0.06)" : "rgba(46,125,50,0.11)"}`,
          borderRadius: 24,
          boxShadow: nightMode ? "0 8px 40px rgba(0,0,0,0.55)" : "0 8px 40px rgba(46,125,50,0.10)",
          padding: "28px 28px",
        }}
      >
        <h2 style={{ margin: "0 0 16px", color: nightMode ? "#e9ecef" : "#0d2a14", fontSize: "clamp(20px, 4vw, 28px)", lineHeight: 1.08, fontWeight: 800, letterSpacing: -0.3 }}>
          Today&apos;s Habits
        </h2>
        {quickHabitList.length === 0 ? (
          <p style={{ margin: 0, color: nightMode ? "#7f8b9a" : "#6a9e6a", fontSize: 15 }}>
            No habits yet.{" "}
            <Link href="/habits" style={{ color: nightMode ? "#7fb77f" : "#2e7d32", fontWeight: 700 }}>Add your first habit →</Link>
          </p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {quickHabitList.map((habit) => {
              const today = new Date();
              const key = `${habit}-${today.getDate()}`;
              const done = quickChecked[key] === "dot";
              return (
                <button
                  key={habit}
                  type="button"
                  onClick={() => toggleQuickHabit(habit)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: done
                      ? (nightMode ? "rgba(34,197,94,0.10)" : "rgba(46,125,50,0.07)")
                      : (nightMode ? "rgba(255,255,255,0.03)" : "rgba(46,125,50,0.03)"),
                    border: `1.5px solid ${done ? (nightMode ? "rgba(34,197,94,0.30)" : "rgba(46,125,50,0.25)") : (nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.10)")}`,
                    borderRadius: 14,
                    padding: "10px 14px",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                    transition: "all 0.2s ease",
                    boxShadow: done ? (nightMode ? "0 2px 8px rgba(34,197,94,0.12)" : "0 2px 8px rgba(46,125,50,0.10)") : "none",
                  }}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: "50%",
                    border: `2px solid ${done ? (nightMode ? "#22c55e" : "#2e7d32") : (nightMode ? "rgba(255,255,255,0.18)" : "rgba(46,125,50,0.25)")}`,
                    background: done ? (nightMode ? "#22c55e" : "#2e7d32") : "transparent",
                    display: "grid", placeItems: "center", flexShrink: 0,
                    transition: "all 0.2s ease",
                    boxShadow: done ? (nightMode ? "0 0 0 3px rgba(34,197,94,0.15)" : "0 0 0 3px rgba(46,125,50,0.10)") : "none",
                  }}>
                    {done ? <span style={{ color: "#fff", fontSize: 12, fontWeight: 800, lineHeight: 1 }}>✓</span> : null}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: done ? 700 : 500, color: done ? (nightMode ? "#86efac" : "#14532d") : (nightMode ? "#b0bac8" : "#2e5c34") }}>{habit}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>


    </main>
  );
}

