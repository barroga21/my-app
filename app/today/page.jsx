"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  getStoredNightModePreference,
  isNightModeEnabled,
  NIGHT_MODE_OPTIONS,
  setStoredNightModePreference,
} from "@/lib/nightModePreference";

const MOOD_TONES = [
  { key: "warm", label: "Warm", color: "#F4C7A1", tint: "#fff3ea" },
  { key: "neutral", label: "Neutral", color: "#E8DCC2", tint: "#faf6ee" },
  { key: "steady", label: "Steady", color: "#C8D8C0", tint: "#f1f7ef" },
  { key: "cool", label: "Cool", color: "#BFCAD8", tint: "#eef3f9" },
  { key: "deep", label: "Deep", color: "#8A94A6", tint: "#edf0f4" },
];

const DAILY_PROMPTS = [
  "What stayed with you today?",
  "What softened or strengthened you?",
  "What do you want to remember from this moment?",
  "What surprised you today?",
];

const TAG_OPTIONS = ["morning", "relationship", "work", "energy", "gratitude"];
const WRITE_GUIDES = [
  "Start with one true sentence.",
  "What are you carrying right now?",
  "Name one thing that felt alive today.",
  "What do you want to release before sleep?",
];

const YEAR = 2026;

function makeEmptyEntry() {
  return {
    id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text: "",
    mood: "neutral",
    tags: [],
    photos: [],
    hibiNote: "",
    updatedAt: null,
  };
}

