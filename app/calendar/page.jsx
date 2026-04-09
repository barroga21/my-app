"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getStoredNightModePreference, isNightModeEnabled } from "@/lib/nightModePreference";

const MOODS = [
  { key: "warm", label: "Warm", color: "#F4C7A1", tint: "#fff3ea" },
  { key: "gentle", label: "Gentle", color: "#E8DCC2", tint: "#faf6ee" },
  { key: "steady", label: "Steady", color: "#C8D8C0", tint: "#f1f7ef" },
  { key: "quiet", label: "Quiet", color: "#BFCAD8", tint: "#eef3f9" },
  { key: "deep", label: "Deep", color: "#8A94A6", tint: "#edf0f4" },
];

const REFLECTION_PROMPTS = [
  "What shaped your day?",
  "What helped you today?",
  "What slowed you down?",
  "What do you want to remember from today?",
];

export default function CalendarPage() {
  const [notes, setNotes] = useState({});
  const [text, setText] = useState("");
  const [selectedDate, setSelectedDate] = useState(null);
  const [userId, setUserId] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [todosByDate, setTodosByDate] = useState({});
  const [todoInput, setTodoInput] = useState("");
  const [moodByDate, setMoodByDate] = useState({});
  const [reflectionByDate, setReflectionByDate] = useState({});
  const [photosByDate, setPhotosByDate] = useState({});
  const [habitChecks, setHabitChecks] = useState({});
  const [habitList, setHabitList] = useState([]);
  const [nightMode, setNightMode] = useState(false);

  const router = useRouter();
  const today = new Date();
  const calendarYear = 2026;
  const [month, setMonth] = useState(today.getFullYear() === 2026 ? today.getMonth() : 0);
  const daysInMonth = new Date(calendarYear, month + 1, 0).getDate();

  useEffect(() => {
    const syncNightMode = () => {
      const preference = getStoredNightModePreference();
      setNightMode(isNightModeEnabled(preference));
    };

    syncNightMode();

    const intervalId = window.setInterval(syncNightMode, 60 * 1000);
    const handleStorage = (event) => {
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

  function notesStorageKey(activeUserId) {
    return `calendar_notes_${activeUserId || "guest"}_${calendarYear}_${String(month + 1).padStart(2, "0")}`;
  }

  function ritualStorageKey(activeUserId) {
    return `calendar_ritual_${activeUserId || "guest"}_${calendarYear}_${String(month + 1).padStart(2, "0")}`;
  }

  function habitStorageKey(activeUserId) {
    return `habit_checks_${activeUserId || "guest"}_${calendarYear}_${String(month + 1).padStart(2, "0")}`;
  }

  function habitListStorageKey(activeUserId) {
    return `habit_list_${activeUserId || "guest"}`;
  }

  function habitBackupStorageKey(activeUserId) {
    return `hibi_habit_checks_backup_${activeUserId || "guest"}_${calendarYear}_${String(month + 1).padStart(2, "0")}`;
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore localStorage failures gracefully.
    }
  }

  function ymd(day) {
    return `${calendarYear}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function dayFromDate(date) {
    if (!date) return null;
    return Number(String(date).split("-")[2]);
  }

  function getMoodMeta(date) {
    const mood = moodByDate[date] || "gentle";
    return MOODS.find((m) => m.key === mood) || MOODS[1];
  }

  function getPromptForDate(date) {
    const day = dayFromDate(date) || 1;
    return REFLECTION_PROMPTS[(day - 1) % REFLECTION_PROMPTS.length];
  }

  function getHabitDoneCountForDay(day) {
    let done = 0;
    Object.entries(habitChecks).forEach(([key, value]) => {
      if (value !== "dot") return;
      const match = key.match(/-(\d+)$/);
      const dayNum = match ? Number(match[1]) : 0;
      if (dayNum === day) done += 1;
    });
    return done;
  }

  function getHibiDaySummary(date) {
    if (!date) return "Select a day and Hibi will hold the story here.";
    const day = dayFromDate(date) || 1;
    const doneCount = getHabitDoneCountForDay(day);
    const todos = todosByDate[date] || [];
    const completedTodos = todos.filter((t) => t.done).length;
    const reflection = (reflectionByDate[date] || "").trim();

    if (doneCount >= 4 && completedTodos >= 2) {
      return "You held a steady rhythm today, with calm follow-through.";
    }
    if (doneCount === 0 && completedTodos === 0 && !reflection) {
      return "A quieter day. You can keep this page gentle and simple.";
    }
    if (reflection && doneCount > 0) {
      return "You showed up and reflected. That is real momentum.";
    }
    if (doneCount > 0) {
      return "Small completions built your day one step at a time.";
    }
    return "This day is still open. Start with one tiny act.";
  }

  useEffect(() => {
    let unsubscribe = null;

    async function loadUser() {
      if (!supabase) {
        setAuthReady(true);
        return;
      }

      const { data } = await supabase.auth.getUser();
      const currentUserId = data?.user?.id || null;
      if (!currentUserId) {
        router.replace("/login");
        return;
      }

      setUserId(currentUserId);
      setAuthReady(true);

      const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
        const nextUserId = session?.user?.id || null;
        setUserId(nextUserId);
        if (!nextUserId) {
          router.replace("/login");
        }
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    }

    loadUser();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    async function loadMonthData() {
      const localNotes = readJSON(notesStorageKey(userId), {});
      const ritual = readJSON(ritualStorageKey(userId), {});
      const localHabits = readJSON(habitStorageKey(userId), {});
      const backupHabits = readJSON(habitBackupStorageKey(userId), {});
      const localHabitList = readJSON(habitListStorageKey(userId), []);

      setNotes(localNotes);
      setTodosByDate(ritual.todosByDate || {});
      setMoodByDate(ritual.moodByDate || {});
      setReflectionByDate(ritual.reflectionByDate || {});
      setPhotosByDate(ritual.photosByDate || {});
      setHabitChecks({ ...backupHabits, ...localHabits });
      setHabitList(Array.isArray(localHabitList) ? localHabitList : []);

      if (!supabase || !userId) return;

      const start = `${calendarYear}-${String(month + 1).padStart(2, "0")}-01`;
      const end = `${calendarYear}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

      const { data } = await supabase
        .from("calendar_notes")
        .select("date,note")
        .eq("user_id", userId)
        .gte("date", start)
        .lte("date", end);

      const merged = { ...localNotes };
      data?.forEach((row) => {
        merged[row.date] = row.note;
      });

      setNotes(merged);
      writeJSON(notesStorageKey(userId), merged);
    }

    loadMonthData();
  }, [month, daysInMonth, calendarYear, userId]);

  useEffect(() => {
    const initialDay = today.getFullYear() === calendarYear && today.getMonth() === month ? today.getDate() : 1;
    const date = ymd(initialDay);
    setSelectedDate(date);
    setText(notes[date] || "");
    setTodoInput("");
  }, [month]);

  useEffect(() => {
    if (selectedDate) {
      setText(notes[selectedDate] || "");
    }
  }, [selectedDate, notes]);

  function persistRitual(nextTodos, nextMoods, nextReflections, nextPhotos) {
    writeJSON(ritualStorageKey(userId), {
      todosByDate: nextTodos,
      moodByDate: nextMoods,
      reflectionByDate: nextReflections,
      photosByDate: nextPhotos,
    });
  }

  async function saveNote() {
    if (!selectedDate) return;

    const updated = { ...notes, [selectedDate]: text };
    setNotes(updated);
    writeJSON(notesStorageKey(userId), updated);

    if (!supabase || !userId) return;

    await supabase.from("calendar_notes").upsert(
      {
        user_id: userId,
        date: selectedDate,
        note: text,
      },
      { onConflict: "user_id,date" }
    );
  }

  function openDay(day) {
    const date = ymd(day);
    setSelectedDate(date);
    setText(notes[date] || "");
    setTodoInput("");
  }

  function addTodo(e) {
    e.preventDefault();
    if (!selectedDate || !todoInput.trim()) return;

    const nextTodos = {
      ...todosByDate,
      [selectedDate]: [...(todosByDate[selectedDate] || []), { text: todoInput.trim(), done: false }],
    };
    setTodosByDate(nextTodos);
    persistRitual(nextTodos, moodByDate, reflectionByDate, photosByDate);
    setTodoInput("");
  }

  function toggleTodo(index) {
    if (!selectedDate) return;
    const list = todosByDate[selectedDate] || [];
    const nextTodos = {
      ...todosByDate,
      [selectedDate]: list.map((item, i) => (i === index ? { ...item, done: !item.done } : item)),
    };
    setTodosByDate(nextTodos);
    persistRitual(nextTodos, moodByDate, reflectionByDate, photosByDate);
  }

  function removeTodo(index) {
    if (!selectedDate) return;
    const list = todosByDate[selectedDate] || [];
    const nextTodos = {
      ...todosByDate,
      [selectedDate]: list.filter((_, i) => i !== index),
    };
    setTodosByDate(nextTodos);
    persistRitual(nextTodos, moodByDate, reflectionByDate, photosByDate);
  }

  function setMood(moodKey) {
    if (!selectedDate) return;
    const nextMoods = { ...moodByDate, [selectedDate]: moodKey };
    setMoodByDate(nextMoods);
    persistRitual(todosByDate, nextMoods, reflectionByDate, photosByDate);
  }

  function setReflection(value) {
    if (!selectedDate) return;
    const nextReflections = { ...reflectionByDate, [selectedDate]: value };
    setReflectionByDate(nextReflections);
    persistRitual(todosByDate, moodByDate, nextReflections, photosByDate);
  }

  function addPhoto(file) {
    if (!selectedDate || !file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const src = String(reader.result || "");
      if (!src) return;

      const existing = photosByDate[selectedDate] || [];
      const nextPhotosForDate = [src, ...existing].slice(0, 6);
      const nextPhotos = { ...photosByDate, [selectedDate]: nextPhotosForDate };
      setPhotosByDate(nextPhotos);
      persistRitual(todosByDate, moodByDate, reflectionByDate, nextPhotos);
    };
    reader.readAsDataURL(file);
  }

  function removePhoto(index) {
    if (!selectedDate) return;
    const list = photosByDate[selectedDate] || [];
    const nextPhotos = {
      ...photosByDate,
      [selectedDate]: list.filter((_, i) => i !== index),
    };
    setPhotosByDate(nextPhotos);
    persistRitual(todosByDate, moodByDate, reflectionByDate, nextPhotos);
  }

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
  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const firstDayOfWeek = new Date(calendarYear, month, 1).getDay();

  const gridBoxes = [];
  for (let i = 0; i < firstDayOfWeek; i++) gridBoxes.push(null);
  for (let day = 1; day <= daysInMonth; day++) gridBoxes.push(day);
  while (gridBoxes.length < 42) gridBoxes.push(null);

  const selectedDay = dayFromDate(selectedDate) || 1;
  const selectedMood = selectedDate ? getMoodMeta(selectedDate) : MOODS[1];

  const weekStart = Math.max(1, selectedDay - new Date(calendarYear, month, selectedDay).getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => weekStart + i).filter((d) => d <= daysInMonth);

  const weekHabitCounts = weekDays.map((day) => getHabitDoneCountForDay(day));
  const weekMoodKeys = weekDays.map((day) => moodByDate[ymd(day)] || "gentle");

  const weekSummary = useMemo(() => {
    if (!weekHabitCounts.length) return "Gentle week in progress.";
    const peak = Math.max(...weekHabitCounts);
    const low = Math.min(...weekHabitCounts);
    const mid = weekHabitCounts[Math.floor(weekHabitCounts.length / 2)] || 0;

    if (peak === 0) return "A soft week with space to begin again.";
    if (mid < peak * 0.5 && weekHabitCounts[weekHabitCounts.length - 1] >= mid + 1) {
      return "Steady week with a gentle dip mid-week.";
    }
    if (weekHabitCounts[weekHabitCounts.length - 1] > weekHabitCounts[0]) {
      return "Your rhythm warmed as the week moved forward.";
    }
    return "A calm, steady rhythm held through the week.";
  }, [weekHabitCounts]);

  const weekMoodGradient = useMemo(() => {
    if (!weekMoodKeys.length) return "linear-gradient(90deg, #f1f7ef 0%, #eef3f9 100%)";
    const stops = weekMoodKeys.map((key, i) => {
      const m = MOODS.find((x) => x.key === key) || MOODS[1];
      const pct = weekMoodKeys.length === 1 ? 50 : Math.round((i / (weekMoodKeys.length - 1)) * 100);
      return `${m.color} ${pct}%`;
    });
    return `linear-gradient(90deg, ${stops.join(", ")})`;
  }, [weekMoodKeys]);

  const weekLinePoints = useMemo(() => {
    if (!weekHabitCounts.length) return "";
    const width = 360;
    const height = 32;
    const step = weekHabitCounts.length > 1 ? width / (weekHabitCounts.length - 1) : 0;
    const maxCount = Math.max(1, ...weekHabitCounts);

    const pts = weekHabitCounts.map((count, i) => {
      const x = i * step;
      const y = height - 4 - (count / maxCount) * (height - 8);
      return { x, y };
    });

    return pts.map((p) => `${p.x},${p.y}`).join(" ");
  }, [weekHabitCounts]);

  const totalHabits = habitList.length;

  const monthHabitDoneTotal = useMemo(() => {
    let sum = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      sum += getHabitDoneCountForDay(day);
    }
    return sum;
  }, [habitChecks, daysInMonth]);

  const monthMoodScore = useMemo(() => {
    const map = { warm: 5, gentle: 4, steady: 3, quiet: 2, deep: 1 };
    let sum = 0;
    let count = 0;
    Object.entries(moodByDate).forEach(([date, mood]) => {
      if (!String(date).startsWith(`${calendarYear}-${String(month + 1).padStart(2, "0")}`)) return;
      sum += map[mood] || 3;
      count += 1;
    });
    return count ? sum / count : 3;
  }, [moodByDate, month]);

  const monthSummary = useMemo(() => {
    if (monthHabitDoneTotal === 0) return "This month is quiet so far, with room for gentle starts.";
    if (monthHabitDoneTotal > daysInMonth * 5) return "This month had a warm, steady rhythm.";
    if (monthMoodScore >= 4) return "Your energy felt warm and open through this month.";
    if (monthMoodScore <= 2.2) return "Your energy softened this month, with reflective depth.";
    return "Your rhythm dipped and returned with calm consistency.";
  }, [monthHabitDoneTotal, daysInMonth, monthMoodScore]);

  const monthWords = useMemo(() => {
    const first = monthHabitDoneTotal > daysInMonth * 4 ? "Steady" : monthHabitDoneTotal > daysInMonth * 2 ? "Returning" : "Quiet";
    const second = monthMoodScore >= 4 ? "Warm" : monthMoodScore <= 2.2 ? "Reflective" : "Soft";
    const third = monthHabitDoneTotal > 0 ? "Growing" : "Gentle";
    return [first, second, third];
  }, [monthHabitDoneTotal, daysInMonth, monthMoodScore]);

  const memoryTiles = useMemo(() => {
    const tiles = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = ymd(day);
      const photos = photosByDate[date] || [];
      if (photos[0]) {
        tiles.push({ date, src: photos[0] });
      }
    }
    return tiles;
  }, [photosByDate, daysInMonth, month]);

  if (!authReady) {
    return (
      <main
        style={{
          padding: 24,
          minHeight: "100vh",
          background: nightMode
            ? "linear-gradient(165deg, #0f1113 0%, #15181c 50%, #1c2025 100%)"
            : "linear-gradient(150deg, #fdf6ec 0%, #e8f5e9 55%, #c8e6c9 100%)",
          fontFamily: "system-ui, sans-serif",
          color: nightMode ? "#e9ecef" : "#14532d",
        }}
      >
        Loading your calendar...
      </main>
    );
  }

  const calendarTheme = {
    panel: nightMode ? "#171a1f" : "#f5faf4",
    border: nightMode ? "#2b3139" : "#c9ddc9",
    heading: nightMode ? "#e9ecef" : "#14532d",
    body: nightMode ? "#c9d1da" : "#1b5e20",
    gridShell: nightMode ? "#1b2026" : "#c8e6c9",
    gridShadow: nightMode ? "0 2px 12px #00000066" : "0 2px 12px #a5d6a7aa",
    dayCellBg: nightMode ? "#1f252d" : null,
    dayCellBorder: nightMode ? "#38414b" : null,
    dayCardBg: nightMode ? "#171a1f" : null,
    dayCardBorder: nightMode ? "#2b3139" : null,
    inputBg: nightMode ? "#111418" : "#fff",
    inputBorder: nightMode ? "#353c46" : "#a9c8a9",
  };

  return (
    <main
      style={{
        padding: 24,
        minHeight: "100vh",
        background: nightMode
          ? "linear-gradient(165deg, #0f1113 0%, #15181c 50%, #1c2025 100%)"
          : "linear-gradient(150deg, #fdf6ec 0%, #e8f5e9 55%, #c8e6c9 100%)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 18, position: "relative" }}>
        <Link
          href="/"
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            textDecoration: "none",
            color: nightMode ? "#e9ecef" : "#14532d",
            fontWeight: 900,
            fontSize: 28,
            letterSpacing: 1.5,
            paddingLeft: 12,
            userSelect: "none",
          }}
        >
          Hibi
        </Link>
        <Link href="/calendar" style={{ textDecoration: "none", background: nightMode ? "#2b3139" : "#2e7d32", color: "#fff", padding: "10px 16px", borderRadius: 10, fontWeight: 700, boxShadow: nightMode ? "0 2px 8px #00000088" : "0 2px 8px #2e7d3240" }}>
          Calendar
        </Link>
        <Link href="/habits" style={{ textDecoration: "none", background: nightMode ? "#1c2127" : "#e8f5e9", color: nightMode ? "#e9ecef" : "#14532d", padding: "10px 16px", borderRadius: 10, fontWeight: 700, border: `1.5px solid ${nightMode ? "#2b3139" : "#2e7d32"}` }}>
          Habit Tracker
        </Link>
        <Link href="/journal" style={{ textDecoration: "none", background: nightMode ? "#1c2127" : "#e8f5e9", color: nightMode ? "#e9ecef" : "#14532d", padding: "10px 16px", borderRadius: 10, fontWeight: 700, border: `1.5px solid ${nightMode ? "#2b3139" : "#2e7d32"}` }}>
          Journal
        </Link>
        <Link href="/profile" style={{ textDecoration: "none", background: nightMode ? "#1c2127" : "#e8f5e9", color: nightMode ? "#e9ecef" : "#14532d", padding: "10px 16px", borderRadius: 10, fontWeight: 700, border: `1.5px solid ${nightMode ? "#2b3139" : "#2e7d32"}` }}>
          Profile
        </Link>
        <button
          onClick={async () => {
            if (supabase) await supabase.auth.signOut();
            router.replace("/login");
          }}
          style={{ textDecoration: "none", background: nightMode ? "#1c2127" : "#e8f5e9", color: nightMode ? "#e9ecef" : "#14532d", padding: "10px 16px", borderRadius: 10, fontWeight: 700, border: `1.5px solid ${nightMode ? "#2b3139" : "#2e7d32"}`, cursor: "pointer" }}
        >
          Log Out
        </button>
      </div>

      <section style={{ maxWidth: 1080, margin: "0 auto 14px", background: calendarTheme.panel, border: `1px solid ${calendarTheme.border}`, borderRadius: 16, padding: "12px 14px", boxShadow: nightMode ? "0 2px 10px #00000055" : "0 2px 10px #94b89422" }}>
        <p style={{ margin: 0, color: calendarTheme.heading, fontSize: 13, fontWeight: 700 }}>Month Overview</p>
        <p style={{ margin: "6px 0 0", color: calendarTheme.body, fontSize: 16 }}>{monthSummary}</p>
      </section>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 26, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 670px", maxWidth: 720 }}>
          <h1 style={{ color: calendarTheme.heading, fontWeight: 800, fontSize: 36, letterSpacing: 1, marginBottom: 4 }}>Calendar</h1>

          <div style={{ display: "flex", alignItems: "center", gap: 10, color: nightMode ? "#b6bdc7" : "#388e3c", fontWeight: 600, fontSize: 24, marginBottom: 10 }}>
            <button
              onClick={() => setMonth((m) => Math.max(0, m - 1))}
              disabled={month === 0}
              style={{ border: "none", background: month === 0 ? (nightMode ? "#2a2f36" : "#cfd8dc") : (nightMode ? "#2b3139" : "#2e7d32"), color: "#fff", borderRadius: 999, width: 34, height: 34, cursor: month === 0 ? "not-allowed" : "pointer", fontSize: 18, fontWeight: 700 }}
              aria-label="Previous month"
            >
              ←
            </button>
            <span>{monthNames[month]} {calendarYear}</span>
            <button
              onClick={() => setMonth((m) => Math.min(11, m + 1))}
              disabled={month === 11}
              style={{ border: "none", background: month === 11 ? (nightMode ? "#2a2f36" : "#cfd8dc") : (nightMode ? "#2b3139" : "#2e7d32"), color: "#fff", borderRadius: 999, width: 34, height: 34, cursor: month === 11 ? "not-allowed" : "pointer", fontSize: 18, fontWeight: 700 }}
              aria-label="Next month"
            >
              →
            </button>
          </div>

          <div style={{ marginBottom: 10, border: `1px solid ${calendarTheme.border}`, borderRadius: 14, background: nightMode ? "#1b2026" : "#f4faf2", padding: "10px 12px" }}>
            <div style={{ height: 8, borderRadius: 999, background: weekMoodGradient, marginBottom: 8, opacity: 0.35 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <svg width="360" height="34" viewBox="0 0 360 34">
                <line x1="0" y1="30" x2="360" y2="30" stroke={nightMode ? "#3a4350" : "#d3e2d3"} strokeWidth="1" opacity="0.7" />
                <polyline points={weekLinePoints} fill="none" stroke="#A8C3A0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p style={{ margin: 0, color: nightMode ? "#b6bdc7" : "#2e7d32", fontSize: 13 }}>{weekSummary}</p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, marginBottom: 4 }}>
            {weekdayNames.map((wd) => (
              <div key={wd} style={{ textAlign: "center", color: calendarTheme.heading, fontWeight: 700, fontSize: 16, letterSpacing: 1, padding: "6px 0", borderRadius: 6 }}>
                {wd}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, marginTop: 4, background: calendarTheme.gridShell, borderRadius: 16, boxShadow: calendarTheme.gridShadow, padding: 14 }}>
            {gridBoxes.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} />;

              const date = ymd(day);
              const mood = getMoodMeta(date);
              const doneCount = getHabitDoneCountForDay(day);
              const progress = totalHabits > 0 ? Math.min(1, doneCount / totalHabits) : 0;
              const ringCircumference = 2 * Math.PI * 4;
              const ringOffset = ringCircumference * (1 - progress);
              const isSelected = selectedDate === date;
              const thumb = (photosByDate[date] || [])[0];

              return (
                <button
                  key={date}
                  onClick={() => openDay(day)}
                  style={{
                    aspectRatio: "1 / 1",
                    width: "100%",
                    minWidth: 0,
                    borderRadius: 14,
                    border: doneCount > 0 ? `1.5px solid ${nightMode ? "#5d6a7a" : "#91b293"}` : `1px solid ${calendarTheme.dayCellBorder || "#c7d8c8"}`,
                    cursor: "pointer",
                    background: calendarTheme.dayCellBg || mood.tint,
                    color: calendarTheme.heading,
                    boxShadow: notes[date] ? `inset 0 0 0 1px ${nightMode ? "#566273" : "#8eb592"}` : "none",
                    outline: isSelected ? `2px solid ${nightMode ? "#7f8b9a" : "#2e7d32"}` : "none",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: 8,
                    position: "relative",
                    transition: "all 0.2s ease",
                  }}
                >
                  <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{day}</span>

                  {thumb ? (
                    <img
                      src={thumb}
                      alt="Memory"
                      style={{ position: "absolute", right: 6, top: 6, width: 16, height: 16, borderRadius: 4, objectFit: "cover", boxShadow: "0 1px 4px #00000022" }}
                    />
                  ) : null}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: mood.color, opacity: 0.92 }} />
                    <span style={{ width: 12, height: 12, display: "grid", placeItems: "center" }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                        <circle cx="6" cy="6" r="4" fill="none" stroke={nightMode ? "#3a4350" : "#d6e5d6"} strokeWidth="1" />
                        <circle
                          cx="6"
                          cy="6"
                          r="4"
                          fill="none"
                          stroke="#7fae86"
                          strokeWidth="1"
                          strokeLinecap="round"
                          strokeDasharray={ringCircumference}
                          strokeDashoffset={ringOffset}
                          transform="rotate(-90 6 6)"
                        />
                      </svg>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 12, border: `1px solid ${calendarTheme.border}`, borderRadius: 14, background: calendarTheme.panel, padding: "10px 12px" }}>
            <p style={{ margin: "0 0 6px", color: calendarTheme.heading, fontWeight: 700, fontSize: 13 }}>Memory Strip</p>
            {memoryTiles.length ? (
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
                {memoryTiles.map((tile) => (
                  <button
                    key={`tile-${tile.date}`}
                    onClick={() => setSelectedDate(tile.date)}
                    style={{ border: selectedDate === tile.date ? `2px solid ${nightMode ? "#7f8b9a" : "#2e7d32"}` : `1px solid ${nightMode ? "#2b3139" : "#cad9ca"}`, borderRadius: 8, background: nightMode ? "#111418" : "#fff", padding: 2, cursor: "pointer" }}
                    title={tile.date}
                  >
                    <img src={tile.src} alt={tile.date} style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover" }} />
                  </button>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, color: nightMode ? "#9aa3af" : "#6b8b6b", fontSize: 13 }}>Add photos to build your month memory strip.</p>
            )}
          </div>

          <div style={{ marginTop: 12, color: calendarTheme.body, fontWeight: 600, fontSize: 16 }}>
            {monthWords.join(" • ")}
          </div>
        </div>

        <aside style={{ flex: "0 0 360px", width: 360, maxWidth: "100%" }}>
          <div
            key={`day-card-${selectedDate}`}
            className="day-card-transition"
            style={{
              background: calendarTheme.dayCardBg || selectedMood.tint,
              border: `1px solid ${calendarTheme.dayCardBorder || "#c9ddc9"}`,
              borderRadius: 16,
              boxShadow: nightMode ? "0 6px 20px #00000066" : "0 6px 20px #90b59022",
              padding: 16,
              display: "grid",
              gap: 12,
            }}
          >
            <div>
              <p style={{ margin: 0, color: calendarTheme.heading, fontWeight: 800, fontSize: 22 }}>{selectedDate || "Select a day"}</p>
              <p style={{ margin: "6px 0 0", color: nightMode ? "#b6bdc7" : "#2e7d32", fontSize: 14 }}>{getPromptForDate(selectedDate)}</p>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {MOODS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMood(m.key)}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: (selectedDate && moodByDate[selectedDate] === m.key) ? `2px solid ${calendarTheme.heading}` : `1px solid ${nightMode ? "#39424d" : "#b7c9b7"}`,
                    background: m.color,
                    cursor: "pointer",
                  }}
                  title={m.label}
                />
              ))}
            </div>

            <form onSubmit={addTodo} style={{ display: "flex", gap: 8 }}>
              <input
                value={todoInput}
                onChange={(e) => setTodoInput(e.target.value)}
                placeholder="Add a tiny intention"
                style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${calendarTheme.inputBorder}`, background: calendarTheme.inputBg, color: calendarTheme.heading }}
              />
              <button type="submit" style={{ border: "none", background: nightMode ? "#2b3139" : "#2e7d32", color: "#fff", borderRadius: 8, padding: "8px 10px", fontWeight: 700, cursor: "pointer" }}>Add</button>
            </form>

            <div style={{ display: "grid", gap: 6 }}>
              {(todosByDate[selectedDate] || []).map((todo, idx) => (
                <div key={`todo-${idx}`} style={{ display: "flex", alignItems: "center", gap: 8, background: nightMode ? "#111418" : "#ffffffc7", border: `1px solid ${nightMode ? "#39424d" : "#d4e2d4"}`, borderRadius: 8, padding: "6px 8px" }}>
                  <input type="checkbox" checked={todo.done} onChange={() => toggleTodo(idx)} />
                  <span style={{ flex: 1, color: calendarTheme.heading, textDecoration: todo.done ? "line-through" : "none", opacity: todo.done ? 0.7 : 1 }}>{todo.text}</span>
                  <button onClick={() => removeTodo(idx)} style={{ border: "none", background: "transparent", color: "#7c2d2d", fontWeight: 700, cursor: "pointer" }}>×</button>
                </div>
              ))}
              {!((todosByDate[selectedDate] || []).length) && (
                <p style={{ margin: 0, color: nightMode ? "#9aa3af" : "#6b8b6b", fontSize: 13 }}>No intentions yet for this day.</p>
              )}
            </div>

            <div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write your day note..."
                style={{ width: "100%", minHeight: 90, borderRadius: 8, border: `1px solid ${calendarTheme.inputBorder}`, padding: 10, resize: "vertical", fontFamily: "inherit", color: calendarTheme.heading, background: calendarTheme.inputBg }}
              />
              <button onClick={saveNote} style={{ marginTop: 8, border: "none", background: nightMode ? "#2b3139" : "#2e7d32", color: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}>
                Save Day Card
              </button>
            </div>

            <div>
              <input
                value={reflectionByDate[selectedDate] || ""}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="Tiny reflection"
                style={{ width: "100%", borderRadius: 8, border: `1px solid ${calendarTheme.inputBorder}`, padding: "9px 10px", color: calendarTheme.heading, background: calendarTheme.inputBg }}
              />
            </div>

            <div>
              <label style={{ color: calendarTheme.heading, fontWeight: 600, fontSize: 13 }}>
                Memory Tile
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => addPhoto(e.target.files?.[0])}
                  style={{ display: "block", marginTop: 6 }}
                />
              </label>
              <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto" }}>
                {(photosByDate[selectedDate] || []).map((src, idx) => (
                  <div key={`photo-${idx}`} style={{ position: "relative" }}>
                    <img src={src} alt={`memory-${idx}`} style={{ width: 50, height: 50, borderRadius: 8, objectFit: "cover", border: `1px solid ${nightMode ? "#39424d" : "#cfddcf"}` }} />
                    <button
                      onClick={() => removePhoto(idx)}
                      style={{ position: "absolute", right: -4, top: -4, width: 16, height: 16, borderRadius: "50%", border: "none", background: "#7c2d2d", color: "#fff", fontSize: 10, cursor: "pointer", lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${nightMode ? "#2f3742" : "#d4e3d4"}`, paddingTop: 10 }}>
              <p style={{ margin: 0, color: calendarTheme.body, fontSize: 14 }}>{getHibiDaySummary(selectedDate)}</p>
            </div>
          </div>
        </aside>
      </div>

      <style jsx>{`
        .day-card-transition {
          animation: dayCardIn 0.28s ease;
        }

        @keyframes dayCardIn {
          0% {
            opacity: 0;
            transform: translateY(8px);
            filter: saturate(0.94);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
            filter: saturate(1);
          }
        }
      `}</style>
    </main>
  );
}
