"use client";
import React, { useEffect, useRef, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useNightMode } from "@/lib/useNightMode";
import { INTERACTION_TUNING, shouldTriggerSwipeDelete, triggerHaptic } from "@/lib/interactionTuning";
import { useAuthBootstrap } from "@/lib/hooks/useAuthBootstrap";
import { useLongPress } from "@/lib/hooks/useLongPress";
import { useCommandPalette } from "@/lib/hooks/useCommandPalette";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { usePerformanceProbe } from "@/lib/hooks/usePerformanceProbe";
import {
  safeReadJSON,
  safeWriteJSON,
  sanitizeHabitChecksMap,
  sanitizeStringArray,
} from "@/lib/storageSchema";
import {
  hasSeenHabitTips,
  markHabitTipsSeen,
  readMonthHabitChecks,
  readArchivedHabits,
  readHabitCloseouts,
  readHabitColors,
  readHabitNotes,
  readVacationDays,
  writeMonthHabitChecks,
  writeHabitCloseouts,
  writeHabitColors,
  writeHabitNotes,
  writeVacationDays,
} from "@/lib/repositories/habitsRepo";
import { HIBI_BREAKPOINT_MOBILE } from "@/lib/constants";
import NavBar from "@/app/components/NavBar";
import CommandPaletteDialog from "@/app/components/ui/CommandPaletteDialog";
import LiveRegion from "@/app/components/ui/LiveRegion";

const DEFAULT_CATEGORIES = ["Health", "Work", "Creative", "Mindfulness", "Social"];

function readHabitCategories(userId) {
  return safeReadJSON(`hibi_habit_categories_${userId || "guest"}`, {});
}

function writeHabitCategories(userId, map) {
  safeWriteJSON(`hibi_habit_categories_${userId || "guest"}`, map || {});
}

function dedupeHabits(list) {
  return [...new Map(list.map((h) => [h.toLowerCase(), h])).values()];
}

