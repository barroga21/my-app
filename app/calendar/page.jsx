"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useNightMode } from "@/lib/useNightMode";
import NavBar from "@/app/components/NavBar";

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
  const nightMode = useNightMode();
  const [journalMoodByDate, setJournalMoodByDate] = useState({});
  const [hoverPreview, setHoverPreview] = useState(null);

  const router = useRouter();
  const today = new Date();
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const daysInMonth = new Date(calendarYear, month + 1, 0).getDate();

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
    if (!userId) return;
    try {
      const key = `hibi_journal_${userId}_${calendarYear}_all`;
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : {};
      const moodMap = {};
      if (parsed && typeof parsed === "object") {
        Object.entries(parsed).forEach(([date, entries]) => {
          if (Array.isArray(entries) && entries.length > 0) {
            const first = entries.find((e) => e.mood) || entries[0];
            if (first?.mood) moodMap[date] = first.mood;
          }
        });
      }
      setJournalMoodByDate(moodMap);
    } catch {
      // Ignore localStorage errors
    }
  }, [userId, calendarYear, month]);

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

  useEffect(() => {
    function handleKeyNav(e) {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (!selectedDate) return;
      const curDay = Number(String(selectedDate).split("-")[2] || 1);
      if (e.key === "j" || e.key === "J") {
        const nextDay = Math.max(1, curDay - 1);
        if (nextDay !== curDay) openDay(nextDay);
      }
      if (e.key === "k" || e.key === "K") {
        const nextDay = Math.min(daysInMonth, curDay + 1);
        if (nextDay !== curDay) openDay(nextDay);
      }
    }
    window.addEventListener("keydown", handleKeyNav);
    return () => window.removeEventListener("keydown", handleKeyNav);
  }, [selectedDate, daysInMonth]);

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
    const current = moodByDate[selectedDate];
    const nextMoods = { ...moodByDate };
    if (current === moodKey) {
      delete nextMoods[selectedDate];
    } else {
      nextMoods[selectedDate] = moodKey;
    }
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

    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX = 800;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const src = canvas.toDataURL("image/jpeg", 0.7);

      const existing = photosByDate[selectedDate] || [];
      const nextPhotosForDate = [src, ...existing].slice(0, 6);
      const nextPhotos = { ...photosByDate, [selectedDate]: nextPhotosForDate };
      setPhotosByDate(nextPhotos);
      persistRitual(todosByDate, moodByDate, reflectionByDate, nextPhotos);
    };
    img.onerror = () => URL.revokeObjectURL(objectUrl);
    img.src = objectUrl;
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
    panel: nightMode ? "rgba(12,16,22,0.82)" : "rgba(255,255,255,0.82)",
    border: nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)",
    heading: nightMode ? "#dde3ea" : "#0d2a14",
    body: nightMode ? "#b0bac8" : "#1a4a22",
    muted: nightMode ? "#6a8a70" : "#4a7a50",
    gridShell: nightMode ? "rgba(15,20,26,0.85)" : "rgba(240,250,240,0.90)",
    gridShadow: nightMode ? "0 4px 24px rgba(0,0,0,0.55)" : "0 4px 24px rgba(46,125,50,0.12)",
    dayCellBg: nightMode ? "rgba(20,26,34,0.88)" : "rgba(255,255,255,0.75)",
    dayCellBorder: nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)",
    dayCardBg: nightMode ? "rgba(12,16,22,0.82)" : "rgba(255,255,255,0.82)",
    dayCardBorder: nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)",
    inputBg: nightMode ? "rgba(7,10,15,0.9)" : "rgba(255,255,255,0.95)",
    inputBorder: nightMode ? "rgba(255,255,255,0.12)" : "rgba(46,125,50,0.25)",
    glass: nightMode ? "rgba(12,16,22,0.82)" : "rgba(255,255,255,0.82)",
    glassBorder: nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)",
    accent: nightMode ? "#22c55e" : "#1a6e36",
  };

  return (
    <main
      style={{
        padding: "28px 24px",
        minHeight: "100vh",
        background: nightMode
          ? "linear-gradient(145deg, #070b0d 0%, #0c1117 35%, #101820 70%, #0e1a14 100%)"
          : "linear-gradient(145deg, #f7fbf4 0%, #eef7e8 40%, #e0f0da 75%, #d4ead4 100%)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
        animation: "hibiFadeIn 0.35s ease",
      }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto 24px" }}>
        <NavBar activePage="calendar" />
      </div>

      <section style={{ maxWidth: 1080, margin: "0 auto 14px", background: calendarTheme.glass, backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", border: `1px solid ${calendarTheme.glassBorder}`, borderRadius: 18, padding: "12px 18px", boxShadow: nightMode ? "0 4px 24px rgba(0,0,0,0.5)" : "0 4px 20px rgba(46,125,50,0.10)" }}>
        <p style={{ margin: 0, color: calendarTheme.heading, fontSize: 13, fontWeight: 700 }}>Month Overview</p>
        <p style={{ margin: "6px 0 0", color: calendarTheme.body, fontSize: 16 }}>{monthSummary}</p>
      </section>

      <div className="hibi-calendar-flex" style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 26, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 670px", maxWidth: 720 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <h1 style={{ color: calendarTheme.heading, fontWeight: 800, fontSize: "clamp(26px, 5vw, 38px)", letterSpacing: -0.5, margin: 0 }}>Calendar</h1>
            <button
              onClick={() => {
                setCalendarYear(today.getFullYear());
                setMonth(today.getMonth());
                setSelectedDate(ymd(today.getDate()));
              }}
              style={{
                background: "#388e3c",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 700,
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: 15,
                marginLeft: 12,
              }}
            >
              Jump to Today
            </button>
          </div>

          <div className="hibi-cal-month-nav" style={{ display: "flex", alignItems: "center", gap: 10, color: nightMode ? "#b6bdc7" : "#388e3c", fontWeight: 600, fontSize: 24, marginBottom: 10 }}>
            <button
              onClick={() => {
                if (month === 0) { setCalendarYear((y) => y - 1); setMonth(11); }
                else setMonth((m) => m - 1);
              }}
              style={{ border: "none", background: nightMode ? "#2b3139" : "#2e7d32", color: "#fff", borderRadius: 999, width: 34, height: 34, cursor: "pointer", fontSize: 18, fontWeight: 700 }}
              aria-label="Previous month"
            >
              ←
            </button>
            <button
              onClick={() => setCalendarYear((y) => y - 1)}
              style={{ border: "none", background: "transparent", color: nightMode ? "#6a8a70" : "#4a7a50", borderRadius: 6, padding: "2px 6px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              aria-label="Previous year"
            >
              ‹{calendarYear - 1}
            </button>
            <span style={{ minWidth: 160, textAlign: "center" }}>{monthNames[month]} {calendarYear}</span>
            <button
              onClick={() => setCalendarYear((y) => y + 1)}
              style={{ border: "none", background: "transparent", color: nightMode ? "#6a8a70" : "#4a7a50", borderRadius: 6, padding: "2px 6px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              aria-label="Next year"
            >
              {calendarYear + 1}›
            </button>
            <button
              onClick={() => {
                if (month === 11) { setCalendarYear((y) => y + 1); setMonth(0); }
                else setMonth((m) => m + 1);
              }}
              style={{ border: "none", background: nightMode ? "#2b3139" : "#2e7d32", color: "#fff", borderRadius: 999, width: 34, height: 34, cursor: "pointer", fontSize: 18, fontWeight: 700 }}
              aria-label="Next month"
            >
              →
            </button>
          </div>

          <div style={{ marginBottom: 10, border: `1px solid ${calendarTheme.border}`, borderRadius: 14, background: nightMode ? "#1b2026" : "#f4faf2", padding: "10px 12px" }}>
            <div style={{ height: 8, borderRadius: 999, background: weekMoodGradient, marginBottom: 8, opacity: 0.35 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <svg width="100%" height="34" viewBox="0 0 360 34" style={{ minWidth: 0, flexShrink: 1 }}>
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
                  onMouseEnter={(e) => {
                    const notePreview = notes[date] ? String(notes[date]).slice(0, 120) : "No note yet";
                    const moodLabel = (journalMoodByDate[date] || mood.key || "gentle");
                    const x = Math.min(e.clientX, window.innerWidth - 260);
                    const y = Math.min(e.clientY, window.innerHeight - 80);
                    setHoverPreview({ x, y, text: `${date} · Mood: ${moodLabel} · Habits: ${doneCount}/${totalHabits || 0} · ${notePreview}` });
                  }}
                  onMouseMove={(e) => {
                    const x = Math.min(e.clientX, window.innerWidth - 260);
                    const y = Math.min(e.clientY, window.innerHeight - 80);
                    setHoverPreview((prev) => prev ? { ...prev, x, y } : prev);
                  }}
                  onMouseLeave={() => setHoverPreview(null)}
                  className="hibi-cal-day-btn"
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
                    alignItems: "center",
                    padding: 8,
                    position: "relative",
                    transition: "all 0.2s ease",
                  }}
                >
                  <span className="hibi-cal-day-num" style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{day}</span>
                  {thumb ? (
                    <img
                      src={thumb}
                      alt="Memory"
                      style={{ position: "absolute", right: 6, top: 6, width: 16, height: 16, borderRadius: 4, objectFit: "cover", boxShadow: "0 1px 4px #00000022" }}
                    />
                  ) : null}
                  {journalMoodByDate[date] ? (
                    <span
                      title={`Journal mood: ${journalMoodByDate[date]}`}
                      style={{ position: "absolute", left: 5, bottom: 5, width: 7, height: 7, borderRadius: "50%", background: (MOODS.find((m) => m.key === journalMoodByDate[date]) || MOODS[1]).color, boxShadow: "0 0 0 1.5px #fff4" }}
                    />
                  ) : null}

                  <span className="hibi-cal-day-ring" style={{ width: 22, height: 22, display: "grid", placeItems: "center", margin: "4px auto 0" }}>
                    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                      <circle cx="9" cy="9" r="8" fill={mood.color} stroke={nightMode ? "#3a4350" : "#d6e5d6"} strokeWidth="1.5" />
                      <circle
                        cx="9"
                        cy="9"
                        r="7"
                        fill="none"
                        stroke="#7fae86"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 7}
                        strokeDashoffset={2 * Math.PI * 7 * (1 - progress)}
                        transform="rotate(-90 9 9)"
                      />
                    </svg>
                  </span>
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

        <aside className="hibi-calendar-aside" style={{ flex: "0 0 360px", width: 360, maxWidth: "100%", minWidth: 0, overflow: "hidden" }}>
          {/* Mini Month View */}
          <div className="hibi-mini-calendar" style={{ marginBottom: 24, background: nightMode ? "#1b2026" : "#f4faf2", border: `1px solid ${nightMode ? "#2b3139" : "#c8e6c9"}`, borderRadius: 12, padding: 12 }}>
            <div style={{ textAlign: "center", fontWeight: 700, color: nightMode ? "#e9ecef" : "#14532d", fontSize: 18, marginBottom: 6 }}>
              {monthNames[month]} {calendarYear}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
              {weekdayNames.map((wd) => (
                <div key={wd} style={{ textAlign: "center", color: nightMode ? "#b6bdc7" : "#388e3c", fontWeight: 700, fontSize: 13 }}>{wd[0]}</div>
              ))}
              {(() => {
                const firstDay = new Date(calendarYear, month, 1).getDay();
                const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
                const boxes = [];
                for (let i = 0; i < firstDay; i++) boxes.push(null);
                for (let day = 1; day <= daysInMonth; day++) boxes.push(day);
                while (boxes.length % 7 !== 0) boxes.push(null);
                return boxes.map((day, idx) => {
                  if (!day) return <div key={`mini-empty-${idx}`} />;
                  const date = ymd(day);
                  const isToday = today.getFullYear() === calendarYear && today.getMonth() === month && today.getDate() === day;
                  const isSelected = selectedDate === date;
                  const mood = getMoodMeta(date);
                  return (
                    <button
                      key={`mini-${date}`}
                      onClick={() => { setMonth(month); setSelectedDate(date); }}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        border: isSelected ? `2px solid #388e3c` : isToday ? `1.5px solid #2e7d32` : `1px solid #cbd5e1`,
                        background: mood.tint,
                        color: isToday ? "#388e3c" : "#222",
                        fontWeight: 600,
                        fontSize: 14,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: 0,
                        padding: 0,
                        cursor: "pointer",
                        boxShadow: isSelected ? "0 0 0 2px #388e3c55" : undefined,
                        transition: "box-shadow 0.2s, border 0.2s",
                      }}
                      title={mood.label}
                    >
                      {day}
                    </button>
                  );
                });
              })()}
            </div>
          </div>
          {/* ...existing day card code follows... */}
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

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {MOODS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMood(m.key)}
                  className="hibi-mood-dot"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px 6px",
                    borderRadius: 8,
                    outline: (selectedDate && moodByDate[selectedDate] === m.key) ? `2px solid ${calendarTheme.heading}` : "none",
                    outlineOffset: 2,
                  }}
                  title={m.label}
                >
                  <span style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: m.color,
                    border: (selectedDate && moodByDate[selectedDate] === m.key) ? `2px solid ${calendarTheme.heading}` : `1px solid ${nightMode ? "#39424d" : "#b7c9b7"}`,
                    display: "block",
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 12, fontWeight: (selectedDate && moodByDate[selectedDate] === m.key) ? 700 : 500, color: calendarTheme.body }}>{m.label}</span>
                </button>
              ))}
            </div>

            <form onSubmit={addTodo} className="hibi-day-add-form" style={{ display: "flex", gap: 8, width: "100%" }}>
              <input
                value={todoInput}
                onChange={(e) => setTodoInput(e.target.value)}
                placeholder="Add a tiny intention"
                style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 8, border: `1px solid ${calendarTheme.inputBorder}`, background: calendarTheme.inputBg, color: calendarTheme.heading, boxSizing: "border-box" }}
              />
              <button type="submit" style={{ border: "none", background: nightMode ? "#2b3139" : "#2e7d32", color: "#fff", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Add</button>
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

            <div className="hibi-day-note-wrapper" style={{ minWidth: 0 }}>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write your day note..."
                style={{ width: "100%", minHeight: 90, borderRadius: 8, border: `1px solid ${calendarTheme.inputBorder}`, padding: 10, resize: "vertical", fontFamily: "inherit", color: calendarTheme.heading, background: calendarTheme.inputBg, boxSizing: "border-box", display: "block" }}
              />
              <button onClick={saveNote} style={{ marginTop: 8, border: "none", background: nightMode ? "#2b3139" : "#2e7d32", color: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}>
                Save Day Card
              </button>
            </div>

            <div>
              <label htmlFor="reflection-input" style={{ display: "block", color: calendarTheme.heading, fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                Reflection
              </label>
              <input
                id="reflection-input"
                value={reflectionByDate[selectedDate] || ""}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="Tiny reflection"
                style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, border: `1px solid ${calendarTheme.inputBorder}`, padding: "9px 10px", color: calendarTheme.heading, background: calendarTheme.inputBg }}
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

      {hoverPreview ? (
        <div
          style={{
            position: "fixed",
            left: hoverPreview.x + 14,
            top: Math.max(12, hoverPreview.y + 14),
            maxWidth: 240,
            padding: "8px 10px",
            borderRadius: 10,
            border: `1px solid ${nightMode ? "rgba(255,255,255,0.14)" : "rgba(46,125,50,0.2)"}`,
            background: nightMode ? "rgba(10,14,20,0.95)" : "rgba(255,255,255,0.96)",
            color: nightMode ? "#d7dee8" : "#12361c",
            fontSize: 12,
            lineHeight: 1.35,
            zIndex: 1200,
            boxShadow: nightMode ? "0 8px 28px rgba(0,0,0,0.5)" : "0 8px 24px rgba(46,125,50,0.18)",
            pointerEvents: "none",
          }}
        >
          {hoverPreview.text}
        </div>
      ) : null}

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