function normalizeEntry(raw) {
  return {
    id: raw?.id || `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text: typeof raw?.text === "string" ? raw.text : "",
    mood: typeof raw?.mood === "string" ? raw.mood : "neutral",
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
    photos: Array.isArray(raw?.photos) ? raw.photos : [],
    hibiNote: typeof raw?.hibiNote === "string" ? raw.hibiNote : "",
    updatedAt: typeof raw?.updatedAt === "number" ? raw.updatedAt : null,
  };
}

function normalizeEntriesMap(rawMap) {
  const next = {};
  Object.entries(rawMap || {}).forEach(([date, value]) => {
    if (Array.isArray(value)) {
      next[date] = value.map((entry) => normalizeEntry(entry));
      return;
    }

    if (value && typeof value === "object") {
      const migrated = normalizeEntry({ ...value, id: `legacy_${date}` });
      if (migrated.text || migrated.photos.length || migrated.tags.length) {
        next[date] = [migrated];
      }
    }
  });
  return next;
}

export default function JournalPage() {
  const router = useRouter();
  const textareaRef = useRef(null);

  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState(null);

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState(now.getDate());

  const [entriesByDate, setEntriesByDate] = useState({});
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [draftEntry, setDraftEntry] = useState(makeEmptyEntry());

  const [writeWithHibi, setWriteWithHibi] = useState(false);
  const [nightModePreference, setNightModePreference] = useState(NIGHT_MODE_OPTIONS.AUTO);
  const [autoNightTimestamp, setAutoNightTimestamp] = useState(Date.now());

  const [calendarPhotosByDate, setCalendarPhotosByDate] = useState({});
  const [habitChecks, setHabitChecks] = useState({});

  const daysInMonth = new Date(YEAR, selectedMonth + 1, 0).getDate();
  const nightMode = isNightModeEnabled(nightModePreference, new Date(autoNightTimestamp));

  function dateKey(day, month = selectedMonth) {
    return `${YEAR}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function journalStorageKey(activeUserId) {
    return `hibi_journal_${activeUserId || "guest"}_${YEAR}_all`;
  }

  function legacyJournalStorageKey(activeUserId, month) {
    return `hibi_journal_${activeUserId || "guest"}_${YEAR}_${String(month + 1).padStart(2, "0")}`;
  }

  function calendarRitualKey(activeUserId, month) {
    return `calendar_ritual_${activeUserId || "guest"}_${YEAR}_${String(month + 1).padStart(2, "0")}`;
  }

  function habitStorageKey(activeUserId, month) {
    return `habit_checks_${activeUserId || "guest"}_${YEAR}_${String(month + 1).padStart(2, "0")}`;
  }

  function habitBackupStorageKey(activeUserId, month) {
    return `hibi_habit_checks_backup_${activeUserId || "guest"}_${YEAR}_${String(month + 1).padStart(2, "0")}`;
  }

  function safeRead(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore localStorage write errors.
    }
  }

  function generateHibiNote(text, mood, tags) {
    const trimmed = (text || "").trim();
    if (!trimmed) return "A quiet page can still hold a real feeling.";

    if (mood === "warm") return "You sound grounded and warm today.";
    if (mood === "cool") return "There is a soft reflective tone in your words.";
    if (mood === "deep") return "You carried a lot today, and you gave it language.";
    if (tags.includes("gratitude")) return "There is gratitude here, and it brightens the entry.";
    if (trimmed.length > 350) return "You went deeper today. There is care in this reflection.";
    return "Your energy feels steady and returning.";
  }

  function getEntriesForDate(date) {
    return entriesByDate[date] || [];
  }

  function saveEntriesMap(nextMap) {
    setEntriesByDate(nextMap);
    safeWrite(journalStorageKey(userId), nextMap);
  }

  function beginNewEntry() {
    setSelectedEntryId(null);
    setDraftEntry(makeEmptyEntry());
  }

  function selectExistingEntry(entryId) {
    const list = getEntriesForDate(dateKey(selectedDay));
    const found = list.find((entry) => entry.id === entryId);
    if (!found) return;
    setSelectedEntryId(entryId);
    setDraftEntry(normalizeEntry(found));
  }

  function saveEntry() {
    const cleanedText = (draftEntry.text || "").trim();
    const hasContent = cleanedText || draftEntry.photos.length || draftEntry.tags.length;
    if (!hasContent) return;

    const key = dateKey(selectedDay);
    const list = getEntriesForDate(key);

    const finalEntry = {
      ...normalizeEntry(draftEntry),
      text: draftEntry.text,
      updatedAt: Date.now(),
      hibiNote: generateHibiNote(draftEntry.text, draftEntry.mood, draftEntry.tags || []),
    };

    let nextList;
    if (selectedEntryId) {
      nextList = list.map((entry) => (entry.id === selectedEntryId ? finalEntry : entry));
    } else {
      nextList = [finalEntry, ...list];
    }

    const nextMap = {
      ...entriesByDate,
      [key]: nextList,
    };

    saveEntriesMap(nextMap);
    setSelectedEntryId(finalEntry.id);
    setDraftEntry(finalEntry);
  }

  function deleteCurrentEntry() {
    if (!selectedEntryId) return;

    const key = dateKey(selectedDay);
    const list = getEntriesForDate(key);
    const nextList = list.filter((entry) => entry.id !== selectedEntryId);

    const nextMap = { ...entriesByDate };
    if (nextList.length) {
      nextMap[key] = nextList;
    } else {
      delete nextMap[key];
    }

    saveEntriesMap(nextMap);

    if (nextList.length) {
      setSelectedEntryId(nextList[0].id);
      setDraftEntry(normalizeEntry(nextList[0]));
    } else {
      beginNewEntry();
    }
  }

  function applyFormatting(kind) {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const current = draftEntry.text || "";
    const selected = current.slice(start, end) || "text";

    let wrapped = selected;
    if (kind === "bold") wrapped = `**${selected}**`;
    if (kind === "italic") wrapped = `*${selected}*`;
    if (kind === "highlight") wrapped = `==${selected}==`;

    const nextText = current.slice(0, start) + wrapped + current.slice(end);
    setDraftEntry((prev) => ({ ...prev, text: nextText }));

    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = start;
      ta.selectionEnd = start + wrapped.length;
    });
  }

  function insertTag(tag) {
    setDraftEntry((prev) => {
      if (prev.tags.includes(tag)) return prev;
      return { ...prev, tags: [...prev.tags, tag] };
    });
  }

  function removeTag(tag) {
    setDraftEntry((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  }

  function addEntryPhoto(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const src = String(reader.result || "");
      if (!src) return;
      setDraftEntry((prev) => ({ ...prev, photos: [src, ...prev.photos].slice(0, 8) }));
    };
    reader.readAsDataURL(file);
  }

  function removeEntryPhoto(index) {
    setDraftEntry((prev) => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index),
    }));
  }

  useEffect(() => {
    let unsubscribe = null;

    async function checkAuth() {
      if (!supabase) {
        setAuthReady(true);
        return;
      }

      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id || null;
      if (!uid) {
        router.replace("/login");
        return;
      }

      setUserId(uid);
      setAuthReady(true);

      const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
        if (!session?.user) {
          router.replace("/login");
          return;
        }
        setUserId(session.user.id);
      });

      unsubscribe = () => listener.subscription.unsubscribe();
    }

    checkAuth();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    const allKey = journalStorageKey(userId);
    const allJournal = safeRead(allKey, {});

    let normalized = normalizeEntriesMap(allJournal);

    // Migrate any older per-month journal keys into the year-level storage.
    for (let m = 0; m < 12; m++) {
      const legacy = safeRead(legacyJournalStorageKey(userId, m), {});
      const legacyNormalized = normalizeEntriesMap(legacy);
      normalized = { ...legacyNormalized, ...normalized };
    }

    setEntriesByDate(normalized);
    safeWrite(allKey, normalized);
  }, [userId]);

  useEffect(() => {
    setNightModePreference(getStoredNightModePreference());
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNightModePreference(getStoredNightModePreference());
      setAutoNightTimestamp(Date.now());
    }, 60 * 1000);

    const handleStorage = (event) => {
      if (!event.key || event.key === "hibi_night_mode_preference") {
        setNightModePreference(getStoredNightModePreference());
        setAutoNightTimestamp(Date.now());
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const ritual = safeRead(calendarRitualKey(userId, selectedMonth), {});
    setCalendarPhotosByDate(ritual.photosByDate || {});

    const primaryHabits = safeRead(habitStorageKey(userId, selectedMonth), {});
    const backupHabits = safeRead(habitBackupStorageKey(userId, selectedMonth), {});
    setHabitChecks({ ...backupHabits, ...primaryHabits });
  }, [userId, selectedMonth]);

  useEffect(() => {
    if (selectedDay > daysInMonth) {
      setSelectedDay(daysInMonth);
    }
  }, [selectedMonth, daysInMonth, selectedDay]);

  useEffect(() => {
    const key = dateKey(selectedDay);
    const list = getEntriesForDate(key);

    if (!list.length) {
      beginNewEntry();
      return;
    }

    if (!selectedEntryId || !list.some((entry) => entry.id === selectedEntryId)) {
      setSelectedEntryId(list[0].id);
      setDraftEntry(normalizeEntry(list[0]));
    }
  }, [selectedDay, selectedMonth, entriesByDate]);

  const currentMood = MOOD_TONES.find((m) => m.key === draftEntry.mood) || MOOD_TONES[1];
  const prompt = DAILY_PROMPTS[(selectedDay - 1) % DAILY_PROMPTS.length];

  const theme = nightMode
    ? {
        page: "linear-gradient(165deg, #0f1113 0%, #15181c 50%, #1c2025 100%)",
        text: "#e9ecef",
        panel: "#171a1f",
        muted: "#b6bdc7",
        border: "#2b3139",
        input: "#111418",
        accent: "#7f8b9a",
      }
    : {
        page: `linear-gradient(160deg, ${currentMood.tint} 0%, #eef7ee 62%, #deeedf 100%)`,
        text: "#14532d",
        panel: "#f6fbf5",
        muted: "#2e7d32",
        border: "#c5dec6",
        input: "#ffffff",
        accent: "#2e7d32",
      };

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const journaledDays = useMemo(() => {
    const rows = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const list = getEntriesForDate(dateKey(day));
      if (list.length) {
        rows.push({ day, mood: list[0].mood || "neutral", count: list.length });
      }
    }
    return rows;
  }, [entriesByDate, selectedMonth, daysInMonth]);

  const entriesForSelectedDay = getEntriesForDate(dateKey(selectedDay));

  const calendarPhotoTiles = useMemo(() => {
    const list = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const key = dateKey(day);
      const photos = calendarPhotosByDate[key] || [];
      if (photos[0]) list.push({ day, src: photos[0] });
    }
    return list;
  }, [calendarPhotosByDate, selectedMonth, daysInMonth]);

  const weeklySummary = useMemo(() => {
    const currentDate = new Date(YEAR, selectedMonth, selectedDay);
    const weekStart = selectedDay - currentDate.getDay();
    const weekDays = Array.from({ length: 7 }, (_, i) => weekStart + i).filter((d) => d >= 1 && d <= daysInMonth);

    let entryDays = 0;
    let morningCompleted = 0;
    let morningEntryDays = 0;

    weekDays.forEach((day) => {
      const key = dateKey(day);
      const hasEntry = getEntriesForDate(key).length > 0;
      if (hasEntry) entryDays += 1;

      let dayMorningDone = 0;
      Object.entries(habitChecks).forEach(([habitKey, value]) => {
        const m = habitKey.match(/-(\d+)$/);
        const dayNum = m ? Number(m[1]) : 0;
        if (dayNum !== day) return;
        const habitName = habitKey.replace(/-(\d+)$/, "").toLowerCase();
        if ((habitName.includes("am") || habitName.includes("morning")) && value === "dot") {
          dayMorningDone += 1;
        }
      });

      if (dayMorningDone > 0) {
        morningCompleted += 1;
        if (hasEntry) morningEntryDays += 1;
      }
    });

    if (entryDays === 0) return "This week is quiet so far. One gentle entry can begin the arc.";
    if (morningCompleted >= 2 && morningEntryDays >= Math.ceil(morningCompleted * 0.6)) {
      return "You wrote more on days you completed morning habits.";
    }
    if (entryDays >= 5) return "Your week felt steady with a reflective middle.";
    return "Your week moved softly, with writing on your steadier days.";
  }, [entriesByDate, habitChecks, selectedDay, selectedMonth]);

  if (!authReady) {
    return (
      <main
        style={{
          padding: 24,
          minHeight: "100vh",
          background: "linear-gradient(150deg, #fdf6ec 0%, #e8f5e9 55%, #c8e6c9 100%)",
          fontFamily: "system-ui, sans-serif",
          color: "#14532d",
        }}
      >
        Loading your journal...
      </main>
    );
  }

  return (
    <main
      style={{
        padding: 24,
        minHeight: "100vh",
        background: theme.page,
        fontFamily: "system-ui, sans-serif",
        color: theme.text,
        position: "relative",
        transition: "background 0.35s ease",
      }}
    >
      {writeWithHibi ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: nightMode ? "rgba(0,0,0,0.5)" : "rgba(10,16,12,0.45)",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          marginBottom: 18,
          position: "relative",
          zIndex: 2,
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
            color: theme.text,
            fontWeight: 900,
            fontSize: 28,
            letterSpacing: 1.5,
            paddingLeft: 12,
            userSelect: "none",
          }}
        >
          Hibi
        </Link>
        <Link href="/calendar" style={{ textDecoration: "none", background: nightMode ? "#1c2127" : "#e8f5e9", color: theme.text, padding: "10px 16px", borderRadius: 10, fontWeight: 700, border: `1.5px solid ${theme.border}` }}>
          Calendar
        </Link>
        <Link href="/habits" style={{ textDecoration: "none", background: nightMode ? "#1c2127" : "#e8f5e9", color: theme.text, padding: "10px 16px", borderRadius: 10, fontWeight: 700, border: `1.5px solid ${theme.border}` }}>
          Habit Tracker
        </Link>
        <Link href="/journal" style={{ textDecoration: "none", background: nightMode ? "#2b3139" : "#2e7d32", color: "#fff", padding: "10px 16px", borderRadius: 10, fontWeight: 700, boxShadow: nightMode ? "0 2px 8px #00000088" : "0 2px 8px #2e7d3240" }}>
          Journal
        </Link>
        <Link href="/profile" style={{ textDecoration: "none", background: nightMode ? "#1c2127" : "#e8f5e9", color: theme.text, padding: "10px 16px", borderRadius: 10, fontWeight: 700, border: `1.5px solid ${theme.border}` }}>
          Profile
        </Link>
        <button
          onClick={async () => {
            if (supabase) await supabase.auth.signOut();
            router.replace("/login");
          }}
          style={{ textDecoration: "none", background: nightMode ? "#1c2127" : "#e8f5e9", color: theme.text, padding: "10px 16px", borderRadius: 10, fontWeight: 700, border: `1.5px solid ${theme.border}`, cursor: "pointer" }}
        >
          Log Out
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 1140, margin: "0 auto 10px", zIndex: 2, position: "relative", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 36, letterSpacing: 1, color: theme.text, fontWeight: 800 }}>Journal</h1>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            style={{ border: `1px solid ${theme.border}`, background: theme.panel, color: theme.text, borderRadius: 8, padding: "7px 8px", fontWeight: 700 }}
          >
            {monthNames.map((name, idx) => (
              <option key={name} value={idx}>{name} {YEAR}</option>
            ))}
          </select>
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(Number(e.target.value))}
            style={{ border: `1px solid ${theme.border}`, background: theme.panel, color: theme.text, borderRadius: 8, padding: "7px 8px", fontWeight: 700 }}
          >
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
              <option key={`day-opt-${day}`} value={day}>Day {day}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setWriteWithHibi((v) => !v)}
            style={{ border: `1px solid ${theme.border}`, background: writeWithHibi ? theme.accent : theme.panel, color: writeWithHibi ? "#fff" : theme.text, borderRadius: 999, padding: "7px 12px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}
          >
            Write With Hibi
          </button>
          <select
            value={nightModePreference}
            onChange={(e) => {
              const next = e.target.value;
              setNightModePreference(next);
              setStoredNightModePreference(next);
            }}
            style={{ border: `1px solid ${theme.border}`, background: theme.panel, color: theme.text, borderRadius: 999, padding: "7px 10px", fontWeight: 700, fontSize: 12 }}
          >
            <option value={NIGHT_MODE_OPTIONS.AUTO}>Night: Auto</option>
            <option value={NIGHT_MODE_OPTIONS.ON}>Night: Always on</option>
            <option value={NIGHT_MODE_OPTIONS.OFF}>Night: Always off</option>
          </select>
        </div>
      </div>

      <div style={{ maxWidth: 1140, margin: "0 auto", display: "grid", gridTemplateColumns: "170px 1fr", gap: 14, alignItems: "start", position: "relative", zIndex: 2 }}>
        <aside
          style={{
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: 14,
            padding: 12,
            minHeight: 320,
          }}
        >
          <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: theme.muted }}>Reflection Timeline</p>

          <div style={{ position: "relative", paddingLeft: 16 }}>
            {journaledDays.length > 1 ? (
              <div style={{ position: "absolute", left: 18, top: 10, bottom: 10, width: 1.5, background: nightMode ? "#353c46" : "#b9d2ba" }} />
            ) : null}

            <div style={{ display: "grid", gap: 10 }}>
              {journaledDays.map((item) => {
                const mood = MOOD_TONES.find((m) => m.key === item.mood) || MOOD_TONES[1];
                const active = item.day === selectedDay;
                return (
                  <button
                    key={`day-dot-${item.day}`}
                    onClick={() => setSelectedDay(item.day)}
                    style={{
                      border: "none",
                      background: "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      textAlign: "left",
                      cursor: "pointer",
                      color: theme.text,
                      padding: 0,
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: mood.color, boxShadow: active ? `0 0 0 3px ${nightMode ? "#2d3440" : "#d6ead7"}` : "none" }} />
                      <span style={{ fontSize: 12, fontWeight: active ? 800 : 600 }}>{item.day}</span>
                    </span>
                    <span style={{ fontSize: 11, color: theme.muted }}>{item.count}</span>
                  </button>
                );
              })}

              {!journaledDays.length ? (
                <p style={{ margin: 0, color: theme.muted, fontSize: 12 }}>Your timeline begins with your first saved entry.</p>
              ) : null}
            </div>
          </div>
        </aside>

        <section
          style={{
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: 16,
            boxShadow: nightMode ? "0 10px 25px #00000066" : "0 4px 14px #94b89422",
            padding: 16,
            transition: "all 0.25s ease",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <p style={{ margin: 0, color: theme.muted, fontWeight: 700, fontSize: 13 }}>{dateKey(selectedDay)}</p>
            <button
              onClick={beginNewEntry}
              style={{ border: `1px solid ${theme.border}`, background: theme.input, color: theme.text, borderRadius: 8, padding: "6px 10px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}
            >
              + New Entry
            </button>
          </div>
          <p style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 600, color: theme.text }}>{prompt}</p>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {entriesForSelectedDay.map((entry, idx) => {
              const active = entry.id === selectedEntryId;
              return (
                <button
                  key={entry.id}
                  onClick={() => selectExistingEntry(entry.id)}
                  style={{ border: `1px solid ${theme.border}`, background: active ? (nightMode ? "#2b3139" : "#e7f4e8") : theme.input, color: theme.text, borderRadius: 999, padding: "4px 10px", fontSize: 12, cursor: "pointer", fontWeight: active ? 700 : 600 }}
                >
                  Entry {entriesForSelectedDay.length - idx}
                </button>
              );
            })}
            {!entriesForSelectedDay.length ? <span style={{ fontSize: 12, color: theme.muted }}>No entries saved for this day yet.</span> : null}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {MOOD_TONES.map((m) => (
              <button
                key={m.key}
                onClick={() => setDraftEntry((prev) => ({ ...prev, mood: m.key }))}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: draftEntry.mood === m.key ? `2px solid ${theme.text}` : "1px solid #b7c9b7",
                  background: m.color,
                  cursor: "pointer",
                }}
                title={m.label}
              />
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button type="button" onClick={() => applyFormatting("bold")} style={toolbarBtn(theme)}>Bold</button>
            <button type="button" onClick={() => applyFormatting("italic")} style={toolbarBtn(theme)}>Italic</button>
            <button type="button" onClick={() => applyFormatting("highlight")} style={toolbarBtn(theme)}>Highlight</button>
            <label style={{ ...toolbarBtn(theme), cursor: "pointer" }}>
              Insert Photo
              <input type="file" accept="image/*" onChange={(e) => addEntryPhoto(e.target.files?.[0])} style={{ display: "none" }} />
            </label>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) insertTag(e.target.value);
                e.target.value = "";
              }}
              style={{ ...toolbarBtn(theme), paddingRight: 22 }}
            >
              <option value="">Insert Tag</option>
              {TAG_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {writeWithHibi ? (
            <p style={{ margin: "0 0 8px", color: theme.muted, fontSize: 13 }}>{WRITE_GUIDES[Math.floor(((draftEntry.text || "").length / 80) % WRITE_GUIDES.length)]}</p>
          ) : null}

          <textarea
            ref={textareaRef}
            value={draftEntry.text}
            onChange={(e) => setDraftEntry((prev) => ({ ...prev, text: e.target.value }))}
            placeholder="Write here..."
            style={{
              width: "100%",
              minHeight: 260,
              resize: "vertical",
              borderRadius: 10,
              border: `1px solid ${theme.border}`,
              background: theme.input,
              color: theme.text,
              padding: 12,
              fontSize: 16,
              lineHeight: 1.45,
              outline: "none",
              boxShadow: nightMode ? "inset 0 1px 2px #00000066" : "inset 0 1px 2px #b9d0ba55",
            }}
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(draftEntry.tags || []).map((tag) => (
                <button
                  key={`tag-${tag}`}
                  onClick={() => removeTag(tag)}
                  style={{ border: `1px solid ${theme.border}`, background: nightMode ? "#20262d" : "#ecf6ec", color: theme.text, borderRadius: 999, padding: "4px 8px", fontSize: 12, cursor: "pointer" }}
                >
                  #{tag} ×
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              {selectedEntryId ? (
                <button
                  onClick={deleteCurrentEntry}
                  style={{ border: `1px solid ${theme.border}`, background: nightMode ? "#2a2020" : "#f7eaea", color: nightMode ? "#ffd1d1" : "#8a2a2a", borderRadius: 8, padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}
                >
                  Delete Entry
                </button>
              ) : null}
              <button
                onClick={saveEntry}
                style={{ border: "none", background: theme.accent, color: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}
              >
                Save Entry
              </button>
            </div>
          </div>

          {(draftEntry.photos || []).length ? (
            <div style={{ marginTop: 10, display: "flex", gap: 6, overflowX: "auto" }}>
              {draftEntry.photos.map((src, idx) => (
                <div key={`entry-photo-${idx}`} style={{ position: "relative" }}>
                  <img src={src} alt={`Entry ${idx + 1}`} style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", border: `1px solid ${theme.border}` }} />
                  <button
                    onClick={() => removeEntryPhoto(idx)}
                    style={{ position: "absolute", right: -5, top: -5, width: 16, height: 16, borderRadius: "50%", border: "none", background: "#8a2a2a", color: "#fff", fontSize: 10, cursor: "pointer", lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div style={{ marginTop: 12, padding: 10, borderRadius: 10, border: `1px solid ${theme.border}`, background: nightMode ? "#1d2229" : "#f0f8f0" }}>
            <p style={{ margin: 0, color: theme.muted, fontWeight: 700, fontSize: 12 }}>Hibi Note</p>
            <p style={{ margin: "6px 0 0", color: theme.text }}>
              {draftEntry.hibiNote || "Write and save to receive a gentle Hibi reflection."}
            </p>
          </div>

          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: `1px solid ${theme.border}`, background: nightMode ? "#1d2229" : "#f7fbf7" }}>
            <p style={{ margin: 0, color: theme.muted, fontWeight: 700, fontSize: 12 }}>Weekly Journal Summary</p>
            <p style={{ margin: "6px 0 0", color: theme.text }}>{weeklySummary}</p>
          </div>
        </section>
      </div>

      <section
        style={{
          maxWidth: 1140,
          margin: "12px auto 0",
          background: theme.panel,
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          padding: 10,
          position: "relative",
          zIndex: 2,
        }}
      >
        <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: theme.muted }}>Photo Memories</p>
        {calendarPhotoTiles.length ? (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            {calendarPhotoTiles.map((tile) => (
              <button
                key={`calendar-photo-${tile.day}`}
                onClick={() => setSelectedDay(tile.day)}
                style={{ border: selectedDay === tile.day ? `2px solid ${theme.accent}` : `1px solid ${theme.border}`, borderRadius: 8, background: "transparent", padding: 2, cursor: "pointer" }}
                title={dateKey(tile.day)}
              >
                <img src={tile.src} alt={dateKey(tile.day)} style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover" }} />
              </button>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, color: theme.muted, fontSize: 13 }}>Upload photos in Calendar to build your journal memory strip.</p>
        )}
      </section>
    </main>
  );
}

function toolbarBtn(theme) {
  return {
    border: `1px solid ${theme.border}`,
    background: theme.input,
    color: theme.text,
    borderRadius: 8,
    padding: "6px 8px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };
}