export default function HabitTracker() {
  const [habits, setHabits] = useState([]);
  const [newHabit, setNewHabit] = useState("");
  const [checked, setChecked] = useState({});
  const [status, setStatus] = useState("");
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
  const [softFocusMode, setSoftFocusMode] = useState(() => typeof window !== "undefined" && window.innerWidth <= HIBI_BREAKPOINT_MOBILE);
  const [softFocusHabit, setSoftFocusHabit] = useState("");
  const [softFocusTransition, setSoftFocusTransition] = useState(false);
  const [softFocusCardKey, setSoftFocusCardKey] = useState(0);
  const [archivedHabits, setArchivedHabits] = useState([]);
  const [lastRemovedHabit, setLastRemovedHabit] = useState(null);
  const [notePopover, setNotePopover] = useState({ habit: null, day: null, text: "" });
  const [habitColors, setHabitColors] = useState({});
  const [colorPickerOpenFor, setColorPickerOpenFor] = useState(null);
  const [colorPickerPos, setColorPickerPos] = useState({ x: 0, y: 0 });
  const [vacationDays, setVacationDays] = useState(new Set());
  const [habitStatsPopover, setHabitStatsPopover] = useState(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth <= HIBI_BREAKPOINT_MOBILE);
  const [showHabitTips, setShowHabitTips] = useState(false);
  const [habitContextMenu, setHabitContextMenu] = useState({ open: false, x: 0, y: 0, habit: "" });
  const [habitCategories, setHabitCategories] = useState({});
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(null);
  const cellClickTimersRef = useRef({});
  const habitSwipeStartRef = useRef({});
  const setHabitCellStateRef = useRef(null);
  const habitContextMenuRef = useRef(null);
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { authReady, userId } = useAuthBootstrap({ supabase, router, redirectTo: "/login" });
  const nightMode = useNightMode();

  const habitLongPress = useLongPress((habit, e) => {
    if (!habit) return;
    const touch = e?.touches?.[0] || e?.changedTouches?.[0];
    const x = touch?.clientX || e?.clientX || window.innerWidth / 2;
    const y = touch?.clientY || e?.clientY || window.innerHeight / 2;
    setHabitContextMenu({ open: true, x, y, habit });
  }, { delay: 460 });

  useFocusTrap({
    open: habitContextMenu.open,
    containerRef: habitContextMenuRef,
    onClose: () => setHabitContextMenu({ open: false, x: 0, y: 0, habit: "" }),
  });

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= HIBI_BREAKPOINT_MOBILE);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const now = new Date();
  const minYear = Math.max(now.getFullYear() - 1, 2025);
  const minMonth = 0; // January
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-based

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  function habitListStorageKey(activeUserId) {
    return `habit_list_${activeUserId || "guest"}`;
  }

  function writeLocalMonthChecks(map, activeUserId) {
    writeMonthHabitChecks(activeUserId, viewYear, viewMonth, map);
  }

  function writeLocalHabitList(list, activeUserId) {
    safeWriteJSON(habitListStorageKey(activeUserId), list);
  }

  function writeLocalCloseouts(map, activeUserId) {
    writeHabitCloseouts(activeUserId, viewYear, viewMonth, map);
  }

  function writeLocalHabitNotes(map, activeUserId) {
    writeHabitNotes(activeUserId, viewYear, viewMonth, map);
  }

  function readLocalHabitColors(activeUserId) {
    return readHabitColors(activeUserId);
  }

  function writeLocalHabitColors(map, activeUserId) {
    writeHabitColors(activeUserId, map);
  }

  function setHabitColor(habit, color) {
    const next = { ...habitColors, [habit]: color };
    if (!color) delete next[habit];
    setHabitColors(next);
    writeLocalHabitColors(next, userId);
    // Sync color to Supabase for cross-device access
    if (supabase && userId) {
      supabase.from("user_habits").update({ color: color || null })
        .eq("user_id", userId).eq("habit_name", habit);
    }
  }

  function writeLocalArchivedHabits(list, activeUserId) {
    safeWriteJSON(`habit_archived_${activeUserId || "guest"}`, list);
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

  function goToToday() {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
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

  const statusTimerRef = useRef(null);
  function showStatus(msg) {
    setStatus(msg);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatus(""), 2000);
  }

  // F key toggles soft focus mode (when not typing in an input/textarea)
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "f" || e.key === "F") {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea") return;
        setSoftFocusMode((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Close color picker on outside click
  useEffect(() => {
    if (!colorPickerOpenFor) return;
    function handleOutside(e) {
      if (!e.target.closest("[data-color-picker]")) {
        setColorPickerOpenFor(null);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [colorPickerOpenFor]);

  // Load vacation days from localStorage
  useEffect(() => {
    if (!userId) return;
    setTimeout(() => setVacationDays(readVacationDays(userId)), 0);
  }, [userId]);

  function toggleVacationToday() {
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    setVacationDays((prev) => {
      const next = new Set(prev);
      if (next.has(todayKey)) {
        next.delete(todayKey);
      } else {
        next.add(todayKey);
      }
      writeVacationDays(userId, next);
      return next;
    });
  }

  function isTodayVacation() {
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return vacationDays.has(todayKey);
  }

  useEffect(() => {
    if (!userId) return;
    const seenTip = hasSeenHabitTips(userId);
    if (!seenTip) {
      setTimeout(() => setShowHabitTips(true), 0);
    }
  }, [userId]);

  useEffect(() => {
    const monthPrefix = `${viewYear}_${String(viewMonth + 1).padStart(2, "0")}`;
    const listKey = `habit_list_${userId || "guest"}`;
    const checksKey = `habit_checks_${userId || "guest"}_${monthPrefix}`;
    const backupKey = `hibi_habit_checks_backup_${userId || "guest"}_${monthPrefix}`;

    function onStorage(event) {
      if (!userId || !event.key) return;
      if (event.key === listKey) {
        setHabits(dedupeHabits(sanitizeStringArray(safeReadJSON(listKey, []))));
      }
      if (event.key === checksKey || event.key === backupKey) {
        const primary = safeReadJSON(checksKey, {}, sanitizeHabitChecksMap);
        const backup = safeReadJSON(backupKey, {}, sanitizeHabitChecksMap);
        setChecked({ ...backup, ...primary });
      }
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId, viewMonth, viewYear]);

  useEffect(() => {
    const listKey = `habit_list_${userId || "guest"}`;

    async function loadHabitList() {
      const localList = sanitizeStringArray(safeReadJSON(listKey, []));
      const localDeduped = dedupeHabits(localList);

      // Show local habits immediately so UI isn't blank
      if (localDeduped.length > 0) {
        setHabits(localDeduped);
        if (localDeduped.length !== localList.length) {
          safeWriteJSON(listKey, localDeduped);
        }
      }

      if (!supabase || !userId) {
        if (localDeduped.length === 0) {
          setHabits([]);
          safeWriteJSON(listKey, []);
        }
        return;
      }

      // Always fetch from Supabase for cross-device sync
      const { data, error } = await supabase
        .from("user_habits")
        .select("habit_name,sort_order")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true });

      if (error) {
        if (localDeduped.length === 0) {
          setHabits([]);
          safeWriteJSON(listKey, []);
        }
        return;
      }

      const remoteList = dedupeHabits((data || []).map((row) => row.habit_name).filter(Boolean));

      // Merge: union of remote + local, remote order takes priority
      const mergedSet = new Set([...remoteList, ...localDeduped]);
      const merged = [...remoteList, ...localDeduped.filter((h) => !remoteList.includes(h))];
      const finalList = dedupeHabits(merged);

      if (finalList.length > 0) {
        setHabits(finalList);
        safeWriteJSON(listKey, finalList);
        // Push any local-only habits to Supabase so other devices can see them
        const remoteSet = new Set(remoteList.map((h) => h.toLowerCase()));
        const localOnly = localDeduped.filter((h) => !remoteSet.has(h.toLowerCase()));
        if (localOnly.length > 0) {
          const upsertRows = localOnly.map((name, i) => ({
            user_id: userId,
            habit_name: name,
            sort_order: remoteList.length + i,
          }));
          await supabase.from("user_habits").upsert(upsertRows, { onConflict: "user_id,habit_name" });
        }
      } else if (localDeduped.length === 0) {
        setHabits([]);
        safeWriteJSON(listKey, []);
      }
    }

    async function loadAuxiliaryHabitData() {
      const archived = readArchivedHabits(userId);
      setArchivedHabits(archived);
      const localColors = readLocalHabitColors(userId);
      setHabitColors(localColors);
      const cats = readHabitCategories(userId);
      setHabitCategories(cats);
      // Sync colors from Supabase for cross-device access
      if (supabase && userId) {
        const { data } = await supabase.from("user_habits")
          .select("habit_name,color").eq("user_id", userId);
        if (data) {
          const remoteColors = {};
          data.forEach((row) => { if (row.color) remoteColors[row.habit_name] = row.color; });
          if (Object.keys(remoteColors).length > 0) {
            const merged = { ...localColors, ...remoteColors };
            setHabitColors(merged);
            writeLocalHabitColors(merged, userId);
          }
        }
      }
    }

    loadHabitList();
    loadAuxiliaryHabitData();
  }, [userId]);

  useEffect(() => {
    async function loadChecks() {
      const hydratedLocalMap = readMonthHabitChecks(userId, viewYear, viewMonth);
      setChecked(hydratedLocalMap);

      if (!supabase) {
        showStatus("Supabase is not configured. Using local saved data.");
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
      writeMonthHabitChecks(userId, viewYear, viewMonth, map);
      showStatus("Connected to Supabase.");
    }
    loadChecks();
  }, [viewMonth, viewYear, userId]);

  useEffect(() => {
    function hydrateCloseouts() {
      const localCloseouts = readHabitCloseouts(userId, viewYear, viewMonth);
      setMonthCloseouts(localCloseouts);

      const todayDate = new Date();
      const todayKey = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, "0")}-${String(todayDate.getDate()).padStart(2, "0")}`;
      const todayCloseout = localCloseouts[todayKey] || { helped: "", slowed: "", carry: "" };
      setDailyCloseout(todayCloseout);
    }

    hydrateCloseouts();
  }, [userId, viewYear, viewMonth]);

  useEffect(() => {
    function hydrateHabitNotes() {
      const localNotes = readHabitNotes(userId, viewYear, viewMonth);
      setHabitNotes(localNotes);
    }

    hydrateHabitNotes();
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
      triggerHaptic(INTERACTION_TUNING.haptics.habitCheckMs);
      setCompletionPulseKey(key);
      setCompletionCheckKey(key);
      setTimeout(() => setCompletionPulseKey((current) => (current === key ? null : current)), 420);
      setTimeout(() => setCompletionCheckKey((current) => (current === key ? null : current)), 620);
    }

    showStatus("Updated.");

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
        showStatus("Updated.");
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
      showStatus("Updated.");
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

  useEffect(() => {
    setHabitCellStateRef.current = setHabitCellState;
  });

  // Cmd/Ctrl+Enter quickly marks a habit done for the current day.
  useEffect(() => {
    function handleQuickToggle(e) {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "Enter") return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (!habits.length) return;
      e.preventDefault();

      const todayDate = new Date();
      const currentDay =
        viewYear === todayDate.getFullYear() && viewMonth === todayDate.getMonth()
          ? todayDate.getDate()
          : Math.min(todayDate.getDate(), daysInMonth);

      const target =
        (softFocusMode && softFocusHabit)
          ? softFocusHabit
          : habits.find((h) => checked[`${h}-${currentDay}`] !== "dot") || habits[0];
      if (target) setHabitCellStateRef.current?.(target, currentDay, "dot");
    }
    window.addEventListener("keydown", handleQuickToggle);
    return () => window.removeEventListener("keydown", handleQuickToggle);
  }, [checked, daysInMonth, habits, softFocusHabit, softFocusMode, viewMonth, viewYear]);

  async function addHabit(e) {
    e.preventDefault();
    const habitName = newHabit.trim();
    if (!habitName) return;
    if (habits.some((h) => h.toLowerCase() === habitName.toLowerCase())) {
      showStatus("Habit already exists.");
      return;
    }

    const updated = [...habits, habitName];
    setHabits(updated);
    writeLocalHabitList(updated, userId);
    setNewHabit("");
    showStatus("Updated.");

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
      showStatus("Saved locally — sync pending.");
    }
  }

  function archiveHabit(habitName) {
    const updatedHabits = habits.filter((h) => h !== habitName);
    const updatedArchived = [...archivedHabits, habitName];
    setHabits(updatedHabits);
    setArchivedHabits(updatedArchived);
    writeLocalHabitList(updatedHabits, userId);
    writeLocalArchivedHabits(updatedArchived, userId);
    showStatus("Archived.");
  }

  function unarchiveHabit(habitName) {
    const updatedHabits = [...habits, habitName];
    const updatedArchived = archivedHabits.filter((h) => h !== habitName);
    setHabits(updatedHabits);
    setArchivedHabits(updatedArchived);
    writeLocalHabitList(updatedHabits, userId);
    writeLocalArchivedHabits(updatedArchived, userId);
    showStatus("Restored.");
  }

  function undoRemoveHabit() {
    if (!lastRemovedHabit) return;
    const { name, index } = lastRemovedHabit;
    const updated = [...habits];
    updated.splice(Math.min(index, updated.length), 0, name);
    setHabits(updated);
    writeLocalHabitList(updated, userId);
    setLastRemovedHabit(null);
    showStatus("Habit restored.");
    if (supabase && userId) {
      supabase.from("user_habits").upsert(
        { user_id: userId, habit_name: name, sort_order: index },
        { onConflict: "user_id,habit_name" }
      );
    }
  }

  async function removeHabit(habitName) {
    const removedIndex = habits.indexOf(habitName);
    setLastRemovedHabit({ name: habitName, index: removedIndex });
    const updated = habits.filter((h) => h !== habitName);
    setHabits(updated);
    writeLocalHabitList(updated, userId);
    showStatus("Updated.");

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
      showStatus("Updated.");
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
      showStatus("Habit name cannot be empty.");
      return;
    }

    if (
      nextHabitName.toLowerCase() !== oldHabitName.toLowerCase() &&
      habits.some((h) => h.toLowerCase() === nextHabitName.toLowerCase())
    ) {
      showStatus("Habit already exists.");
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
    showStatus("Updated.");

    if (!supabase || !userId) return;

    const { error: habitsError } = await supabase
      .from("user_habits")
      .update({ habit_name: nextHabitName })
      .eq("user_id", userId)
      .eq("habit_name", oldHabitName);

    if (habitsError) {
      showStatus("Updated.");
    }

    const { error: checksError } = await supabase
      .from("habit_checks")
      .update({ habit: nextHabitName })
      .eq("user_id", userId)
      .eq("habit", oldHabitName);

    if (checksError) {
      showStatus("Updated.");
    }
  }

  function saveHabitNote(habit, day, text) {
    if (day > daysInMonth) return;
    const key = `${habit}-${day}`;
    const cleaned = String(text || "").trim().slice(0, 200);
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
    showStatus("Updated.");
  }

  function openHabitNoteEditor(habit, day) {
    if (day > daysInMonth) return;
    const key = `${habit}-${day}`;
    const existing = habitNotes[key] || "";
    setNotePopover({ habit, day, text: existing });
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

  function handleHabitRowTouchStart(habit, e) {
    if (!isMobile) return;
    const t = e.changedTouches?.[0];
    if (!t) return;
    habitSwipeStartRef.current[habit] = { x: t.clientX, y: t.clientY, at: e.timeStamp || 0 };
  }

  function handleHabitRowTouchEnd(habit, e) {
    if (!isMobile) return;
    const start = habitSwipeStartRef.current[habit];
    const t = e.changedTouches?.[0];
    if (!start || !t) return;
    delete habitSwipeStartRef.current[habit];
    if (shouldTriggerSwipeDelete(start, t, INTERACTION_TUNING.swipeDelete) && editingHabit !== habit) {
      triggerHaptic(INTERACTION_TUNING.haptics.habitDeleteMs);
      removeHabit(habit);
    }
  }

  useEffect(() => {
    const timers = cellClickTimersRef.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
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
      showStatus("Updated.");
      // Update sort_order in Supabase (batched single upsert)
      if (supabase && userId) {
        await supabase
          .from("user_habits")
          .upsert(
            reordered.map((name, i) => ({ user_id: userId, habit_name: name, sort_order: i })),
            { onConflict: "user_id,habit_name" }
          );
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
    function syncSoftFocusHabit() {
      const nextHabit = habits.find((habit) => checked[`${habit}-${ringDay}`] !== "dot") || habits[0] || "";
      if (!softFocusHabit || !habits.includes(softFocusHabit)) {
        setSoftFocusHabit(nextHabit);
      }
    }

    syncSoftFocusHabit();
  }, [habits, checked, ringDay, softFocusHabit]);

  function computeHabitStreak(habit) {
    let currentStreak = 0;
    let bestStreak = 0;
    let running = 0;
    for (let day = 1; day <= analysisDays; day++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const onVacation = vacationDays.has(dateStr);
      if (checked[`${habit}-${day}`] === "dot" || onVacation) {
        running++;
        if (running > bestStreak) bestStreak = running;
      } else {
        running = 0;
      }
    }
    for (let day = analysisDays; day >= 1; day--) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const onVacation = vacationDays.has(dateStr);
      if (checked[`${habit}-${day}`] === "dot" || onVacation) currentStreak++;
      else break;
    }
    return { currentStreak, bestStreak };
  }

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

  const habitsWithStreaks = habits.map((habit) => ({
    habit,
    ...computeHabitStreak(habit),
    rate: (habitStats.find((s) => s.habit === habit) || { rate: 0 }).rate,
  }));

  const monthlyDone = habitStats.reduce((sum, h) => sum + h.done, 0);
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

  const allHabitsDoneToday = habits.length > 0 && habits.every(
    (h) => checked[`${h}-${ringDay}`] === "dot"
  );

  const moodGradient =
    "linear-gradient(135deg, #F4C7A1 0%, #E8DCC2 25%, #C8D8C0 50%, #BFCAD8 75%, #8A94A6 100%)";
  const moodScale = 0.86 + Math.min(0.25, overallRate / 400);
  const habitCommands = [
    { label: "Add habit", group: "Habit", shortcut: "A", keywords: "new create", action: () => document.querySelector("input[placeholder='Add your own habit']")?.focus() },
    { label: "Toggle soft focus", group: "View", shortcut: "F", keywords: "focus", action: () => setSoftFocusMode((v) => !v) },
    { label: "Go to previous month", group: "Navigation", shortcut: "Left", keywords: "month back", action: goPrevMonth },
    { label: "Go to next month", group: "Navigation", shortcut: "Right", keywords: "month forward", action: goNextMonth },
    { label: "Jump to today", group: "Navigation", shortcut: "Today", keywords: "current month", action: goToToday },
    { label: "Undo removed habit", group: "Habit", shortcut: "Undo", keywords: "restore", action: undoRemoveHabit },
  ];
  const palette = useCommandPalette(habitCommands);

  usePerformanceProbe("habits", {
    habitCount: habits.length,
    checkedCellCount: Object.keys(checked || {}).length,
    noteCount,
    commandCount: palette.filtered.length,
  });

  const liveMessage = closeoutStatus || status || "";

  const habitTheme = {
    panel: nightMode ? "rgba(12,16,22,0.82)" : "rgba(255,255,255,0.82)",
    panelAlt: nightMode ? "rgba(15,20,26,0.85)" : "rgba(240,250,240,0.90)",
    border: nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)",
    heading: nightMode ? "#dde3ea" : "#0d2a14",
    body: nightMode ? "#b0bac8" : "#1a4a22",
    muted: nightMode ? "#6a8a70" : "#4a7a50",
    inputBg: nightMode ? "rgba(7,10,15,0.9)" : "rgba(255,255,255,0.95)",
    inputBorder: nightMode ? "rgba(255,255,255,0.12)" : "rgba(46,125,50,0.25)",
    glass: nightMode ? "rgba(12,16,22,0.82)" : "rgba(255,255,255,0.82)",
    glassBorder: nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)",
    accent: nightMode ? "#22c55e" : "#1a6e36",
  };

  if (!authReady) {
    return (
      <main
        style={{
          padding: "28px 24px",
          minHeight: "100vh",
          background: nightMode
            ? "linear-gradient(145deg, #070b0d 0%, #0c1117 35%, #101820 70%, #0e1a14 100%)"
            : "linear-gradient(145deg, #f7fbf4 0%, #eef7e8 40%, #e0f0da 75%, #d4ead4 100%)",
          fontFamily: "var(--font-manrope), sans-serif",
          color: nightMode ? "#e9ecef" : "#14532d",
        }}
      >
        <div style={{ maxWidth: 820, margin: "0 auto", display: "grid", gap: 14, paddingTop: 60 }}>
          <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 48, borderRadius: 999 }} />
          <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 32, borderRadius: 12, maxWidth: 240 }} />
          <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 120, borderRadius: 16 }} />
          <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 90, borderRadius: 16 }} />
          <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 90, borderRadius: 16 }} />
        </div>
      </main>
    );
  }

  return (
    <main
      className="hibi-aurora-bg"
      style={{
        padding: "28px 24px",
        minHeight: "100vh",
        background: nightMode
          ? "linear-gradient(145deg, #070b0d 0%, #0c1117 35%, #101820 70%, #0e1a14 100%)"
          : "linear-gradient(145deg, #f7fbf4 0%, #eef7e8 40%, #e0f0da 75%, #d4ead4 100%)",
        fontFamily: "var(--font-manrope), sans-serif",
        position: 'relative',
        animation: "hibiPageEnter 0.45s var(--hibi-ease-enter)",
      }}
    >
      <NavBar activePage="habits" />
      {/* Streak protection nudge — after 9PM with incomplete habits */}
      {now.getHours() >= 21 && ringDoneCount < habits.length && habits.length > 0 && (
        <div
          style={{
            maxWidth: 820,
            margin: "0 auto 12px",
            background: nightMode ? "rgba(251,146,60,0.12)" : "rgba(251,146,60,0.10)",
            border: `1px solid ${nightMode ? "rgba(251,146,60,0.35)" : "rgba(194,98,10,0.28)"}`,
            borderRadius: 14,
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18 }}>🌙</span>
          <span style={{ color: nightMode ? "#fdba74" : "#c2620a", fontWeight: 700, fontSize: 13 }}>
            Evening check-in:
          </span>
          <span style={{ color: nightMode ? "#fcd34d" : "#92400e", fontSize: 13, flex: 1 }}>
            {habits.length - ringDoneCount} habit{habits.length - ringDoneCount === 1 ? "" : "s"} left to complete today.
          </span>
        </div>
      )}
      <h1
        className="hibi-brand-headline"
        style={{
          color: habitTheme.heading,
          fontWeight: 800,
          fontSize: "clamp(26px, 5vw, 38px)",
          letterSpacing: -0.5,
          marginBottom: 4,
        }}
      >
        Habit Studio
      </h1>
      <p style={{ margin: "0 0 10px", color: habitTheme.muted, fontSize: 13 }}>
        Build tiny promises and keep them visible.
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: habitTheme.muted,
          fontWeight: 600,
          fontSize: 22,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={goPrevMonth}
          disabled={isAtMinMonth}
          aria-label="Previous month"
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
        >
          ←
        </button>
        <span>{monthLabel}</span>
        <div
          title={`Day ${ringDay}: ${ringDoneCount}/${habits.length || 0} completed`}
          aria-label={`Progress ring: ${ringDoneCount} of ${habits.length} habits done on day ${ringDay}`}
          style={{
            width: 36,
            height: 36,
            position: "relative",
            display: "grid",
            placeItems: "center",
          }}
        >
          <svg width="36" height="36" viewBox="0 0 36 36" style={{ position: "absolute", inset: 0 }} aria-hidden="true">
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
          <span style={{ color: habitTheme.muted, fontSize: 12, fontWeight: 700 }} aria-hidden="true">{ringDay}</span>
        </div>
        <button
          onClick={goNextMonth}
          aria-label="Next month"
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
        >
          →
        </button>
        <button
          type="button"
          onClick={() => palette.setOpen(true)}
          title="Open command palette"
          style={{
            border: `1px solid ${nightMode ? "rgba(255,255,255,0.14)" : "rgba(46,125,50,0.24)"}`,
            background: "transparent",
            color: habitTheme.muted,
            borderRadius: 999,
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          ⌘K
        </button>
        {(viewYear !== new Date().getFullYear() || viewMonth !== new Date().getMonth()) && (
          <button
            onClick={goToToday}
            aria-label="Jump to current month"
            title="Jump to today"
            style={{
              border: `1px solid ${nightMode ? "rgba(74,222,128,0.3)" : "rgba(26,110,54,0.3)"}`,
              background: "transparent",
              color: nightMode ? "#4ade80" : "#1a6e36",
              borderRadius: 999,
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Today
          </button>
        )}
        {/* Vacation toggle — pauses streak counting for today */}
        <button
          type="button"
          onClick={toggleVacationToday}
          aria-pressed={isTodayVacation()}
          title={isTodayVacation() ? "Click to remove — today will count toward streaks again" : "Mark today as a rest/vacation day so missing habits won't break your streak"}
          style={{
            marginLeft: "auto",
            border: `1.5px solid ${isTodayVacation() ? (nightMode ? "rgba(251,146,60,0.5)" : "rgba(194,98,10,0.4)") : habitTheme.inputBorder}`,
            background: isTodayVacation() ? (nightMode ? "rgba(251,146,60,0.12)" : "rgba(251,146,60,0.08)") : "transparent",
            color: isTodayVacation() ? (nightMode ? "#fdba74" : "#c2620a") : habitTheme.muted,
            borderRadius: 999,
            padding: "4px 10px",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          {isTodayVacation() ? "🌴 Rest day ON — tap to remove" : "🌴 Rest Day"}
        </button>
      </div>
      {isTodayVacation() && (
        <p style={{ margin: "6px 0 0", fontSize: 12, color: nightMode ? "#fdba74" : "#c2620a", fontStyle: "italic" }}>
          Rest day is on — missed habits today won&apos;t break your streak.
        </p>
      )}
      <p style={{
        color: status
          ? /cannot|already|error|failed|not configured/i.test(status)
            ? (nightMode ? "#fca5a5" : "#b91c1c")
            : /connected|updated|archived|restored|saved/i.test(status)
              ? (nightMode ? "#4ade80" : "#15803d")
              : (nightMode ? "#fbbf24" : "#b45309")
          : habitTheme.heading,
        fontWeight: 600,
        marginBottom: 12,
        minHeight: 20,
        fontSize: 13,
      }}>{status}</p>
      {showHabitTips ? (
        <div style={{ marginBottom: 10, borderRadius: 12, border: `1px solid ${habitTheme.border}`, background: nightMode ? "rgba(34,197,94,0.10)" : "rgba(26,110,54,0.08)", padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", maxWidth: 760 }}>
          <span style={{ color: habitTheme.heading, fontSize: 12, fontWeight: 700 }}>Tips:</span>
          <span style={{ color: habitTheme.muted, fontSize: 12, flex: 1 }}>Use F for Focus Mode, double-click a cell for notes, and long-press a habit name for quick actions.</span>
          <button
            onClick={() => {
              setShowHabitTips(false);
              markHabitTipsSeen(userId);
            }}
            style={{ border: `1px solid ${habitTheme.border}`, background: "transparent", color: habitTheme.muted, borderRadius: 8, padding: "4px 8px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {lastRemovedHabit && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: nightMode ? "#1b2026" : "#e8f5e9", border: `1px solid ${nightMode ? "#2b3139" : "#a5d6a7"}`, borderRadius: 8, padding: "7px 12px", marginBottom: 10, maxWidth: 520 }}>
          <span style={{ color: nightMode ? "#e9ecef" : "#14532d", fontSize: 13 }}>&#8220;{lastRemovedHabit.name}&#8221; removed.</span>
          <button onClick={undoRemoveHabit} style={{ border: "none", background: nightMode ? "#2b3139" : "#2e7d32", color: "#fff", borderRadius: 6, padding: "4px 10px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Undo</button>
          <button onClick={() => setLastRemovedHabit(null)} style={{ border: "none", background: "transparent", color: nightMode ? "#9aa3af" : "#888", cursor: "pointer", fontWeight: 700, fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}
      <p className="hibi-habits-instructions" style={{ color: habitTheme.muted, fontWeight: 500, marginBottom: 8 }}>
        Tap a cell to cycle states: empty → dot (done) → filled square (missed).
      </p>
      <p className="hibi-habits-instructions" style={{ color: habitTheme.muted, fontWeight: 500, marginBottom: 8 }}>
        Tap a habit name to rename it. Press Enter or click away to save. Double-click any day cell to add a quick note.
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
            Enter Focus Mode <span style={{ fontSize: 11, opacity: 0.6, fontWeight: 500 }}>[F]</span>
          </button>
        ) : (
          <button
            type="button"
            className="hibi-back-to-full"
            onClick={() => setSoftFocusMode(false)}
            style={{
              border: "none",
              background: "#4ade80",
              color: "#0d2a14",
              borderRadius: 999,
              fontSize: 16,
              fontWeight: 900,
              cursor: "pointer",
              padding: "14px 32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              lineHeight: 1,
              minWidth: 160,
            }}
          >
            ← Full view
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

          {softFocusHabit && !allHabitsDoneToday ? (
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
          ) : allHabitsDoneToday ? (
            <div
              style={{
                borderRadius: 16,
                border: `1px solid ${nightMode ? "rgba(34,197,94,0.35)" : "rgba(26,110,54,0.3)"}`,
                background: nightMode ? "rgba(34,197,94,0.10)" : "rgba(26,110,54,0.06)",
                padding: "24px 18px",
                display: "grid",
                gap: 10,
                justifyItems: "center",
                textAlign: "center",
              }}
            >
              <span style={{ fontSize: 36 }}>🌿</span>
              <p style={{ margin: 0, color: nightMode ? "#4ade80" : "#1a6e36", fontWeight: 800, fontSize: 20 }}>All done for today!</p>
              <p style={{ margin: 0, color: habitTheme.body, fontSize: 14, lineHeight: 1.45 }}>You completed every habit. That is something worth sitting with.</p>
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
      <>
      {/* Category filter pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, maxWidth: 520 }}>
        <button
          onClick={() => setCategoryFilter(null)}
          style={{
            padding: "5px 12px",
            borderRadius: 999,
            border: "none",
            background: !categoryFilter ? (nightMode ? "rgba(34,197,94,0.18)" : "rgba(46,125,50,0.14)") : "transparent",
            color: !categoryFilter ? (nightMode ? "#4ade80" : "#14532d") : (nightMode ? "#6a7a6a" : "#4a7a50"),
            fontWeight: !categoryFilter ? 700 : 500,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          All
        </button>
        {DEFAULT_CATEGORIES.map((cat) => {
          const count = habits.filter((h) => habitCategories[h] === cat).length;
          if (count === 0 && categoryFilter !== cat) return null;
          return (
            <button
              key={cat}
              onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
              style={{
                padding: "5px 12px",
                borderRadius: 999,
                border: "none",
                background: categoryFilter === cat ? (nightMode ? "rgba(34,197,94,0.18)" : "rgba(46,125,50,0.14)") : "transparent",
                color: categoryFilter === cat ? (nightMode ? "#4ade80" : "#14532d") : (nightMode ? "#6a7a6a" : "#4a7a50"),
                fontWeight: categoryFilter === cat ? 700 : 500,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {cat} ({count})
            </button>
          );
        })}
        {habits.filter((h) => !habitCategories[h]).length > 0 && (
          <button
            onClick={() => setCategoryFilter("uncategorized")}
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              border: "none",
              background: categoryFilter === "uncategorized" ? (nightMode ? "rgba(34,197,94,0.18)" : "rgba(46,125,50,0.14)") : "transparent",
              color: categoryFilter === "uncategorized" ? (nightMode ? "#4ade80" : "#14532d") : (nightMode ? "#6a7a6a" : "#4a7a50"),
              fontWeight: categoryFilter === "uncategorized" ? 700 : 500,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Uncategorized ({habits.filter((h) => !habitCategories[h]).length})
          </button>
        )}
      </div>

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
      </>
      )}

      {softFocusMode && (
      <form className="hibi-softfocus-add-form" onSubmit={addHabit} style={{ display: "none", gap: 8, marginBottom: 12, maxWidth: 520 }}>
        <input
          value={newHabit}
          onChange={(e) => setNewHabit(e.target.value)}
          placeholder="Add a new habit"
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
                        {days.map(day => {
                          const dow = day <= daysInMonth ? new Date(viewYear, viewMonth, day).getDay() : -1;
                          const DOW_LABELS = ["S","M","T","W","T","F","S"];
                          const isWeekend = dow === 0 || dow === 6;
                          return (
                            <th
                              key={day}
                              style={{
                                background: nightMode ? "#242b33" : "#a5d6a7",
                                color: habitTheme.heading,
                                fontWeight: 700,
                                fontSize: 13,
                                padding: "4px 0",
                                borderBottom: "2px solid #388e3c",
                                borderTopRightRadius: day === 31 ? 12 : 0,
                                borderLeft: day % 7 === 1 && day !== 1 ? `2px solid ${nightMode ? "#39424d" : "#81c784"}` : undefined,
                                textAlign: "center",
                                minWidth: 32,
                              }}
                            >
                              <span style={{ display: "block", lineHeight: 1.3 }}>{day}</span>
                              {dow >= 0 && <span style={{ display: "block", fontSize: 9, fontWeight: 500, opacity: 0.6, color: isWeekend ? (nightMode ? "#f5a623" : "#795548") : "inherit" }}>{DOW_LABELS[dow]}</span>}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {habits.filter((habit) => {
                        if (!categoryFilter) return true;
                        if (categoryFilter === "uncategorized") return !habitCategories[habit];
                        return habitCategories[habit] === categoryFilter;
                      }).map((habit, habitIdx) => (
                        <Draggable key={`${habit}-${habitIdx}`} draggableId={`${habit}-${habitIdx}`} index={habitIdx}>
                          {(provided, snapshot) => (
                            <tr
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              style={{
                                ...provided.draggableProps.style,
                                background: snapshot.isDragging ? (nightMode ? "#242b33" : "#b2dfdb") : undefined,
                              }}
                            >
                              <td className="hibi-habits-sticky-col" style={{
                                background: nightMode ? "#242b33" : "#a5d6a7",
                                color: habitTheme.heading,
                                fontWeight: 700,
                                padding: "8px 12px",
                                borderRight: `2px solid ${nightMode ? "#39424d" : "#388e3c"}`,
                                borderLeft: habitColors[habit] ? `4px solid ${habitColors[habit]}` : undefined,
                                borderTopLeftRadius: 0,
                                borderBottomLeftRadius: 0,
                                position: "sticky",
                                left: 0,
                                zIndex: 1,
                                minWidth: isMobile ? "max-content" : 120,
                                maxWidth: "none",
                                whiteSpace: "nowrap",
                                overflow: "visible",
                              }}
                                onTouchStart={(e) => handleHabitRowTouchStart(habit, e)}
                                onTouchEnd={(e) => handleHabitRowTouchEnd(habit, e)}>
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
                                        onMouseDown={(e) => habitLongPress.onMouseDown(habit, e)}
                                        onMouseUp={habitLongPress.onMouseUp}
                                        onMouseLeave={habitLongPress.onMouseLeave}
                                        onTouchStart={(e) => habitLongPress.onTouchStart(habit, e)}
                                        onTouchEnd={habitLongPress.onTouchEnd}
                                        className="hibi-habits-name-btn"
                                        style={{
                                          border: "none",
                                          background: "transparent",
                                          color: habitTheme.heading,
                                          fontWeight: 700,
                                          cursor: "text",
                                          padding: 0,
                                          textAlign: "left",
                                          overflow: "visible",
                                          textOverflow: "clip",
                                          whiteSpace: "nowrap",
                                          maxWidth: "none",
                                          display: "block",
                                        }}
                                        aria-label={`Edit ${habit}`}
                                      >
                                        {habit}
                                      </button>
                                    )}
                                  </span>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative", flexShrink: 0 }}>
                                    {editingHabit !== habit && (
                                      <button
                                        type="button"
                                        onClick={() => setHabitStatsPopover(habit)}
                                        title={`View stats for ${habit}: completion rate and streak details`}
                                        aria-label={`View stats for ${habit}`}
                                        style={{ border: "none", background: "transparent", color: habitTheme.muted, cursor: "pointer", fontSize: 12, lineHeight: 1, padding: "0 2px" }}
                                      >
                                        📊
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      title="Habit color"
                                      data-color-picker="true"
                                      onClick={(e) => {
                                        if (colorPickerOpenFor === habit) {
                                          setColorPickerOpenFor(null);
                                        } else {
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          setColorPickerPos({ x: rect.left, y: rect.bottom + 6 });
                                          setColorPickerOpenFor(habit);
                                        }
                                      }}
                                      style={{
                                        border: "none",
                                        background: habitColors[habit] || "transparent",
                                        color: habitColors[habit] ? "#fff" : habitTheme.muted,
                                        width: 14,
                                        height: 14,
                                        borderRadius: "50%",
                                        cursor: "pointer",
                                        boxShadow: `0 0 0 1.5px ${nightMode ? "#5f6b7a" : "#8fbf92"}`,
                                        padding: 0,
                                        fontSize: 0,
                                        flexShrink: 0,
                                      }}
                                      aria-label={`Set color for ${habit}`}
                                    />

                                    <button
                                      type="button"
                                      onClick={() => archiveHabit(habit)}
                                      disabled={editingHabit === habit}
                                      title="Archive habit"
                                      style={{
                                        border: "none",
                                        background: "transparent",
                                        color: editingHabit === habit ? (nightMode ? "#5f6b7a" : "#8fbf92") : habitTheme.muted,
                                        fontWeight: 700,
                                        cursor: editingHabit === habit ? "not-allowed" : "pointer",
                                        lineHeight: 1,
                                        fontSize: 14,
                                        padding: "0 2px",
                                      }}
                                      aria-label={`Archive ${habit}`}
                                    >
                                      ↓
                                    </button>
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
                                        fontSize: 16,
                                        padding: "0 2px",
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
                                const isWeekBoundary = day % 7 === 1 && day !== 1;
                                return (
                                  <td
                                    key={key}
                                    onClick={(e) => handleHabitCellClick(habit, day, e)}
                                    className={completionPulseKey === key ? "habit-complete-pulse" : ""}
                                    title={noteText || undefined}
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
                                      borderLeft: isWeekBoundary ? `2px solid ${nightMode ? "#39424d" : "#81c784"}` : `1px solid ${nightMode ? "#39424d" : "#bdbdbd"}`,
                                      borderTop: `1px solid ${nightMode ? "#39424d" : "#bdbdbd"}`,
                                      borderBottom: `1px solid ${nightMode ? "#39424d" : "#bdbdbd"}`,
                                      borderRight: `1px solid ${nightMode ? "#39424d" : "#bdbdbd"}`,
                                      boxShadow: isOutOfMonth
                                        ? "none"
                                        : isFill
                                        ? "0 2px 8px #81c78455"
                                        : isDot
                                        ? "0 1px 5px #9ccc9e44"
                                        : "0 1px 2px #bdbdbd22",
                                      transition: "all var(--hibi-motion-snap) var(--hibi-ease-snap)",
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
          className="hibi-analysis-panel"
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
            {patternInsights.map((line, i) => (
              <p key={`insight-${i}`} style={{ margin: 0, color: habitTheme.heading, lineHeight: 1.4 }}>
                {line}
              </p>
            ))}
          </div>

          {noteCount > 0 && (
            <>
              <p style={{ color: habitTheme.heading, margin: "0 0 6px", fontWeight: 700 }}>Habit Notes</p>
              <div style={{ display: "grid", gap: 4, marginBottom: 12 }}>
                {noteHighlights.map((line, i) => (
                  <p key={`note-${i}`} style={{ margin: 0, color: habitTheme.body, fontSize: 13, lineHeight: 1.35 }}>
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

          {habitsWithStreaks.length > 0 && (
            <div style={{ borderTop: `1px solid ${habitTheme.border}`, paddingTop: 10, marginBottom: 14 }}>
              <p style={{ color: habitTheme.heading, fontWeight: 700, margin: "0 0 8px" }}>Habit Progress</p>
              <div style={{ display: "grid", gap: 8 }}>
                {habitsWithStreaks.map(({ habit, rate, currentStreak, bestStreak }, i) => (
                  <div key={`streak-${i}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ color: habitTheme.body, fontSize: 12, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{habit}</span>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
                        <span style={{ background: currentStreak > 0 ? (nightMode ? "rgba(34,197,94,0.18)" : "rgba(26,110,54,0.12)") : (nightMode ? "#242b33" : "#e8f0e8"), color: currentStreak > 0 ? (nightMode ? "#4ade80" : "#1a6e36") : habitTheme.muted, fontWeight: 700, fontSize: 10, padding: "2px 7px", borderRadius: 999, whiteSpace: "nowrap" }}>
                          {currentStreak}d 🔥
                        </span>
                        <span style={{ background: nightMode ? "#242b33" : "#e8f0e8", color: habitTheme.muted, fontWeight: 600, fontSize: 10, padding: "2px 7px", borderRadius: 999, whiteSpace: "nowrap" }}>
                          best {bestStreak}d
                        </span>
                      </div>
                    </div>
                    <div style={{ background: nightMode ? "#242b33" : "#d8ead8", borderRadius: 999, height: 6, overflow: "hidden" }}>
                      <div style={{ width: `${Math.round(rate * 100)}%`, height: "100%", background: rate >= 0.7 ? "#2e7d32" : rate >= 0.4 ? "#66bb6a" : "#a5d6a7", borderRadius: 999, transition: "width 0.4s ease" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {habits.length > 0 && analysisDays > 0 && (
            <div style={{ borderTop: `1px solid ${habitTheme.border}`, paddingTop: 10, marginBottom: 14 }}>
              <p style={{ color: habitTheme.heading, fontWeight: 700, margin: "0 0 10px" }}>Monthly Heatmap</p>
              <div style={{ display: "grid", gap: 10 }}>
                {habits.map((habit) => (
                  <div key={`heatmap-${habit}`}>
                    <p style={{ margin: "0 0 4px", color: habitTheme.body, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{habit}</p>
                    <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                      {Array.from({ length: analysisDays }, (_, i) => {
                        const day = i + 1;
                        const state = checked[`${habit}-${day}`];
                        let bg;
                        if (state === "dot") bg = nightMode ? "#22c55e" : "#2e7d32";
                        else if (state === "fill") bg = nightMode ? "#f5a623" : "#e67e00";
                        else bg = nightMode ? "#1e2630" : "#dde8dd";
                        return (
                          <div
                            key={`hm-${habit}-${day}`}
                            title={`${habit} - Day ${day}: ${state === "dot" ? "done" : state === "fill" ? "skipped" : "no data"}`}
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 3,
                              background: bg,
                              opacity: state === "dot" ? 1 : state === "fill" ? 0.65 : 0.25,
                              flexShrink: 0,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
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

      {archivedHabits.length > 0 && !softFocusMode && (
        <div style={{ maxWidth: 520, marginTop: 20, background: nightMode ? "#1b2026" : "#f4faf2", border: `1px solid ${nightMode ? "#2b3139" : "#c5dec6"}`, borderRadius: 12, padding: 14 }}>
          <p style={{ color: nightMode ? "#9aa3af" : "#2e7d32", fontWeight: 700, margin: "0 0 8px", fontSize: 15 }}>🗄 Archived Habits</p>
          <div style={{ display: "grid", gap: 6 }}>
            {archivedHabits.map((h, i) => (
              <div key={`archived-${i}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: nightMode ? "#9aa3af" : "#555", fontSize: 14, flex: 1 }}>{h}</span>
                <button
                  onClick={() => unarchiveHabit(h)}
                  style={{ border: `1px solid ${nightMode ? "#2b3139" : "#a5d6a7"}`, background: "transparent", color: nightMode ? "#9aa3af" : "#2e7d32", borderRadius: 6, padding: "3px 9px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {habitContextMenu.open ? (
        <div role="presentation" style={{ position: "fixed", inset: 0, zIndex: 70 }} onClick={() => setHabitContextMenu({ open: false, x: 0, y: 0, habit: "" })}>
          <div
            ref={habitContextMenuRef}
            tabIndex={-1}
            role="menu"
            aria-label="Habit quick actions"
            style={{ position: "fixed", left: habitContextMenu.x, top: habitContextMenu.y, transform: "translate(-50%, -110%)", background: habitTheme.panel, border: `1px solid ${habitTheme.border}`, borderRadius: 10, padding: 6, minWidth: 170, display: "grid", gap: 4 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button role="menuitem" aria-label="Rename habit" onClick={() => { setEditingHabit(habitContextMenu.habit); setEditingHabitValue(habitContextMenu.habit); setHabitContextMenu({ open: false, x: 0, y: 0, habit: "" }); }} style={{ border: "none", background: "transparent", color: habitTheme.heading, textAlign: "left", padding: "6px 8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Rename</button>
            <button role="menuitem" aria-label="Archive habit" onClick={() => { archiveHabit(habitContextMenu.habit); setHabitContextMenu({ open: false, x: 0, y: 0, habit: "" }); }} style={{ border: "none", background: "transparent", color: habitTheme.heading, textAlign: "left", padding: "6px 8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Archive</button>
            <div style={{ borderTop: `1px solid ${habitTheme.border}`, margin: "2px 0" }} />
            <p style={{ margin: 0, padding: "4px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: nightMode ? "#6a7a6a" : "#999" }}>Category</p>
            {DEFAULT_CATEGORIES.map((cat) => (
              <button
                key={cat}
                role="menuitem"
                onClick={() => {
                  const next = { ...habitCategories };
                  if (next[habitContextMenu.habit] === cat) delete next[habitContextMenu.habit];
                  else next[habitContextMenu.habit] = cat;
                  setHabitCategories(next);
                  writeHabitCategories(userId, next);
                  setHabitContextMenu({ open: false, x: 0, y: 0, habit: "" });
                }}
                style={{ border: "none", background: "transparent", color: habitCategories[habitContextMenu.habit] === cat ? (nightMode ? "#4ade80" : "#14532d") : habitTheme.heading, textAlign: "left", padding: "4px 8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: habitCategories[habitContextMenu.habit] === cat ? 700 : 500 }}
              >
                {habitCategories[habitContextMenu.habit] === cat ? "✓ " : ""}{cat}
              </button>
            ))}
            <div style={{ borderTop: `1px solid ${habitTheme.border}`, margin: "2px 0" }} />
            <button role="menuitem" aria-label="Delete habit" onClick={() => { removeHabit(habitContextMenu.habit); setHabitContextMenu({ open: false, x: 0, y: 0, habit: "" }); }} style={{ border: "none", background: "transparent", color: nightMode ? "#fca5a5" : "#b91c1c", textAlign: "left", padding: "6px 8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Delete</button>
          </div>
        </div>
      ) : null}

      <CommandPaletteDialog
        open={palette.open}
        onClose={() => palette.setOpen(false)}
        palette={palette}
        theme={{ ...habitTheme, text: habitTheme.heading }}
        nightMode={nightMode}
        dialogLabel="Habits command palette"
        inputLabel="Search habits commands"
      />
      <LiveRegion message={liveMessage} />
      <style jsx>{`
        .habit-complete-pulse {
          animation: ${reducedMotion ? "none" : "habitCompletePulse 0.4s ease-out"};
        }

        .soft-focus-card {
          animation: ${reducedMotion ? "none" : "softFocusEnter 0.38s ease"};
        }

        .soft-focus-exit {
          animation: ${reducedMotion ? "none" : "softFocusExit 0.2s ease"};
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
      {/* Fixed-position color picker — renders above everything, not clipped by table overflow */}
      {colorPickerOpenFor && (
        <div
          data-color-picker="true"
          style={{
            position: "fixed",
            top: colorPickerPos.y,
            left: colorPickerPos.x,
            background: nightMode ? "#2b3139" : "#fff",
            border: `1px solid ${nightMode ? "#39424d" : "#ccc"}`,
            borderRadius: 12,
            padding: 8,
            display: "flex",
            flexWrap: "wrap",
            gap: 5,
            zIndex: 9999,
            boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
            maxWidth: 160,
          }}
        >
          {["#ef5350","#ff9800","#ffca28","#43a047","#26a69a","#1e88e5","#5c6bc0","#8e24aa","#e91e63","#795548","#546e7a"].map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => { setHabitColor(colorPickerOpenFor, c); setColorPickerOpenFor(null); }}
              style={{ width: 20, height: 20, borderRadius: "50%", border: habitColors[colorPickerOpenFor] === c ? "2.5px solid #fff" : `1.5px solid ${nightMode ? "#5f6b7a" : "#ccc"}`, background: c, cursor: "pointer", padding: 0, boxShadow: habitColors[colorPickerOpenFor] === c ? "0 0 0 2px #555" : "none" }}
            />
          ))}
          <button
            key="remove"
            type="button"
            title="Remove color"
            onClick={() => { setHabitColor(colorPickerOpenFor, ""); setColorPickerOpenFor(null); }}
            style={{ width: 20, height: 20, borderRadius: "50%", border: `1.5px solid ${nightMode ? "#5f6b7a" : "#e0e0e0"}`, background: nightMode ? "#3a4250" : "#f5f5f5", cursor: "pointer", padding: 0, fontSize: 11, color: nightMode ? "#fca5a5" : "#b91c1c", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}
            aria-label="Remove color"
          >✕</button>
        </div>
      )}

      {notePopover.habit !== null && (
        <div
          onClick={() => setNotePopover({ habit: null, day: null, text: "" })}
          style={{ position: "fixed", inset: 0, background: "#0004", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: nightMode ? "#2b3139" : "#fff", borderRadius: 14, padding: 20, width: 320, maxWidth: "90vw", boxShadow: "0 8px 32px #0004" }}
          >
            <p style={{ margin: "0 0 10px", fontWeight: 700, color: nightMode ? "#e0e6ed" : "#1b2026", fontSize: 15 }}>
              Note for <em>{notePopover.habit}</em> — Day {notePopover.day}
            </p>
            <textarea
              autoFocus
              value={notePopover.text}
              onChange={(e) => setNotePopover((p) => ({ ...p, text: e.target.value }))}
              rows={4}
              maxLength={200}
              placeholder="Add a note…"
              style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, border: `1px solid ${nightMode ? "#39424d" : "#ccc"}`, background: nightMode ? "#1b2026" : "#f8f8f8", color: nightMode ? "#e0e6ed" : "#1b2026", padding: "8px 10px", fontSize: 14, resize: "vertical" }}
            />
            <p style={{ margin: "4px 0 0", textAlign: "right", fontSize: 11, color: nightMode ? "#6a8a70" : "#888" }}>{notePopover.text.length}/200</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
              <button
                onClick={() => setNotePopover({ habit: null, day: null, text: "" })}
                style={{ border: `1px solid ${nightMode ? "#39424d" : "#ccc"}`, background: "transparent", color: nightMode ? "#a0aab4" : "#555", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600 }}
              >Cancel</button>
              <button
                onClick={() => {
                  saveHabitNote(notePopover.habit, notePopover.day, notePopover.text);
                  setNotePopover({ habit: null, day: null, text: "" });
                }}
                style={{ border: "none", background: "#43a047", color: "#fff", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 700 }}
              >Save Note</button>
            </div>
          </div>
        </div>
      )}

      {/* Per-habit stats popup */}
      {habitStatsPopover && (() => {
        const sHabit = habitStatsPopover;
        const sStats = habitStats.find((s) => s.habit === sHabit) || { done: 0, missed: 0, rate: 0 };
        const sStreak = habitsWithStreaks.find((s) => s.habit === sHabit) || { currentStreak: 0, bestStreak: 0 };
        const sNotes = Object.entries(habitNotes)
          .filter(([k]) => k.startsWith(`${sHabit}-`))
          .map(([k, v]) => ({ day: k.replace(`${sHabit}-`, ""), note: v }))
          .slice(-8);
        return (
          <div
            onClick={() => setHabitStatsPopover(null)}
            style={{ position: "fixed", inset: 0, background: "#0006", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: nightMode ? "#1e2530" : "#fff", borderRadius: 18, padding: 24, width: 360, maxWidth: "92vw", boxShadow: "0 12px 40px #0004", border: `1px solid ${habitTheme.border}` }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <p style={{ margin: 0, fontWeight: 800, color: habitTheme.heading, fontSize: 17 }}>📊 {sHabit}</p>
                <button onClick={() => setHabitStatsPopover(null)} aria-label="Close stats" style={{ border: "none", background: "transparent", color: habitTheme.muted, fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                <div style={{ background: nightMode ? "#242b33" : "#f3fbf3", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: habitTheme.muted, fontWeight: 600, textTransform: "uppercase" }}>Completion</p>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: nightMode ? "#4ade80" : "#1a6e36" }}>{Math.round(sStats.rate * 100)}%</p>
                </div>
                <div style={{ background: nightMode ? "#242b33" : "#f3fbf3", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: habitTheme.muted, fontWeight: 600, textTransform: "uppercase" }}>Streak</p>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: habitTheme.heading }}>{sStreak.currentStreak}d</p>
                </div>
                <div style={{ background: nightMode ? "#242b33" : "#f3fbf3", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: habitTheme.muted, fontWeight: 600, textTransform: "uppercase" }}>Best</p>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: habitTheme.heading }}>{sStreak.bestStreak}d</p>
                </div>
              </div>
              <div style={{ background: nightMode ? "#242b33" : "#f3fbf3", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: habitTheme.muted }}>Done / Skipped</p>
                <p style={{ margin: 0, color: habitTheme.body, fontSize: 14 }}>{sStats.done} done · {sStats.missed} skipped</p>
              </div>
              {sNotes.length > 0 && (
                <div>
                  <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: habitTheme.muted }}>Recent Notes</p>
                  <div style={{ display: "grid", gap: 4 }}>
                    {sNotes.map(({ day, note }) => (
                      <p key={day} style={{ margin: 0, color: habitTheme.body, fontSize: 12, lineHeight: 1.35 }}>
                        <span style={{ color: habitTheme.muted }}>Day {day}:</span> {note}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </main>
  );
}
