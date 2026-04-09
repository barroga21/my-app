"use client";
import { useEffect, useRef, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getStoredNightModePreference, isNightModeEnabled } from "@/lib/nightModePreference";

export default function HabitTracker() {
  const defaultHabits = [
    "AM Skincare",
    "PM Skincare",
    "Make Bed",
    "Water 3L",
    "Treadmill",
    "Weights",
    "French",
    "Tagalog",
    "Vietnamese",
    "Film",
    "Read",
    "Journal",
    "Apply",
    "Substack",
    "Caffeine",
    "Cooking",
    "Music Making",
    "Protein",
    "Vitamin D",
    "Fish Oil",
    "Magnesium",
  ];
  const [habits, setHabits] = useState([]);
  const [newHabit, setNewHabit] = useState("");
  const [checked, setChecked] = useState({});
  const [status, setStatus] = useState("");
  const [userId, setUserId] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [dailyCloseout, setDailyCloseout] = useState({
    helped: "",
    slowed: "",
    carry: "",
  });
  const [monthCloseouts, setMonthCloseouts] = useState({});
  const [closeoutStatus, setCloseoutStatus] = useState("");
  const [tonePreset, setTonePreset] = useState("balanced");
  const [editingHabit, setEditingHabit] = useState(null);
  const [editingHabitValue, setEditingHabitValue] = useState("");
  const [completionPulseKey, setCompletionPulseKey] = useState(null);
  const [completionCheckKey, setCompletionCheckKey] = useState(null);
  const [habitNotes, setHabitNotes] = useState({});
  const [softFocusMode, setSoftFocusMode] = useState(false);
  const [softFocusHabit, setSoftFocusHabit] = useState("");
  const [softFocusTransition, setSoftFocusTransition] = useState(false);
  const [softFocusCardKey, setSoftFocusCardKey] = useState(0);
  const [nightMode, setNightMode] = useState(false);
  const cellClickTimersRef = useRef({});
  const router = useRouter();

  const now = new Date();
  const minYear = 2026;
  const minMonth = 0; // January
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-based

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  function habitStorageKey(activeUserId) {
    return `habit_checks_${activeUserId || "guest"}_${viewYear}_${String(viewMonth + 1).padStart(2, "0")}`;
  }

  function habitChecksBackupKey(activeUserId) {
    return `hibi_habit_checks_backup_${activeUserId || "guest"}_${viewYear}_${String(viewMonth + 1).padStart(2, "0")}`;
  }

  function habitListStorageKey(activeUserId) {
    return `habit_list_${activeUserId || "guest"}`;
  }

  function closeoutStorageKey(activeUserId) {
    return `habit_closeouts_${activeUserId || "guest"}_${viewYear}_${String(viewMonth + 1).padStart(2, "0")}`;
  }

  function habitNotesStorageKey(activeUserId) {
    return `habit_notes_${activeUserId || "guest"}_${viewYear}_${String(viewMonth + 1).padStart(2, "0")}`;
  }

  function readLocalMonthChecks(activeUserId) {
    try {
      const raw = localStorage.getItem(habitStorageKey(activeUserId));
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function readLocalMonthChecksBackup(activeUserId) {
    try {
      const raw = localStorage.getItem(habitChecksBackupKey(activeUserId));
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeLocalMonthChecks(map, activeUserId) {
    try {
      localStorage.setItem(habitStorageKey(activeUserId), JSON.stringify(map));
      localStorage.setItem(habitChecksBackupKey(activeUserId), JSON.stringify(map));
    } catch {
      // Ignore localStorage failures gracefully.
    }
  }

  function readLocalHabitList(activeUserId) {
    try {
      const raw = localStorage.getItem(habitListStorageKey(activeUserId));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeLocalHabitList(list, activeUserId) {
    try {
      localStorage.setItem(habitListStorageKey(activeUserId), JSON.stringify(list));
    } catch {
      // Ignore localStorage failures gracefully.
    }
  }

  function readLocalCloseouts(activeUserId) {
    try {
      const raw = localStorage.getItem(closeoutStorageKey(activeUserId));
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeLocalCloseouts(map, activeUserId) {
    try {
      localStorage.setItem(closeoutStorageKey(activeUserId), JSON.stringify(map));
    } catch {
      // Ignore localStorage failures gracefully.
    }
  }

  function readLocalHabitNotes(activeUserId) {
    try {
      const raw = localStorage.getItem(habitNotesStorageKey(activeUserId));
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeLocalHabitNotes(map, activeUserId) {
    try {
      localStorage.setItem(habitNotesStorageKey(activeUserId), JSON.stringify(map));
    } catch {
      // Ignore localStorage failures gracefully.
    }
  }

  function formatDate(day) {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function goPrevMonth() {
    if (viewYear === minYear && viewMonth === minMonth) {
      return;
    }
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }

  function goNextMonth() {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }

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

  useEffect(() => {
    let unsubscribe = null;

    async function loadUser() {
      if (!supabase) {
        setStatus("Supabase is not configured. Using local saved data.");
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
    async function loadHabitList() {
      const localList = readLocalHabitList(userId);

      // Only show default habits for first-time users (no local or remote habits)
      if (localList.length > 0) {
        setHabits(localList);
      } else if (!supabase || !userId) {
        // If no Supabase or user, and no local habits, start empty (do not restore defaults after deletion)
        setHabits([]);
        writeLocalHabitList([], userId);
        return;
      }

      const { data, error } = await supabase
        .from("user_habits")
        .select("habit_name,sort_order")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true });


      if (error) {
        // If error and no local habits, start empty (do not restore defaults after deletion)
        if (localList.length === 0) {
          setHabits([]);
          writeLocalHabitList([], userId);
        }
        return;
      }

      const remoteList = (data || []).map((row) => row.habit_name).filter(Boolean);
      if (remoteList.length > 0) {
        setHabits(remoteList);
        writeLocalHabitList(remoteList, userId);
      } else if (localList.length === 0) {
        // If no remote or local habits, start empty (do not restore defaults after deletion)
        setHabits([]);
        writeLocalHabitList([], userId);
      }
    }

    loadHabitList();
  }, [userId]);

  useEffect(() => {
    async function loadChecks() {
      const localMap = readLocalMonthChecks(userId);
      const backupMap = readLocalMonthChecksBackup(userId);
      const hasPrimary = Object.keys(localMap).length > 0;
      const hasBackup = Object.keys(backupMap).length > 0;
      const hydratedLocalMap = hasPrimary
        ? { ...backupMap, ...localMap }
        : hasBackup
        ? backupMap
        : localMap;

      if (!hasPrimary && hasBackup) {
        // Restore primary storage from backup if the primary key was cleared or renamed.
        writeLocalMonthChecks(backupMap, userId);
      }

      setChecked(hydratedLocalMap);

      if (!supabase) {
        setStatus("Supabase is not configured. Using local saved data.");
        return;
      }

      if (!userId) {
          // Do not show status message for logged-in users
        return;
      }

      const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
      const { data, error } = await supabase
        .from("habit_checks")
        .select("habit,date,completed")
        .eq("user_id", userId)
        .like("date", `${monthPrefix}%`);

      if (error) {
        // Do not show Supabase error message to user
        return;
      }

      const map = { ...hydratedLocalMap };
      data?.forEach((row) => {
        const day = Number(String(row.date).split("-")[2]);
        map[`${row.habit}-${day}`] = row.completed ? "dot" : "fill";
      });
      setChecked(map);
      writeLocalMonthChecks(map, userId);
      setStatus("Connected to Supabase.");
    }
    loadChecks();
  }, [viewMonth, viewYear, userId]);

  useEffect(() => {
    const localCloseouts = readLocalCloseouts(userId);
    setMonthCloseouts(localCloseouts);

    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const todayCloseout = localCloseouts[todayKey] || { helped: "", slowed: "", carry: "" };
    setDailyCloseout(todayCloseout);
  }, [userId, viewYear, viewMonth]);

  useEffect(() => {
    const localNotes = readLocalHabitNotes(userId);
    setHabitNotes(localNotes);
  }, [userId, viewYear, viewMonth]);

  function saveDailyCloseout(e) {
    e.preventDefault();
    const entry = {
      helped: dailyCloseout.helped.trim(),
      slowed: dailyCloseout.slowed.trim(),
      carry: dailyCloseout.carry.trim(),
    };

    const hasContent = entry.helped || entry.slowed || entry.carry;
    if (!hasContent) {
      setCloseoutStatus("Write at least one line before saving.");
      return;
    }

    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const updated = { ...monthCloseouts, [todayKey]: entry };
    setMonthCloseouts(updated);
    writeLocalCloseouts(updated, userId);
    setCloseoutStatus("Closeout saved. Hibi will remember this in your monthly story.");
  }

  async function setHabitCellState(habit, day, next) {
    if (day > daysInMonth) {
      return;
    }

    const key = `${habit}-${day}`;

    setChecked((prev) => {
      const updated = { ...prev };
      if (next === "empty") {
        delete updated[key];
      } else {
        updated[key] = next;
      }
      writeLocalMonthChecks(updated, userId);
      return updated;
    });

    if (next === "dot") {
      setCompletionPulseKey(key);
      setCompletionCheckKey(key);
      setTimeout(() => setCompletionPulseKey((current) => (current === key ? null : current)), 420);
      setTimeout(() => setCompletionCheckKey((current) => (current === key ? null : current)), 620);
    }

    setStatus("Updated.");

    if (!supabase || !userId) {
      return;
    }

    const date = formatDate(day);

    if (next === "empty") {
      const { error } = await supabase
        .from("habit_checks")
        .delete()
        .eq("user_id", userId)
        .eq("habit", habit)
        .eq("date", date);

      if (error) {
        setStatus("Updated.");
      }
      return;
    }

    const { error } = await supabase
      .from("habit_checks")
      .upsert(
        {
          user_id: userId,
          habit,
          date,
          completed: next === "dot",
        },
        { onConflict: "user_id,habit,date" }
      );

    if (error) {
      setStatus("Updated.");
    }
  }

  async function toggle(habit, day) {
    if (day > daysInMonth) {
      return;
    }
    const key = `${habit}-${day}`;
    const current = checked[key] || "empty";
    const next = current === "empty" ? "dot" : current === "dot" ? "fill" : "empty";
    await setHabitCellState(habit, day, next);
  }

  async function addHabit(e) {
    e.preventDefault();
    const habitName = newHabit.trim();
    if (!habitName) return;
    if (habits.some((h) => h.toLowerCase() === habitName.toLowerCase())) {
      setStatus("Habit already exists.");
      return;
    }

    const updated = [...habits, habitName];
    setHabits(updated);
    writeLocalHabitList(updated, userId);
    setNewHabit("");
    setStatus("Updated.");

    if (!supabase || !userId) return;

    const { error } = await supabase
      .from("user_habits")
      .upsert(
        {
          user_id: userId,
          habit_name: habitName,
          sort_order: updated.length - 1,
        },
        { onConflict: "user_id,habit_name" }
      );

    if (error) {
      setStatus("Updated.");
    }
  }

  async function removeHabit(habitName) {
    const updated = habits.filter((h) => h !== habitName);
    setHabits(updated);
    writeLocalHabitList(updated, userId);
    setStatus("Updated.");

    setHabitNotes((prev) => {
      const next = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (!key.startsWith(`${habitName}-`)) {
          next[key] = value;
        }
      });
      writeLocalHabitNotes(next, userId);
      return next;
    });

    setChecked((prev) => {
      const next = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (!key.startsWith(`${habitName}-`)) {
          next[key] = value;
        }
      });
      writeLocalMonthChecks(next, userId);
      return next;
    });

    if (!supabase || !userId) return;

    const { error: habitError } = await supabase
      .from("user_habits")
      .delete()
      .eq("user_id", userId)
      .eq("habit_name", habitName);

    if (habitError) {
      setStatus("Updated.");
    }

    await supabase
      .from("habit_checks")
      .delete()
      .eq("user_id", userId)
      .eq("habit", habitName);
  }

  async function renameHabit(oldHabitName) {
    const nextHabitName = editingHabitValue.trim();
    if (!nextHabitName) {
      setStatus("Habit name cannot be empty.");
      return;
    }

    if (
      nextHabitName.toLowerCase() !== oldHabitName.toLowerCase() &&
      habits.some((h) => h.toLowerCase() === nextHabitName.toLowerCase())
    ) {
      setStatus("Habit already exists.");
      return;
    }

    if (nextHabitName === oldHabitName) {
      setEditingHabit(null);
      setEditingHabitValue("");
      return;
    }

    const updatedHabits = habits.map((h) => (h === oldHabitName ? nextHabitName : h));
    setHabits(updatedHabits);
    writeLocalHabitList(updatedHabits, userId);

    setChecked((prev) => {
      const next = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (key.startsWith(`${oldHabitName}-`)) {
          const day = key.slice(oldHabitName.length + 1);
          next[`${nextHabitName}-${day}`] = value;
        } else {
          next[key] = value;
        }
      });
      writeLocalMonthChecks(next, userId);
      return next;
    });

    setHabitNotes((prev) => {
      const next = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (key.startsWith(`${oldHabitName}-`)) {
          const day = key.slice(oldHabitName.length + 1);
          next[`${nextHabitName}-${day}`] = value;
        } else {
          next[key] = value;
        }
      });
      writeLocalHabitNotes(next, userId);
      return next;
    });

    setEditingHabit(null);
    setEditingHabitValue("");
    setStatus("Updated.");

    if (!supabase || !userId) return;

    const { error: habitsError } = await supabase
      .from("user_habits")
      .update({ habit_name: nextHabitName })
      .eq("user_id", userId)
      .eq("habit_name", oldHabitName);

    if (habitsError) {
      setStatus("Updated.");
    }

    const { error: checksError } = await supabase
      .from("habit_checks")
      .update({ habit: nextHabitName })
      .eq("user_id", userId)
      .eq("habit", oldHabitName);

    if (checksError) {
      setStatus("Updated.");
    }
  }

  function saveHabitNote(habit, day, text) {
    if (day > daysInMonth) return;
    const key = `${habit}-${day}`;
    const cleaned = String(text || "").trim().slice(0, 48);
    setHabitNotes((prev) => {
      const next = { ...prev };
      if (cleaned) {
        next[key] = cleaned;
      } else {
        delete next[key];
      }
      writeLocalHabitNotes(next, userId);
      return next;
    });
    setStatus("Updated.");
  }

  function openHabitNoteEditor(habit, day) {
    if (day > daysInMonth) return;
    const key = `${habit}-${day}`;
    const existing = habitNotes[key] || "";
    const next = window.prompt("Add a tiny note for this habit (optional)", existing);
    if (next === null) return;
    saveHabitNote(habit, day, next);
  }

  function handleHabitCellClick(habit, day, event) {
    if (day > daysInMonth) return;
    const key = `${habit}-${day}`;

    if (event.detail === 2) {
      if (cellClickTimersRef.current[key]) {
        clearTimeout(cellClickTimersRef.current[key]);
        delete cellClickTimersRef.current[key];
      }
      openHabitNoteEditor(habit, day);
      return;
    }

    if (cellClickTimersRef.current[key]) {
      clearTimeout(cellClickTimersRef.current[key]);
    }

    cellClickTimersRef.current[key] = setTimeout(() => {
      toggle(habit, day);
      delete cellClickTimersRef.current[key];
    }, 180);
  }

  useEffect(() => {
    return () => {
      Object.values(cellClickTimersRef.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

    // Top-level drag-and-drop handler
    const onDragEnd = async (result) => {
      if (!result.destination) return;
      const reordered = Array.from(habits);
      const [removed] = reordered.splice(result.source.index, 1);
      reordered.splice(result.destination.index, 0, removed);
      setHabits(reordered);
      writeLocalHabitList(reordered, userId);
      setStatus("Updated.");
      // Update sort_order in Supabase
      if (supabase && userId) {
        for (let i = 0; i < reordered.length; i++) {
          await supabase
            .from("user_habits")
            .update({ sort_order: i })
            .eq("user_id", userId)
            .eq("habit_name", reordered[i]);
        }
      }
    };
  // Month label
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthLabel = `${monthNames[viewMonth]} ${viewYear}`;
  const isAtMinMonth = viewYear === minYear && viewMonth === minMonth;
  const isCurrentViewedMonth =
    viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const analysisDays = isCurrentViewedMonth ? now.getDate() : daysInMonth;
  const ringDay = isCurrentViewedMonth ? now.getDate() : Math.min(now.getDate(), daysInMonth);

  const ringDoneCount = habits.reduce((sum, habit) => {
    return checked[`${habit}-${ringDay}`] === "dot" ? sum + 1 : sum;
  }, 0);
  const ringProgress = habits.length ? ringDoneCount / habits.length : 0;
  const ringRadius = 16;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - ringProgress);
  const whispers = [
    "Let's take today one step at a time.",
    "Start with this.",
    "We'll move gently through your habits.",
  ];

  function getNextFocusHabit() {
    return habits.find((habit) => checked[`${habit}-${ringDay}`] !== "dot") || habits[0] || "";
  }

  function getSoftFocusWhisper() {
    const doneCount = habits.reduce((sum, habit) => (checked[`${habit}-${ringDay}`] === "dot" ? sum + 1 : sum), 0);
    if (doneCount === 0) return whispers[0];
    if (doneCount < Math.max(1, Math.ceil(habits.length / 2))) return whispers[1];
    return whispers[2];
  }

  function getNextHabitInSequence(currentHabit) {
    if (!habits.length) return "";
    const currentIndex = habits.indexOf(currentHabit);
    if (currentIndex === -1) return habits[0];
    return habits[(currentIndex + 1) % habits.length];
  }

  async function handleSoftFocusAction(nextState) {
    if (!softFocusHabit) return;

    await setHabitCellState(softFocusHabit, ringDay, nextState);
    setSoftFocusTransition(true);

    setTimeout(() => {
      setSoftFocusHabit(getNextHabitInSequence(softFocusHabit));
      setSoftFocusCardKey((prev) => prev + 1);
      setSoftFocusTransition(false);
    }, 180);
  }

  useEffect(() => {
    const nextHabit = getNextFocusHabit();
    if (!softFocusHabit || !habits.includes(softFocusHabit)) {
      setSoftFocusHabit(nextHabit);
    }
  }, [habits, checked, ringDay]);

  const habitStats = habits.map((habit) => {
    let done = 0;
    let missed = 0;
    for (let day = 1; day <= analysisDays; day++) {
      const value = checked[`${habit}-${day}`] || "empty";
      if (value === "dot") done += 1;
      if (value === "fill") missed += 1;
    }
    const rate = analysisDays ? done / analysisDays : 0;
    return { habit, done, missed, rate };
  });

  const lowestHabits = [...habitStats]
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 3);

  const monthlyDone = habitStats.reduce((sum, h) => sum + h.done, 0);
  const monthlyMissed = habitStats.reduce((sum, h) => sum + h.missed, 0);
  const totalPossible = habits.length * analysisDays;
  const overallRate = totalPossible ? Math.round((monthlyDone / totalPossible) * 100) : 0;

  const dayDoneCounts = Array.from({ length: analysisDays }, (_, idx) => {
    const day = idx + 1;
    return habits.reduce((sum, habit) => {
      return checked[`${habit}-${day}`] === "dot" ? sum + 1 : sum;
    }, 0);
  });

  const restartCount = dayDoneCounts.reduce((sum, count, idx) => {
    if (idx === 0) return sum;
    return dayDoneCounts[idx - 1] === 0 && count > 0 ? sum + 1 : sum;
  }, 0);

  const weekendStats = { done: 0, days: 0 };
  const weekdayStats = { done: 0, days: 0 };
  for (let day = 1; day <= analysisDays; day++) {
    const dayOfWeek = new Date(viewYear, viewMonth, day).getDay();
    const done = dayDoneCounts[day - 1] || 0;
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      weekendStats.done += done;
      weekendStats.days += 1;
    } else {
      weekdayStats.done += done;
      weekdayStats.days += 1;
    }
  }

  const weekendAvg = weekendStats.days ? weekendStats.done / weekendStats.days : 0;
  const weekdayAvg = weekdayStats.days ? weekdayStats.done / weekdayStats.days : 0;

  const sectionSize = Math.max(1, Math.floor(analysisDays / 3));
  const earlyRange = dayDoneCounts.slice(0, sectionSize);
  const middleRange = dayDoneCounts.slice(sectionSize, sectionSize * 2);
  const lateRange = dayDoneCounts.slice(sectionSize * 2);

  const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
  const earlyAvg = avg(earlyRange);
  const middleAvg = avg(middleRange);
  const lateAvg = avg(lateRange);

  const closeoutEntries = Object.values(monthCloseouts || {});
  const carryMentions = closeoutEntries.filter((entry) => entry?.carry).length;

  const noteEntries = Object.entries(habitNotes || {}).filter(([entryKey, note]) => {
    if (!note) return false;
    const match = entryKey.match(/-(\d+)$/);
    const day = match ? Number(match[1]) : 0;
    return day >= 1 && day <= analysisDays;
  });
  const noteCount = noteEntries.length;

  const noteHighlights = noteEntries
    .slice(-6)
    .map(([entryKey, note]) => {
      const match = entryKey.match(/-(\d+)$/);
      const day = match ? Number(match[1]) : "?";
      const habit = entryKey.replace(/-(\d+)$/, "");
      return `${habit} (Day ${day}): ${note}`;
    });

  const toneTemplates = {
    poetic: {
      base: "This month moved like a quiet tide. Even on slower days, you stayed in conversation with your intentions.",
      middleReturn:
        "The middle softened, then you returned. Your strongest days were the ones you began with care.",
      rising: "Your rhythm warmed as the month unfolded. Small beginnings became steady momentum.",
      steady: "The month felt grounded and kind. You kept showing up in a way that looked like trust.",
    },
    balanced: {
      base: "This month moved gently. Even on quieter days, you stayed connected to your intentions.",
      middleReturn:
        "This month had a soft middle, but you found your way back. Your strongest days came when you began with intention.",
      rising: "Your rhythm built over time. The second half of the month shows growing trust in your routines.",
      steady: "This month felt steady and grounded. You kept showing up with quiet consistency.",
    },
    coach: {
      base: "You kept the thread this month, even when energy dipped. That's meaningful progress.",
      middleReturn:
        "You had a mid-month dip and recovered well. Your best days followed intentional starts.",
      rising: "Momentum improved as the month progressed. Your system is getting stronger.",
      steady: "You maintained strong consistency this month. Keep this same cadence next month.",
    },
  };

  const t = toneTemplates[tonePreset] || toneTemplates.balanced;

  let monthStory = t.base;
  if (middleAvg < earlyAvg * 0.75 && lateAvg > middleAvg * 1.15) {
    monthStory = t.middleReturn;
  } else if (lateAvg > earlyAvg * 1.1) {
    monthStory = t.rising;
  } else if (overallRate >= 70) {
    monthStory = t.steady;
  }

  const patternInsights = [];
  if (restartCount >= 2) {
    patternInsights.push(
      tonePreset === "poetic"
        ? "You return quickly after missed days. That kind of return is a quiet strength."
        : "You restart quickly after missed days. That resilience is rare and powerful."
    );
  }
  if (weekendAvg < weekdayAvg * 0.8) {
    patternInsights.push(
      tonePreset === "coach"
        ? "Weekends are softer for you. Plan lighter versions instead of all-or-nothing goals."
        : "Your weekends have a softer rhythm. Hibi can plan lighter habit versions for those days."
    );
  }
  if (lateAvg > earlyAvg * 1.1) {
    patternInsights.push(
      tonePreset === "poetic"
        ? "Your month tends to warm as it goes. Small starts are opening larger doors."
        : "Your month tends to warm up over time. Small starts are clearly working for you."
    );
  }
  if (carryMentions >= 5) {
    patternInsights.push(
      tonePreset === "coach"
        ? "Your closeout ritual is sticking. Reflection is improving follow-through."
        : "Your closeout reflections are becoming a ritual. That reflection loop is strengthening follow-through."
    );
  }
  if (noteCount >= 4) {
    patternInsights.push(
      tonePreset === "poetic"
        ? "Your tiny daily notes are adding texture to this month. Hibi can feel your lived rhythm, not just your checkmarks."
        : "Your tiny habit notes are giving Hibi richer context for this month."
    );
  }
  if (patternInsights.length === 0) {
    patternInsights.push(
      tonePreset === "poetic"
        ? "Your pattern is still unfolding. Keep leaving small notes so Hibi can hear your rhythm more clearly."
        : "Your pattern is gentle and emerging. Keep using closeout notes so Hibi can learn your rhythm faster."
    );
  }

  const monthWords = [
    overallRate >= 70 ? "Steady" : overallRate >= 40 ? "Returning" : "Gentle",
    weekendAvg < weekdayAvg * 0.8 ? "Soft" : "Focused",
    restartCount >= 2 ? "Resilient" : lateAvg > earlyAvg ? "Growing" : "Becoming",
  ];

  const moodGradient =
    "linear-gradient(135deg, #F4C7A1 0%, #E8DCC2 25%, #C8D8C0 50%, #BFCAD8 75%, #8A94A6 100%)";
  const moodScale = 0.86 + Math.min(0.25, overallRate / 400);
  const habitTheme = {
    panel: nightMode ? "#171a1f" : "#f6fcf4",
    panelAlt: nightMode ? "#1b2026" : "#e8f5e9",
    border: nightMode ? "#2b3139" : "#c5dec6",
    heading: nightMode ? "#e9ecef" : "#14532d",
    body: nightMode ? "#c9d1da" : "#1b5e20",
    muted: nightMode ? "#9aa3af" : "#2e7d32",
    inputBg: nightMode ? "#111418" : "#fff",
    inputBorder: nightMode ? "#353c46" : "#9ccc9e",
  };

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
        Loading your tracker...
      </main>
    );
  }

  return (
    <main
      style={{
        padding: 24,
        minHeight: "100vh",
        background: nightMode
          ? "linear-gradient(165deg, #0f1113 0%, #15181c 50%, #1c2025 100%)"
          : "linear-gradient(150deg, #fdf6ec 0%, #e8f5e9 55%, #c8e6c9 100%)",
        fontFamily: 'system-ui, sans-serif',
        position: 'relative',
        overflow: 'hidden',
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
        <Link href="/" style={{
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
          fontFamily: 'system-ui, sans-serif',
          userSelect: "none",
        }}>
          Hibi
        </Link>
        <Link
          href="/calendar"
          style={{
            textDecoration: "none",
            background: nightMode ? "#1c2127" : "#e8f5e9",
            color: nightMode ? "#e9ecef" : "#14532d",
            padding: "10px 16px",
            borderRadius: 10,
            fontWeight: 700,
            border: `1.5px solid ${nightMode ? "#2b3139" : "#2e7d32"}`,
          }}
        >
          Calendar
        </Link>
        <Link
          href="/habits"
          style={{
            textDecoration: "none",
            background: nightMode ? "#2b3139" : "#2e7d32",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 10,
            fontWeight: 700,
            boxShadow: nightMode ? "0 2px 8px #00000088" : "0 2px 8px #2e7d3240",
          }}
        >
          Habit Tracker
        </Link>
        <Link
          href="/journal"
          style={{
            textDecoration: "none",
            background: nightMode ? "#1c2127" : "#e8f5e9",
            color: nightMode ? "#e9ecef" : "#14532d",
            padding: "10px 16px",
            borderRadius: 10,
            fontWeight: 700,
            border: `1.5px solid ${nightMode ? "#2b3139" : "#2e7d32"}`,
          }}
        >
          Journal
        </Link>
        <Link
          href="/profile"
          style={{
            textDecoration: "none",
            background: nightMode ? "#1c2127" : "#e8f5e9",
            color: nightMode ? "#e9ecef" : "#14532d",
            padding: "10px 16px",
            borderRadius: 10,
            fontWeight: 700,
            border: `1.5px solid ${nightMode ? "#2b3139" : "#2e7d32"}`,
          }}
        >
          Profile
        </Link>
        <button
          onClick={async () => {
            if (typeof window !== "undefined") {
              await supabase.auth.signOut();
              router.replace("/login");
            }
          }}
          style={{
            textDecoration: "none",
            background: nightMode ? "#1c2127" : "#e8f5e9",
            color: nightMode ? "#e9ecef" : "#14532d",
            padding: "10px 16px",
            borderRadius: 10,
            fontWeight: 700,
            border: `1.5px solid ${nightMode ? "#2b3139" : "#2e7d32"}`,
            cursor: "pointer",
          }}
        >
          Log Out
        </button>
      </div>
      <h1
        style={{
          color: habitTheme.heading,
          fontWeight: 800,
          fontSize: 36,
          letterSpacing: 1,
          marginBottom: 4,
        }}
      >
        Habit Tracker
      </h1>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: habitTheme.muted,
          fontWeight: 600,
          fontSize: 22,
          marginBottom: 8,
        }}
      >
        <button
          onClick={goPrevMonth}
          disabled={isAtMinMonth}
          style={{
            border: "none",
            background: isAtMinMonth ? (nightMode ? "#2a2f36" : "#cfd8dc") : (nightMode ? "#2b3139" : "#2e7d32"),
            color: "#fff",
            borderRadius: 999,
            width: 32,
            height: 32,
            cursor: isAtMinMonth ? "not-allowed" : "pointer",
            fontSize: 16,
            fontWeight: 700,
          }}
          aria-label="Previous month"
        >
          ←
        </button>
        <span>{monthLabel}</span>
        <div
          title={`Day ${ringDay}: ${ringDoneCount}/${habits.length || 0} completed`}
          style={{
            width: 36,
            height: 36,
            position: "relative",
            display: "grid",
            placeItems: "center",
          }}
        >
          <svg width="36" height="36" viewBox="0 0 36 36" style={{ position: "absolute", inset: 0 }}>
            <circle cx="18" cy="18" r={ringRadius} fill="none" stroke={nightMode ? "#39424d" : "#c7d6c7"} strokeWidth="2" />
            <circle
              cx="18"
              cy="18"
              r={ringRadius}
              fill="none"
              stroke="#7fb28b"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringOffset}
              transform="rotate(-90 18 18)"
              style={{ transition: "stroke-dashoffset 0.35s ease" }}
            />
          </svg>
          <span style={{ color: habitTheme.muted, fontSize: 12, fontWeight: 700 }}>{ringDay}</span>
        </div>
        <button
          onClick={goNextMonth}
          style={{
            border: "none",
            background: nightMode ? "#2b3139" : "#2e7d32",
            color: "#fff",
            borderRadius: 999,
            width: 32,
            height: 32,
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 700,
          }}
          aria-label="Next month"
        >
          →
        </button>
      </div>
      <p style={{ color: habitTheme.heading, fontWeight: 500, marginBottom: 12 }}>{status}</p>
      <p style={{ color: habitTheme.muted, fontWeight: 500, marginBottom: 8 }}>
        Tap a cell to cycle: empty → dot (done) → filled square (did not do).
      </p>
      <p style={{ color: habitTheme.muted, fontWeight: 500, marginBottom: 8 }}>
        Tap a habit name to rename it. Press Enter or click away to save. Double-click a day cell to add/edit a tiny note.
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        {!softFocusMode ? (
          <button
            type="button"
            onClick={() => {
              setSoftFocusHabit(getNextFocusHabit());
              setSoftFocusMode(true);
            }}
            style={{
              border: `1.5px solid ${nightMode ? "#39424d" : "#2e7d32"}`,
              background: habitTheme.panelAlt,
              color: habitTheme.heading,
              borderRadius: 999,
              padding: "6px 12px",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Enter Soft Focus
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSoftFocusMode(false)}
            style={{
              border: "none",
              background: "transparent",
              color: habitTheme.muted,
              textDecoration: "underline",
              fontSize: 12,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Back to full view
          </button>
        )}
      </div>

      {softFocusMode && (
        <section
          style={{
            marginBottom: 16,
            border: `1px solid ${habitTheme.border}`,
            borderRadius: 18,
            background: habitTheme.panel,
            padding: "18px 14px",
            maxWidth: 620,
            marginInline: "auto",
            boxShadow: nightMode ? "0 8px 24px #00000066" : "0 8px 24px #94b89422",
          }}
        >
          <p
            style={{
              margin: "0 0 12px",
              color: habitTheme.body,
              fontSize: 14,
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            {getSoftFocusWhisper()}
          </p>

          {softFocusHabit ? (
            <div
              key={`${softFocusHabit}-${softFocusCardKey}`}
              className={`soft-focus-card ${softFocusTransition ? "soft-focus-exit" : ""}`}
              style={{
                borderRadius: 16,
                border: `1px solid ${habitTheme.border}`,
                background: nightMode ? "#111418" : "#ffffff",
                padding: "24px 18px",
                display: "grid",
                gap: 12,
                justifyItems: "center",
              }}
            >
              <div
                style={{
                  color: habitTheme.heading,
                  fontSize: 32,
                  fontWeight: 800,
                  letterSpacing: 0.2,
                  textAlign: "center",
                }}
              >
                {softFocusHabit}
              </div>
              <button
                type="button"
                onClick={() => handleSoftFocusAction("dot")}
                style={{
                  border: "none",
                  borderRadius: 10,
                  background: nightMode ? "#2b3139" : "#2e7d32",
                  color: "#fff",
                  width: 210,
                  padding: "11px 14px",
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                ✓ Mark Done
              </button>
              <button
                type="button"
                onClick={() => handleSoftFocusAction("fill")}
                style={{
                  border: `1px solid ${nightMode ? "#39424d" : "#afc8b0"}`,
                  borderRadius: 10,
                  background: nightMode ? "#1b2026" : "#f5faf5",
                  color: habitTheme.body,
                  width: 210,
                  padding: "10px 14px",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Skip Today
              </button>
            </div>
          ) : (
            <p style={{ margin: 0, color: habitTheme.muted, textAlign: "center" }}>Add a habit to begin Soft Focus.</p>
          )}

          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {habits.map((habit, index) => {
              const isDoneToday = checked[`${habit}-${ringDay}`] === "dot";
              const isCurrent = habit === softFocusHabit;
              return (
                <span
                  key={`sf-dot-${habit}-${index}`}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: isCurrent ? "#628f67" : isDoneToday ? "#9cc3a0" : "#d7dfd8",
                    opacity: isCurrent || isDoneToday ? 1 : 0.8,
                  }}
                />
              );
            })}
          </div>
        </section>
      )}

      {!softFocusMode && (
      <form onSubmit={addHabit} style={{ display: "flex", gap: 8, marginBottom: 12, maxWidth: 520 }}>
        <input
          value={newHabit}
          onChange={(e) => setNewHabit(e.target.value)}
          placeholder="Add your own habit"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 8,
            border: `1.5px solid ${nightMode ? "#39424d" : "#388e3c"}`,
            fontSize: 15,
            outline: "none",
            background: habitTheme.inputBg,
            color: habitTheme.heading,
          }}
        />
        <button
          type="submit"
          style={{
            background: nightMode ? "#2b3139" : "#2e7d32",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 14px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Add Habit
        </button>
      </form>
      )}

      {!softFocusMode && (
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 16,
          marginTop: 12,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            flex: "1 1 780px",
            overflowX: "auto",
            background: nightMode ? "#1b2026" : "#c8e6c9",
            borderRadius: 16,
            boxShadow: nightMode ? "0 2px 12px #00000066" : "0 2px 12px #a5d6a7aa",
            padding: 16,
            maxWidth: "100vw",
          }}
        >
          {habits.length === 0 ? (
            <div style={{
              padding: "48px 0",
              textAlign: "center",
              color: habitTheme.muted,
              fontWeight: 600,
              fontSize: 20,
              letterSpacing: 0.2,
            }}>
              No habits yet. Add your first habit above!
            </div>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="habits-droppable" direction="vertical">
                {(provided) => (
                  <table
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: 980 }}
                  >
                    <thead>
                      <tr>
                        <th style={{
                          background: nightMode ? "#2b3139" : "#388e3c",
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: 16,
                          padding: "8px 12px",
                          borderTopLeftRadius: 12,
                          borderBottom: "2px solid #388e3c",
                          position: "sticky",
                          left: 0,
                          zIndex: 2,
                        }}>Habit</th>
                        {days.map(day => (
                          <th
                            key={day}
                            style={{
                              background: nightMode ? "#242b33" : "#a5d6a7",
                              color: habitTheme.heading,
                              fontWeight: 700,
                              fontSize: 15,
                              padding: "8px 0",
                              borderBottom: "2px solid #388e3c",
                              borderTopRightRadius: day === 31 ? 12 : 0,
                            }}
                          >
                            {day}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {habits.map((habit, habitIdx) => (
                        <Draggable key={habit} draggableId={habit} index={habitIdx}>
                          {(provided, snapshot) => (
                            <tr
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              style={{
                                ...provided.draggableProps.style,
                                background: snapshot.isDragging ? (nightMode ? "#242b33" : "#b2dfdb") : undefined,
                              }}
                            >
                              <td style={{
                                background: nightMode ? "#242b33" : "#a5d6a7",
                                color: habitTheme.heading,
                                fontWeight: 700,
                                padding: "8px 12px",
                                borderRight: `2px solid ${nightMode ? "#39424d" : "#388e3c"}`,
                                borderTopLeftRadius: 0,
                                borderBottomLeftRadius: 0,
                                position: "sticky",
                                left: 0,
                                zIndex: 1,
                                minWidth: 160,
                                width: 'auto',
                                maxWidth: 320,
                                whiteSpace: "normal",
                                wordBreak: "break-word",
                              }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                  <span style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                                    <span {...provided.dragHandleProps} style={{ cursor: "grab", color: habitTheme.muted, fontSize: 18, marginRight: 6 }} title="Drag to reorder">≡</span>
                                    {editingHabit === habit ? (
                                      <input
                                        value={editingHabitValue}
                                        onChange={(e) => setEditingHabitValue(e.target.value)}
                                        onBlur={() => renameHabit(habit)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            renameHabit(habit);
                                          }
                                          if (e.key === "Escape") {
                                            setEditingHabit(null);
                                            setEditingHabitValue("");
                                          }
                                        }}
                                        autoFocus
                                        style={{
                                          width: "100%",
                                          minWidth: 80,
                                          border: `1px solid ${nightMode ? "#39424d" : "#2e7d32"}`,
                                          borderRadius: 6,
                                          padding: "4px 6px",
                                          fontSize: 14,
                                          color: habitTheme.heading,
                                          background: habitTheme.inputBg,
                                        }}
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingHabit(habit);
                                          setEditingHabitValue(habit);
                                        }}
                                        style={{
                                          border: "none",
                                          background: "transparent",
                                          color: habitTheme.heading,
                                          fontWeight: 700,
                                          cursor: "text",
                                          padding: 0,
                                          textAlign: "left",
                                        }}
                                        aria-label={`Edit ${habit}`}
                                      >
                                        {habit}
                                      </button>
                                    )}
                                  </span>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <button
                                      type="button"
                                      onClick={() => removeHabit(habit)}
                                      disabled={editingHabit === habit}
                                      style={{
                                        border: "none",
                                        background: "transparent",
                                        color: editingHabit === habit ? (nightMode ? "#5f6b7a" : "#8fbf92") : habitTheme.muted,
                                        fontWeight: 800,
                                        cursor: editingHabit === habit ? "not-allowed" : "pointer",
                                        lineHeight: 1,
                                      }}
                                      aria-label={`Remove ${habit}`}
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                              </td>
                              {days.map(day => {
                                const key = `${habit}-${day}`;
                                const value = checked[key] || "empty";
                                const isDot = value === "dot";
                                const isFill = value === "fill";
                                const isOutOfMonth = day > daysInMonth;
                                const noteText = habitNotes[key] || "";
                                return (
                                  <td
                                    key={key}
                                    onClick={(e) => handleHabitCellClick(habit, day, e)}
                                    className={completionPulseKey === key ? "habit-complete-pulse" : ""}
                                    style={{
                                      cursor: isOutOfMonth ? "not-allowed" : "pointer",
                                      background: isOutOfMonth
                                        ? (nightMode ? "#20262d" : "#f1f8f1")
                                        : isFill
                                        ? (nightMode ? "#2d6a35" : "#388e3c")
                                        : isDot
                                        ? (nightMode ? "#273039" : "#eef8ee")
                                        : (nightMode ? "#1f252d" : "#fff"),
                                      color: isOutOfMonth ? "#9e9e9e" : isFill ? "#fff" : habitTheme.heading,
                                      borderRadius: 0,
                                      borderBottomRightRadius:
                                        day === 31 && habitIdx === habits.length - 1 ? 12 : 0,
                                      width: 32,
                                      height: 32,
                                      textAlign: "center",
                                      verticalAlign: "middle",
                                      fontSize: 18,
                                      fontWeight: 700,
                                      border: isOutOfMonth
                                        ? `1px dashed ${nightMode ? "#39424d" : "#c5d8c5"}`
                                        : isFill
                                        ? `2px solid ${nightMode ? "#93a0af" : "#14532d"}`
                                        : isDot
                                        ? `1.5px solid ${nightMode ? "#5d6a7a" : "#6aaa6d"}`
                                        : `1px solid ${nightMode ? "#39424d" : "#bdbdbd"}`,
                                      boxShadow: isOutOfMonth
                                        ? "none"
                                        : isFill
                                        ? "0 2px 8px #81c78455"
                                        : isDot
                                        ? "0 1px 5px #9ccc9e44"
                                        : "0 1px 2px #bdbdbd22",
                                      transition: "all 0.22s cubic-bezier(.4,2,.6,1)",
                                      outline: "none",
                                      userSelect: "none",
                                      position: "relative",
                                      overflow: "hidden",
                                    }}
                                  >
                                    {!isOutOfMonth && isDot ? "•" : ""}
                                    {!isOutOfMonth && noteText ? (
                                      <span
                                        style={{
                                          position: "absolute",
                                          right: 2,
                                          bottom: 2,
                                          width: 2,
                                          height: 2,
                                          borderRadius: "50%",
                                          background: isFill ? "#C4C4C4" : "#A8C3A0",
                                          pointerEvents: "none",
                                        }}
                                      />
                                    ) : null}
                                    {completionCheckKey === key && !isOutOfMonth ? (
                                      <span
                                        style={{
                                          position: "absolute",
                                          left: 4,
                                          top: 3,
                                          color: habitTheme.muted,
                                          fontSize: 11,
                                          fontWeight: 800,
                                          pointerEvents: "none",
                                          animation: "habitCheckSlide 0.6s ease-out",
                                        }}
                                      >
                                        ✓
                                      </span>
                                    ) : null}
                                  </td>
                                );
                              })}
                            </tr>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </tbody>
                  </table>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>

        <div
          style={{
            flex: "0 0 320px",
            background: habitTheme.panelAlt,
            borderRadius: 16,
            boxShadow: nightMode ? "0 2px 12px #00000066" : "0 2px 12px #a5d6a7aa",
            padding: 16,
          }}
        >
          <h2 style={{ color: habitTheme.heading, margin: "0 0 8px", fontSize: 22, fontWeight: 800 }}>
            Habit Analysis
          </h2>
          <div
            style={{
              marginBottom: 14,
              padding: 12,
              borderRadius: 12,
              border: `1px solid ${nightMode ? "#39424d" : "#b7d7b8"}`,
              background: nightMode ? "#111418" : "#f3fbf3",
            }}
          >
            <p style={{ margin: "0 0 8px", color: habitTheme.body, fontWeight: 700 }}>Hibi Mood</p>
            <div
              style={{
                height: 66,
                borderRadius: 999,
                background: moodGradient,
                display: "grid",
                placeItems: "center",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  transform: `scale(${moodScale})`,
                  background: "#ffffffd9",
                  boxShadow: "0 2px 12px #1b5e2030",
                  transition: "all 0.25s ease",
                }}
              />
            </div>
          </div>

          <p style={{ color: habitTheme.heading, margin: "0 0 6px", fontWeight: 700 }}>Month in three words</p>
          <p style={{ color: habitTheme.body, margin: "0 0 12px", fontSize: 17 }}>
            {monthWords.join(" • ")}
          </p>

          <p style={{ color: habitTheme.heading, margin: "0 0 6px", fontWeight: 700 }}>Habit Story</p>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            {[
              { key: "poetic", label: "Poetic" },
              { key: "balanced", label: "Balanced" },
              { key: "coach", label: "Coach" },
            ].map((tone) => (
              <button
                key={tone.key}
                type="button"
                onClick={() => setTonePreset(tone.key)}
                style={{
                  border: tonePreset === tone.key ? `1.5px solid ${nightMode ? "#5d6a7a" : "#2e7d32"}` : `1px solid ${nightMode ? "#39424d" : "#b7d7b8"}`,
                  background: tonePreset === tone.key ? (nightMode ? "#273039" : "#dff1df") : (nightMode ? "#111418" : "#f3fbf3"),
                  color: habitTheme.body,
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {tone.label}
              </button>
            ))}
          </div>
          <p style={{ color: habitTheme.heading, margin: "0 0 12px", lineHeight: 1.45 }}>
            {monthStory}
          </p>

          <p style={{ color: habitTheme.heading, margin: "0 0 6px", fontWeight: 700 }}>Pattern Insights</p>
          <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
            {patternInsights.map((line) => (
              <p key={line} style={{ margin: 0, color: habitTheme.heading, lineHeight: 1.4 }}>
                {line}
              </p>
            ))}
          </div>

          {noteCount > 0 && (
            <>
              <p style={{ color: habitTheme.heading, margin: "0 0 6px", fontWeight: 700 }}>Habit Notes</p>
              <div style={{ display: "grid", gap: 4, marginBottom: 12 }}>
                {noteHighlights.map((line) => (
                  <p key={line} style={{ margin: 0, color: habitTheme.body, fontSize: 13, lineHeight: 1.35 }}>
                    {line}
                  </p>
                ))}
              </div>
            </>
          )}

          {lowestHabits.length > 0 && (
            <p style={{ color: habitTheme.body, margin: "0 0 14px", fontSize: 14 }}>
              Gentle support habits: {lowestHabits.map((h) => h.habit).join(", ")}.
            </p>
          )}

          <div
            style={{
              paddingTop: 10,
              borderTop: `1px solid ${habitTheme.border}`,
            }}
          >
            <p style={{ color: habitTheme.heading, margin: "0 0 8px", fontWeight: 700 }}>Daily Closeout</p>
            <form onSubmit={saveDailyCloseout} style={{ display: "grid", gap: 8 }}>
              <label style={{ color: habitTheme.body, fontSize: 13, fontWeight: 600 }}>
                What helped you today?
                <textarea
                  value={dailyCloseout.helped}
                  onChange={(e) => setDailyCloseout((prev) => ({ ...prev, helped: e.target.value }))}
                  rows={2}
                  style={{
                    width: "100%",
                    marginTop: 4,
                    borderRadius: 8,
                    border: `1px solid ${habitTheme.inputBorder}`,
                    padding: 8,
                    resize: "vertical",
                    fontFamily: "inherit",
                    background: habitTheme.inputBg,
                    color: habitTheme.heading,
                  }}
                />
              </label>
              <label style={{ color: habitTheme.body, fontSize: 13, fontWeight: 600 }}>
                What slowed you down?
                <textarea
                  value={dailyCloseout.slowed}
                  onChange={(e) => setDailyCloseout((prev) => ({ ...prev, slowed: e.target.value }))}
                  rows={2}
                  style={{
                    width: "100%",
                    marginTop: 4,
                    borderRadius: 8,
                    border: `1px solid ${habitTheme.inputBorder}`,
                    padding: 8,
                    resize: "vertical",
                    fontFamily: "inherit",
                    background: habitTheme.inputBg,
                    color: habitTheme.heading,
                  }}
                />
              </label>
              <label style={{ color: habitTheme.body, fontSize: 13, fontWeight: 600 }}>
                What will you carry into tomorrow?
                <textarea
                  value={dailyCloseout.carry}
                  onChange={(e) => setDailyCloseout((prev) => ({ ...prev, carry: e.target.value }))}
                  rows={2}
                  style={{
                    width: "100%",
                    marginTop: 4,
                    borderRadius: 8,
                    border: `1px solid ${habitTheme.inputBorder}`,
                    padding: 8,
                    resize: "vertical",
                    fontFamily: "inherit",
                    background: habitTheme.inputBg,
                    color: habitTheme.heading,
                  }}
                />
              </label>
              <button
                type="submit"
                style={{
                  marginTop: 2,
                  border: "none",
                  borderRadius: 8,
                  background: nightMode ? "#2b3139" : "#2e7d32",
                  color: "#fff",
                  padding: "9px 12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Save Closeout
              </button>
            </form>
            {closeoutStatus && (
              <p style={{ margin: "8px 0 0", color: habitTheme.muted, fontSize: 13 }}>{closeoutStatus}</p>
            )}
          </div>
        </div>
      </div>
      )}
      <style jsx>{`
        .habit-complete-pulse {
          animation: habitCompletePulse 0.4s ease-out;
        }

        .soft-focus-card {
          animation: softFocusEnter 0.38s ease;
        }

        .soft-focus-exit {
          animation: softFocusExit 0.2s ease;
        }

        @keyframes habitCompletePulse {
          0% {
            transform: scale(1);
            filter: brightness(1);
          }
          45% {
            transform: scale(1.04);
            filter: brightness(1.06);
          }
          100% {
            transform: scale(1);
            filter: brightness(1);
          }
        }

        @keyframes habitCheckSlide {
          0% {
            opacity: 0;
            transform: translateX(6px);
          }
          35% {
            opacity: 1;
            transform: translateX(0);
          }
          100% {
            opacity: 0;
            transform: translateX(-2px);
          }
        }

        @keyframes softFocusEnter {
          0% {
            opacity: 0;
            transform: translateY(8px) scale(0.995);
            filter: blur(1px);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes softFocusExit {
          0% {
            opacity: 1;
            transform: translateY(0);
          }
          100% {
            opacity: 0;
            transform: translateY(-4px);
          }
        }
      `}</style>
    </main>
  );
}
