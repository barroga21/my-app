"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import {
  getStoredNightModePreference,
  isNightModeEnabled,
  NIGHT_MODE_OPTIONS,
  setStoredNightModePreference,
} from "@/lib/nightModePreference";
import { INTERACTION_TUNING, shouldTriggerSwipeDelete, triggerHaptic } from "@/lib/interactionTuning";
import { useAuthBootstrap } from "@/lib/hooks/useAuthBootstrap";
import { useLongPress } from "@/lib/hooks/useLongPress";
import { useCommandPalette } from "@/lib/hooks/useCommandPalette";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import {
  safeReadJSON,
  sanitizeHabitChecksMap,
  sanitizeJournalEntriesMap,
} from "@/lib/storageSchema";
import { createOfflineSyncWorker, ensureOfflineStore } from "@/lib/offline";
import {
  applyConflictChoices,
  buildConflictRows,
} from "@/lib/offline/conflictResolution";
import { getSignedMediaUrl, isStorageRef, uploadImageToSupabase } from "@/lib/mediaStorage";
import {
  getJournalSidebarWidth,
  getJournalWordGoal,
  hasSeenJournalTips,
  markJournalTipsSeen,
  readJournalYearMap,
  setJournalSidebarWidth,
  setJournalWordGoal,
  writeJournalYearMap,
} from "@/lib/repositories/journalSettingsRepo";
import { readCustomTemplates, writeCustomTemplates, addCustomTemplate, removeCustomTemplate } from "@/lib/repositories/templatesRepo";
import { exportEntryAsMarkdown, copyToClipboard } from "@/lib/dataExport";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { usePerformanceProbe } from "@/lib/hooks/usePerformanceProbe";
import NavBar from "@/app/components/NavBar";
import BreathingBackground from "@/app/components/BreathingBackground";
import CommandPaletteDialog from "@/app/components/ui/CommandPaletteDialog";
import LiveRegion from "@/app/components/ui/LiveRegion";
import MobileActionBar from "@/app/components/ui/MobileActionBar";

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

function stripMarkdownPreview(text) {
  return (text || "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/==(.+?)==/g, "$1");
}

function highlightQueryInText(text, query) {
  if (!query || !query.trim()) return text;
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${safe})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ background: "rgba(251, 211, 10, 0.3)", borderRadius: 2, padding: "0 1px" }}>{part}</mark>
      : part
  );
}
const WRITE_GUIDES = [
  "Start with one true sentence.",
  "What are you carrying right now?",
  "Name one thing that felt alive today.",
  "What do you want to release before sleep?",
];

const TEMPLATES = [
  {
    label: "🌅 Morning Pages",
    text: "This morning I feel...\n\nI am grateful for...\n\nOne intention for today:\n\n",
  },
  {
    label: "🙏 Gratitude",
    text: "Three things I am grateful for today:\n1. \n2. \n3. \n\nWhy these matter to me:\n\n",
  },
  {
    label: "🌙 Evening Review",
    text: "How today went:\n\nWhat I learned or noticed:\n\nWhat I want to carry into tomorrow:\n\n",
  },
  {
    label: "📅 Weekly Reflect",
    text: "The theme of this week was...\n\nWhat went well:\n\nWhat challenged me:\n\nWhat I want to focus on next week:\n\n",
  },
];

// YEAR is now a component-level state (selectedYear) to support year navigation

function makeEmptyEntry() {
  return {
    id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text: "",
    mood: "neutral",
    tags: [],
    photos: [],
    hibiNote: "",
    starred: false,
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
    starred: raw?.starred === true,
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
  const reducedMotion = useReducedMotion();

  const { authReady, userId } = useAuthBootstrap({ supabase, router, redirectTo: "/login" });

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState(now.getDate());

  const [entriesByDate, setEntriesByDate] = useState({});
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [draftEntry, setDraftEntry] = useState(makeEmptyEntry());
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [customTagInput, setCustomTagInput] = useState("");
  const [pinnedEntries, setPinnedEntries] = useState(new Set());
  const [pinnedFilter, setPinnedFilter] = useState(false);

  const [writeWithHibi, setWriteWithHibi] = useState(false);
  const [nightModePreference, setNightModePreference] = useState(() => {
    if (typeof window === "undefined") return NIGHT_MODE_OPTIONS.AUTO;
    try { return getStoredNightModePreference(); } catch { return NIGHT_MODE_OPTIONS.AUTO; }
  });
  const [autoNightTimestamp, setAutoNightTimestamp] = useState(Date.now());

  const [calendarPhotosByDate, setCalendarPhotosByDate] = useState({});
  const [habitChecks, setHabitChecks] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [starFilter, setStarFilter] = useState(false);
  const [tagFilter, setTagFilter] = useState(null);
  const [wordGoal, setWordGoal] = useState(0);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncPending, setSyncPending] = useState(0);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [syncConflictDate, setSyncConflictDate] = useState(null);
  const [syncConflictReview, setSyncConflictReview] = useState({
    open: false,
    date: null,
    localEntries: [],
    remoteEntries: [],
  });
  const [syncConflictChoices, setSyncConflictChoices] = useState({});
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [entryChipRenderLimit, setEntryChipRenderLimit] = useState(40);
  const [sidebarWidth, setSidebarWidth] = useState(200);
  const [showJournalTips, setShowJournalTips] = useState(false);
  const [undoDelete, setUndoDelete] = useState(null);
  const [liveMessage, setLiveMessage] = useState("");
  const [entryContextMenu, setEntryContextMenu] = useState({ open: false, x: 0, y: 0, entryId: null });
  const [signedMediaMap, setSignedMediaMap] = useState({});
  const [customTemplates, setCustomTemplates] = useState([]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const autoSaveTimerRef = useRef(null);
  const entrySwipeStartRef = useRef({});
  const resizingSidebarRef = useRef(false);
  const syncQueueRef = useRef(null);
  const dirtyDatesRef = useRef(new Set());
  const syncTimerRef = useRef(null);
  const entryContextMenuRef = useRef(null);
  const conflictDialogRef = useRef(null);
  // Ref always pointing to the latest saveEntry — prevents stale closure in auto-save/keyboard effects
  const saveEntryRef = useRef(null);

  const entryLongPress = useLongPress((entryId, e) => {
    if (!entryId) return;
    const touch = e?.touches?.[0] || e?.changedTouches?.[0];
    const x = touch?.clientX || e?.clientX || window.innerWidth / 2;
    const y = touch?.clientY || e?.clientY || window.innerHeight / 2;
    setEntryContextMenu({ open: true, x, y, entryId });
  }, { delay: 460 });

  useFocusTrap({
    open: entryContextMenu.open,
    containerRef: entryContextMenuRef,
    onClose: () => setEntryContextMenu({ open: false, x: 0, y: 0, entryId: null }),
  });

  useFocusTrap({
    open: syncConflictReview.open,
    containerRef: conflictDialogRef,
    onClose: closeConflictReview,
  });

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const nightMode = isNightModeEnabled(nightModePreference, new Date(autoNightTimestamp));

  function dateKey(day, month = selectedMonth) {
    return `${selectedYear}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function safeRead(key, fallback, sanitizer) {
    return safeReadJSON(key, fallback, sanitizer);
  }

  function generateHibiNote(text, mood, tags) {
    const trimmed = (text || "").trim();
    if (!trimmed) return "A quiet page can still hold a real feeling.";

    const wordCount = trimmed.split(/\s+/).length;
    const hasTags = tags && tags.length > 0;
    const questionCount = (trimmed.match(/\?/g) || []).length;
    const exclamationCount = (trimmed.match(/!/g) || []).length;
    const hasI = /\bI\b/.test(trimmed);

    if (mood === "warm" && wordCount > 150) return "Your warmth fills these words. Something good is being tended to here.";
    if (mood === "warm") return "You sound grounded and warm today. That steadiness matters.";
    if (mood === "cool" && questionCount >= 2) return "The questions you are sitting with are worth the time you are giving them.";
    if (mood === "cool") return "There is a soft, reflective tone in your words today.";
    if (mood === "deep" && wordCount > 200) return "You went to a deep place today. Writing like this takes real courage.";
    if (mood === "deep") return "You carried something heavy today and you gave it language. That is not small.";
    if (mood === "hopeful") return "There is something light in this entry — a small forward lean. Hold that.";
    if (mood === "heavy") return "Some days are hard to hold. You wrote through it anyway. That counts.";
    if (mood === "light") return "A lighter day lives here. It is good to notice those.";

    if (tags.includes("gratitude") && wordCount > 80) return "The gratitude in this entry is detailed and specific. That is the kind that sticks.";
    if (tags.includes("gratitude")) return "There is gratitude here, and it brightens the page.";
    if (tags.includes("anxiety")) return "Naming what feels anxious takes the edge off it slightly. You are doing that.";
    if (tags.includes("growth")) return "Something shifted today and you noticed it. That noticing is growth itself.";
    if (tags.includes("relationships")) return "The people in your life are woven through this entry. They matter to you.";
    if (tags.includes("work")) return "You gave real thought to the work side of life today. That reflection adds up.";
    if (tags.includes("health")) return "You are paying attention to your body and energy. That is a form of self-care.";

    if (exclamationCount >= 3) return "There is energy in this entry — something moved you today.";
    if (questionCount >= 3) return "You are sitting with a lot of open questions. That is a sign of a curious, searching mind.";
    if (wordCount > 300 && hasI) return "You went deep today. There is real self-awareness in how you wrote this.";
    if (wordCount > 300) return "You gave this entry real space and time. That depth shows.";
    if (wordCount < 30) return "Short today, and that is perfectly enough. Sometimes a line holds everything.";
    if (hasTags) return "You labelled this moment. That small act of naming helps you find it later.";

    return "Your energy feels steady. Something in this entry is worth returning to.";
  }

  function mediaSrc(src) {
    return signedMediaMap[src] || src;
  }

  function handleSyncStatusChange({ state, pending }) {
    if (typeof state === "string") {
      setSyncStatus(state);
    }
    if (typeof pending === "number") {
      setSyncPending(Math.max(0, pending));
    }
  }

  function getEntriesForDate(date) {
    return entriesByDate[date] || [];
  }

  function saveEntriesMap(nextMap, changedDates = []) {
    setEntriesByDate(nextMap);
    writeJournalYearMap(userId, selectedYear, nextMap);

    if (!supabase || !userId || !syncQueueRef.current) return;

    changedDates.forEach((date) => dirtyDatesRef.current.add(date));
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      const pendingDates = Array.from(dirtyDatesRef.current);
      dirtyDatesRef.current.clear();
      pendingDates.forEach((date) => {
        const localUpdatedAt = Math.max(
          0,
          ...(nextMap[date] || []).map((entry) => Number(entry?.updatedAt) || 0)
        );
        syncQueueRef.current.enqueue(date, nextMap[date] || [], {
          localUpdatedAt,
          onStatusChange: handleSyncStatusChange,
          onConflict: ({ date: conflictedDate }) => {
            setSyncConflictDate(conflictedDate);
            setSyncStatus("conflict");
            setLiveMessage(`Sync conflict detected for ${conflictedDate}. Choose local, remote, or merged version.`);
            openConflictReview(conflictedDate);
          },
        });
      });
    }, 900);
  }

  async function openConflictReview(date) {
    if (!date) return;
    let remoteEntries = [];
    if (supabase && userId) {
      try {
        const { data } = await supabase
          .from("journal_entries")
          .select("entries")
          .eq("user_id", userId)
          .eq("date", date)
          .maybeSingle();
        remoteEntries = Array.isArray(data?.entries) ? data.entries.map((entry) => normalizeEntry(entry)) : [];
      } catch {
        remoteEntries = [];
      }
    }

    const localEntries = (entriesByDate[date] || []).map((entry) => normalizeEntry(entry));
    const mergedRows = buildConflictRows(localEntries, remoteEntries, normalizeEntry);
    const defaultChoices = {};
    mergedRows.forEach((row) => {
      if (row.local && !row.remote) {
        defaultChoices[row.key] = "local";
      } else if (!row.local && row.remote) {
        defaultChoices[row.key] = "remote";
      } else {
        defaultChoices[row.key] = "merged";
      }
    });
    setSyncConflictChoices(defaultChoices);

    setSyncConflictReview({
      open: true,
      date,
      localEntries,
      remoteEntries,
    });
  }

  function closeConflictReview() {
    setSyncConflictReview({ open: false, date: null, localEntries: [], remoteEntries: [] });
    setSyncConflictChoices({});
  }

  function resolveConflictUseRemote() {
    if (!syncConflictReview.date) return;
    const nextMap = {
      ...entriesByDate,
      [syncConflictReview.date]: syncConflictReview.remoteEntries,
    };
    saveEntriesMap(nextMap, []);
    setSyncConflictDate(null);
    setSyncStatus("idle");
    setLiveMessage(`Loaded remote version for ${syncConflictReview.date}.`);
    closeConflictReview();
  }

  function resolveConflictUseLocal() {
    if (!syncConflictReview.date || !syncQueueRef.current) return;
    const localEntries = syncConflictReview.localEntries;
    const localUpdatedAt = Math.max(0, ...localEntries.map((entry) => Number(entry?.updatedAt) || 0));
    syncQueueRef.current.enqueue(syncConflictReview.date, localEntries, {
      force: true,
      localUpdatedAt: localUpdatedAt || Date.now(),
      onStatusChange: handleSyncStatusChange,
    });
    setSyncConflictDate(null);
    setLiveMessage(`Kept local version for ${syncConflictReview.date} and resynced.`);
    closeConflictReview();
  }

  function resolveConflictMerge() {
    if (!syncConflictReview.date || !syncQueueRef.current) return;
    const mergedEntries = applyConflictChoices(
      syncConflictReview.localEntries,
      syncConflictReview.remoteEntries,
      syncConflictChoices,
      normalizeEntry
    );
    const nextMap = {
      ...entriesByDate,
      [syncConflictReview.date]: mergedEntries,
    };
    saveEntriesMap(nextMap, []);
    const localUpdatedAt = Math.max(0, ...mergedEntries.map((entry) => Number(entry?.updatedAt) || 0));
    syncQueueRef.current.enqueue(syncConflictReview.date, mergedEntries, {
      force: true,
      localUpdatedAt: localUpdatedAt || Date.now(),
      onStatusChange: handleSyncStatusChange,
    });
    setSyncConflictDate(null);
    setLiveMessage(`Merged local and remote entries for ${syncConflictReview.date}.`);
    closeConflictReview();
  }

  function setAllConflictChoices(nextChoice) {
    const rows = buildConflictRows(syncConflictReview.localEntries, syncConflictReview.remoteEntries, normalizeEntry);
    const next = {};
    rows.forEach((row) => {
      next[row.key] = nextChoice;
    });
    setSyncConflictChoices(next);
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
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const cleanedText = (draftEntry.text || "").trim();
    const hasContent = cleanedText || draftEntry.photos.length || draftEntry.tags.length;
    if (!hasContent) return;

    const key = dateKey(selectedDay);
    const list = getEntriesForDate(key);

    const finalEntry = {
      ...normalizeEntry(draftEntry),
      text: draftEntry.text,
      starred: draftEntry.starred,
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

    saveEntriesMap(nextMap, [key]);
    setSelectedEntryId(finalEntry.id);
    setDraftEntry(finalEntry);
    setUnsavedChanges(false);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1200);
  }

  // Keep saveEntryRef pointed at the latest saveEntry every render (stale closure fix)
  saveEntryRef.current = saveEntry;

  function deleteCurrentEntry() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    setDeleteConfirm(false);
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

    saveEntriesMap(nextMap, [key]);

    if (nextList.length) {
      setSelectedEntryId(nextList[0].id);
      setDraftEntry(normalizeEntry(nextList[0]));
    } else {
      beginNewEntry();
    }
  }

  function deleteEntryById(entryId) {
    const key = dateKey(selectedDay);
    const list = getEntriesForDate(key);
    const removedEntry = list.find((entry) => entry.id === entryId);
    const nextList = list.filter((entry) => entry.id !== entryId);
    const nextMap = { ...entriesByDate };
    if (nextList.length) nextMap[key] = nextList;
    else delete nextMap[key];
    saveEntriesMap(nextMap, [key]);
    if (removedEntry) {
      setUndoDelete({ entry: removedEntry, date: key });
    }

    if (selectedEntryId === entryId) {
      if (nextList.length) {
        setSelectedEntryId(nextList[0].id);
        setDraftEntry(normalizeEntry(nextList[0]));
      } else {
        beginNewEntry();
      }
    }
  }

  function undoDeleteEntry() {
    if (!undoDelete) return;
    const { entry, date } = undoDelete;
    const list = entriesByDate[date] || [];
    const nextList = [entry, ...list.filter((item) => item.id !== entry.id)];
    const nextMap = { ...entriesByDate, [date]: nextList };
    saveEntriesMap(nextMap, [date]);
    setUndoDelete(null);
    if (date === dateKey(selectedDay)) {
      setSelectedEntryId(entry.id);
      setDraftEntry(normalizeEntry(entry));
    }
  }

  function handleEntrySwipeStart(entryId, e) {
    const t = e.changedTouches?.[0];
    if (!t) return;
    entrySwipeStartRef.current[entryId] = { x: t.clientX, y: t.clientY, at: Date.now() };
  }

  function handleEntrySwipeEnd(entryId, e) {
    const start = entrySwipeStartRef.current[entryId];
    const t = e.changedTouches?.[0];
    if (!start || !t) return;
    delete entrySwipeStartRef.current[entryId];
    if (shouldTriggerSwipeDelete(start, t, INTERACTION_TUNING.swipeDelete)) {
      triggerHaptic(INTERACTION_TUNING.haptics.journalDeleteMs);
      deleteEntryById(entryId);
    }
  }

  function pinCurrentEntry() {
    if (!selectedEntryId) return;
    setPinnedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(selectedEntryId)) {
        next.delete(selectedEntryId);
      } else {
        next.add(selectedEntryId);
      }
      return next;
    });
  }

  function exportEntries() {
    let md = `# Hibi Journal — ${monthNames[selectedMonth]} ${selectedYear}\n\n`;
    for (let day = 1; day <= daysInMonth; day++) {
      const list = getEntriesForDate(dateKey(day));
      if (!list.length) continue;
      md += `## ${dateKey(day)}\n\n`;
      list.forEach((entry, i) => {
        if (entry.starred) md += `★ `;
        if (entry.mood) md += `**Mood:** ${entry.mood}  \n`;
        if ((entry.tags || []).length) md += `**Tags:** ${entry.tags.map((t) => `#${t}`).join(" ")}  \n`;
        md += `\n${entry.text || ""}\n\n`;
        if (i < list.length - 1) md += `---\n\n`;
      });
    }
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hibi-journal-${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function starCurrentEntry() {
    const nextStarred = !draftEntry.starred;
    setDraftEntry((prev) => ({ ...prev, starred: nextStarred }));
    if (selectedEntryId) {
      const key = dateKey(selectedDay);
      const list = getEntriesForDate(key);
      const nextList = list.map((e) => e.id === selectedEntryId ? { ...e, starred: nextStarred } : e);
      saveEntriesMap({ ...entriesByDate, [key]: nextList });
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

  async function addEntryPhoto(file) {
    if (!file) return;

    const remoteSrc = await uploadImageToSupabase(file, userId, "journal");
    if (remoteSrc) {
      setDraftEntry((prev) => ({ ...prev, photos: [remoteSrc, ...prev.photos].slice(0, 8) }));
      return;
    }

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

  // Auto-save debounce (3s after last change) — uses ref so it always calls the latest saveEntry
  useEffect(() => {
    const hasContent = (draftEntry.text || "").trim() || draftEntry.photos.length || draftEntry.tags.length;
    if (!hasContent) { setUnsavedChanges(false); return; }
    setUnsavedChanges(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      // Regenerate hibiNote on auto-save so it stays current
      if (draftEntry.text && (draftEntry.text || "").trim()) {
        const freshNote = generateHibiNote(draftEntry.text, draftEntry.mood, draftEntry.tags || []);
        setDraftEntry((prev) => ({ ...prev, hibiNote: freshNote }));
      }
      saveEntryRef.current?.();
    }, 3000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [draftEntry.text, draftEntry.mood, draftEntry.tags, draftEntry.photos]);

  // Cmd/Ctrl+S, Cmd/Ctrl+N, ArrowLeft/Right
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveEntryRef.current?.();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        beginNewEntry();
      }
      const inTextArea =
        document.activeElement &&
        (document.activeElement.tagName === "TEXTAREA" ||
          document.activeElement.tagName === "INPUT");
      if (!inTextArea) {
        if (e.key === "ArrowLeft" || e.key === "j" || e.key === "J") {
          setSelectedDay((d) => Math.max(1, d - 1));
        }
        if (e.key === "ArrowRight" || e.key === "k" || e.key === "K") {
          setSelectedDay((d) => Math.min(daysInMonth, d + 1));
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [daysInMonth]);

  useEffect(() => {
    if (!userId || !supabase) {
      syncQueueRef.current = null;
      setSyncStatus("idle");
      setSyncPending(0);
      return;
    }

    ensureOfflineStore(userId);
    syncQueueRef.current = createOfflineSyncWorker({
      supabase,
      userId,
      onStatusChange: handleSyncStatusChange,
    });
    setSyncPending(syncQueueRef.current.pendingCount());
  }, [userId]);

  useEffect(() => {
    function syncOnlineState() {
      setIsOnline(navigator.onLine);
    }

    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);
    return () => {
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
    };
  }, []);

  useEffect(() => {
    function tryResumeSync() {
      if (!syncQueueRef.current) return;
      syncQueueRef.current.resume({
        onStatusChange: handleSyncStatusChange,
      });
      setSyncPending(syncQueueRef.current.pendingCount());
    }

    window.addEventListener("online", tryResumeSync);
    window.addEventListener("visibilitychange", tryResumeSync);
    return () => {
      window.removeEventListener("online", tryResumeSync);
      window.removeEventListener("visibilitychange", tryResumeSync);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    setSidebarWidth(getJournalSidebarWidth(userId, 200));
  }, [userId]);

  useEffect(() => {
    setJournalSidebarWidth(userId, sidebarWidth);
  }, [sidebarWidth, userId]);

  useEffect(() => {
    if (!hasSeenJournalTips(userId)) {
      setShowJournalTips(true);
    }
    // Load custom templates
    setCustomTemplates(readCustomTemplates(userId));
  }, [userId]);

  useEffect(() => {
    const allKey = `hibi_journal_${userId || "guest"}_${selectedYear}_all`;

    function onStorage(event) {
      if (!userId || !event.key) return;
      if (event.key === allKey) {
        const parsed = safeRead(allKey, {}, sanitizeJournalEntriesMap);
        setEntriesByDate(parsed);
      }
      if (event.key === `hibi_journal_sync_status_${userId}`) {
        try {
          const payload = JSON.parse(event.newValue || "{}");
          if (typeof payload.state === "string") {
            setSyncStatus(payload.state);
          }
          if (typeof payload.pending === "number") {
            setSyncPending(Math.max(0, payload.pending));
          }
        } catch {
          // ignore malformed storage payloads
        }
      }
      if (event.key === `hibi_word_goal_${userId}`) {
        const parsed = Number.parseInt(localStorage.getItem(`hibi_word_goal_${userId}`) || "0", 10);
        setWordGoal(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
      }
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId, selectedYear]);

  useEffect(() => {
    const allJournal = readJournalYearMap(userId, selectedYear);

    let normalized = normalizeEntriesMap(allJournal);

    // Migrate any older per-month journal keys into the year-level storage.
    for (let m = 0; m < 12; m++) {
      const legacyKey = `hibi_journal_${userId || "guest"}_${selectedYear}_${String(m + 1).padStart(2, "0")}`;
      const legacy = safeRead(legacyKey, {}, sanitizeJournalEntriesMap);
      const legacyNormalized = normalizeEntriesMap(legacy);
      normalized = { ...legacyNormalized, ...normalized };
    }

    setEntriesByDate(normalized);
    writeJournalYearMap(userId, selectedYear, normalized);

    // Supabase remote pull — merge remote entries (local wins for same date if both present)
    if (supabase && userId) {
      supabase
        .from("journal_entries")
        .select("date, entries")
        .eq("user_id", userId)
        .then(({ data }) => {
          if (!data || !data.length) return;
          const remote = {};
          data.forEach(({ date, entries }) => {
            if (Array.isArray(entries)) {
              remote[date] = entries.map((e) => normalizeEntry(e));
            }
          });
          setEntriesByDate((prev) => {
            // Merge: local dates win, remote fills in missing dates
            const merged = { ...remote, ...prev };
            writeJournalYearMap(userId, selectedYear, merged);
            return merged;
          });
        });
    }
  }, [userId, selectedYear]);

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
    const ritualKey = `calendar_ritual_${userId || "guest"}_${selectedYear}_${String(selectedMonth + 1).padStart(2, "0")}`;
    const primaryHabitKey = `habit_checks_${userId || "guest"}_${selectedYear}_${String(selectedMonth + 1).padStart(2, "0")}`;
    const backupHabitKey = `hibi_habit_checks_backup_${userId || "guest"}_${selectedYear}_${String(selectedMonth + 1).padStart(2, "0")}`;

    const ritual = safeRead(ritualKey, {});
    setCalendarPhotosByDate(ritual.photosByDate || {});

    const primaryHabits = safeRead(primaryHabitKey, {}, sanitizeHabitChecksMap);
    const backupHabits = safeRead(backupHabitKey, {}, sanitizeHabitChecksMap);
    setHabitChecks({ ...backupHabits, ...primaryHabits });
  }, [userId, selectedMonth, selectedYear]);

  useEffect(() => {
    if (selectedDay > daysInMonth) {
      setSelectedDay(daysInMonth);
    }
  }, [selectedMonth, daysInMonth, selectedDay]);

  useEffect(() => {
    const key = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
    const list = entriesByDate[key] || [];
    setEntryChipRenderLimit(40);

    if (!list.length) {
      beginNewEntry();
      return;
    }

    if (!selectedEntryId || !list.some((entry) => entry.id === selectedEntryId)) {
      setSelectedEntryId(list[0].id);
      setDraftEntry(normalizeEntry(list[0]));
    }
  }, [selectedDay, selectedMonth, selectedYear, selectedEntryId, entriesByDate]);

  useEffect(() => {
    setWordGoal(getJournalWordGoal(userId));
  }, [userId]);

  useEffect(() => {
    setJournalWordGoal(userId, wordGoal);
  }, [userId, wordGoal]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(260, ta.scrollHeight)}px`;
  }, [draftEntry.text, selectedEntryId, selectedDay]);

  useEffect(() => {
    function handleResizeSidebar(e) {
      if (!resizingSidebarRef.current) return;
      setSidebarWidth((prev) => Math.max(170, Math.min(360, prev + e.movementX)));
    }
    function stopResizeSidebar() {
      resizingSidebarRef.current = false;
    }
    window.addEventListener("mousemove", handleResizeSidebar);
    window.addEventListener("mouseup", stopResizeSidebar);
    return () => {
      window.removeEventListener("mousemove", handleResizeSidebar);
      window.removeEventListener("mouseup", stopResizeSidebar);
    };
  }, []);

  const currentMood = MOOD_TONES.find((m) => m.key === draftEntry.mood) || MOOD_TONES[1];
  // Mix day + month + year for variety across months (not just within month)
  const prompt = DAILY_PROMPTS[(selectedMonth * 31 + selectedDay - 1) % DAILY_PROMPTS.length];

  const theme = nightMode
    ? {
        page: "linear-gradient(145deg, #070b0d 0%, #0c1117 35%, #101820 70%, #0e1a14 100%)",
        text: "#dde3ea",
        panel: "rgba(12,16,22,0.82)",
        muted: "#6a8a70",
        border: "rgba(255,255,255,0.07)",
        input: "rgba(7,10,15,0.9)",
        accent: "#22c55e",
        accentText: "#0d2a14",
        glass: "rgba(12,16,22,0.82)",
        glassBorder: "rgba(255,255,255,0.07)",
      }
    : {
        page: `linear-gradient(145deg, ${currentMood.tint} 0%, #eef7e8 50%, #e0f0da 100%)`,
        text: "#0d2a14",
        panel: "rgba(255,255,255,0.82)",
        muted: "#4a7a50",
        border: "rgba(46,125,50,0.12)",
        input: "rgba(255,255,255,0.95)",
        accent: "#1a6e36",
        accentText: "#fff",
        glass: "rgba(255,255,255,0.82)",
        glassBorder: "rgba(46,125,50,0.12)",
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

  const journaledDays = (() => {
    const rows = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const list = getEntriesForDate(dateKey(day));
      if (list.length) {
        rows.push({ day, mood: list[0].mood || "neutral", count: list.length });
      }
    }
    return rows;
  })();

  const entriesForSelectedDay = getEntriesForDate(dateKey(selectedDay));
  const visibleEntriesForSelectedDay = entriesForSelectedDay.slice(0, entryChipRenderLimit);

  const calendarPhotoTiles = (() => {
    const list = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const key = dateKey(day);
      const photos = calendarPhotosByDate[key] || [];
      if (photos[0]) list.push({ day, src: photos[0] });
    }
    return list;
  })();

  const weeklySummary = (() => {
    const currentDate = new Date(selectedYear, selectedMonth, selectedDay);
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
  })();

  const filteredJournaledDays = (() => {
    let days = journaledDays;
    if (starFilter) {
      days = days.filter(({ day }) =>
        getEntriesForDate(dateKey(day)).some((e) => e.starred)
      );
    }
    if (pinnedFilter) {
      days = days.filter(({ day }) =>
        getEntriesForDate(dateKey(day)).some((e) => pinnedEntries.has(e.id))
      );
    }
    if (tagFilter) {
      days = days.filter(({ day }) =>
        getEntriesForDate(dateKey(day)).some((e) => (e.tags || []).includes(tagFilter))
      );
    }
    if (!searchQuery.trim()) return days;
    const q = searchQuery.toLowerCase();
    return days.filter(({ day }) =>
      getEntriesForDate(dateKey(day)).some(
        (e) => (e.text || "").toLowerCase().includes(q) || (e.tags || []).some((t) => t.toLowerCase().includes(q))
      )
    );
  })();

  const last7MoodDots = (() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const entries = entriesByDate[k] || [];
      return { key: k, day: d.getDate(), mood: entries[0]?.mood || null };
    });
  })();

  const monthlyReflection = (() => {
    let totalEntries = 0;
    let totalWords = 0;
    const tagCounts = {};
    for (let day = 1; day <= daysInMonth; day++) {
      getEntriesForDate(dateKey(day)).forEach((entry) => {
        totalEntries++;
        totalWords += (entry.text || "").trim().split(/\s+/).filter(Boolean).length;
        (entry.tags || []).forEach((tag) => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; });
      });
    }
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tag]) => tag);
    return { totalEntries, totalWords, topTags };
  })();

  const allTagsInMonth = (() => {
    const tags = new Set();
    for (let day = 1; day <= daysInMonth; day++) {
      getEntriesForDate(dateKey(day)).forEach((entry) => {
        (entry.tags || []).forEach((t) => tags.add(t));
      });
    }
    return Array.from(tags);
  })();

  // Mood timeline: map mood keys to numeric values for SVG line chart
  const MOOD_VALUES = { warm: 5, neutral: 4, steady: 3, cool: 2, deep: 1 };
  const moodTimelinePoints = (() => {
    return journaledDays
      .map(({ day, mood }) => ({ day, value: MOOD_VALUES[mood] || 3 }))
      .filter(({ value }) => value !== undefined);
  })();

  useEffect(() => {
    if (!undoDelete) return;
    const timer = setTimeout(() => setUndoDelete(null), 5000);
    return () => clearTimeout(timer);
  }, [undoDelete]);

  useEffect(() => {
    if (!undoDelete) return;
    setLiveMessage("Entry deleted. Undo is available for five seconds.");
  }, [undoDelete]);

  useEffect(() => {
    if (syncStatus === "idle") return;
    const labels = {
      syncing: "Journal sync in progress.",
      retrying: "Journal sync retrying after a network issue.",
      synced: "Journal synced.",
      error: "Journal sync failed. Changes will retry.",
      conflict: "Journal conflict detected. Review required.",
    };
    if (labels[syncStatus]) {
      setLiveMessage(labels[syncStatus]);
    }
  }, [syncStatus]);

  function retrySyncNow() {
    if (!syncQueueRef.current) return;
    syncQueueRef.current.resume({ onStatusChange: handleSyncStatusChange });
    setSyncPending(syncQueueRef.current.pendingCount());
    setLiveMessage("Retrying sync now.");
  }

  useEffect(() => {
    let cancelled = false;

    async function hydrateSignedMedia() {
      const refs = new Set();

      Object.values(entriesByDate).forEach((entries) => {
        if (!Array.isArray(entries)) return;
        entries.forEach((entry) => {
          (entry.photos || []).forEach((src) => {
            if (isStorageRef(src)) refs.add(src);
          });
        });
      });

      (draftEntry.photos || []).forEach((src) => {
        if (isStorageRef(src)) refs.add(src);
      });

      Object.values(calendarPhotosByDate || {}).forEach((photos) => {
        if (!Array.isArray(photos)) return;
        photos.forEach((src) => {
          if (isStorageRef(src)) refs.add(src);
        });
      });

      if (!refs.size) return;

      const resolved = await Promise.all(
        Array.from(refs).map(async (src) => [src, await getSignedMediaUrl(src)])
      );

      if (cancelled) return;
      setSignedMediaMap((prev) => {
        const next = { ...prev };
        resolved.forEach(([src, url]) => {
          if (url) next[src] = url;
        });
        return next;
      });
    }

    hydrateSignedMedia();
    return () => {
      cancelled = true;
    };
  }, [calendarPhotosByDate, draftEntry.photos, entriesByDate]);

  const activeDate = dateKey(selectedDay);
  const journalCommands = [
    { label: "New entry", group: "Entry", shortcut: "Cmd/Ctrl+N", keywords: "create add", action: beginNewEntry },
    { label: "Save entry", group: "Entry", shortcut: "Cmd/Ctrl+S", keywords: "persist", action: () => saveEntryRef.current?.() },
    {
      label: selectedEntryId && pinnedEntries.has(selectedEntryId) ? "Unpin selected entry" : "Pin selected entry",
      group: "Entry",
      shortcut: "Pin",
      keywords: "favorite pin",
      action: pinCurrentEntry,
    },
    { label: "Export month markdown", group: "File", shortcut: "Export", keywords: "download", action: exportEntries },
    {
      label: selectedEntryId ? "Delete selected entry" : "Delete disabled",
      group: "Entry",
      shortcut: "Del",
      keywords: "remove",
      action: () => selectedEntryId && deleteCurrentEntry(),
    },
    {
      label: `Jump to ${activeDate}`,
      group: "Navigation",
      shortcut: "J / K",
      keywords: "today",
      action: () => setSelectedDay(selectedDay),
    },
  ];

  const palette = useCommandPalette(journalCommands);

  usePerformanceProbe("journal", {
    dayCountWithEntries: journaledDays.length,
    selectedDayEntryCount: entriesForSelectedDay.length,
    calendarPhotoTiles: calendarPhotoTiles.length,
    commandCount: palette.filtered.length,
  });

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
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", gap: 20, paddingTop: 60 }}>
          <div style={{ width: 240, display: "grid", gap: 12, flexShrink: 0 }}>
            <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 36, borderRadius: 12 }} />
            <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 180, borderRadius: 16 }} />
            <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 80, borderRadius: 16 }} />
          </div>
          <div style={{ flex: 1, display: "grid", gap: 12 }}>
            <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 48, borderRadius: 12 }} />
            <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 260, borderRadius: 16 }} />
            <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 40, borderRadius: 12 }} />
          </div>
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
        background: theme.page,
        fontFamily: "var(--font-manrope), sans-serif",
        color: theme.text,
        position: "relative",
        overflow: "hidden",
        isolation: "isolate",
        transition: "background 0.4s ease",
        animation: "hibiPageEnter 0.45s var(--hibi-ease-enter)",
      }}
    >
      <BreathingBackground nightMode={nightMode} />
      {writeWithHibi ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: nightMode ? "rgba(0,0,0,0.7)" : "rgba(10,16,12,0.65)",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      ) : null}

      <NavBar activePage="journal" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 1140, margin: "0 auto 12px", zIndex: 2, position: "relative", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="hibi-brand-headline" style={{ margin: 0, fontSize: "clamp(30px, 5vw, 42px)", letterSpacing: -0.5, color: theme.text, fontWeight: 800 }}>Journal</h1>
          <p style={{ margin: "4px 0 0", color: theme.muted, fontSize: 13 }}>Capture moments, shape meaning, and keep your rhythm in view.</p>
        </div>

        <div className="hibi-journal-top-controls" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Year navigation */}
          <button
            type="button"
            onClick={() => setSelectedYear((y) => y - 1)}
            aria-label="Previous year"
            className="hibi-journal-year-btn"
            style={{ border: `1px solid ${theme.border}`, background: theme.panel, color: theme.text, borderRadius: 8, padding: "7px 8px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}
          >
            ‹{selectedYear - 1}
          </button>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            style={{ border: `1px solid ${theme.border}`, background: theme.panel, color: theme.text, borderRadius: 8, padding: "7px 8px", fontWeight: 700 }}
          >
            {monthNames.map((name, idx) => (
              <option key={name} value={idx}>{name} {selectedYear}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSelectedYear((y) => Math.min(y + 1, now.getFullYear() + 1))}
            aria-label="Next year"
            className="hibi-journal-year-btn"
            style={{ border: `1px solid ${theme.border}`, background: theme.panel, color: theme.text, borderRadius: 8, padding: "7px 8px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}
          >
            {selectedYear + 1}›
          </button>
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(Number(e.target.value))}
            style={{ border: `1px solid ${theme.border}`, background: theme.panel, color: theme.text, borderRadius: 8, padding: "7px 8px", fontWeight: 700 }}
          >
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const hasEntry = getEntriesForDate(dateKey(day)).length > 0;
              return (
                <option key={`day-opt-${day}`} value={day}>{hasEntry ? "● " : ""}Day {day}</option>
              );
            })}
          </select>

          <button
            type="button"
            onClick={() => setWriteWithHibi((v) => !v)}
            style={{ border: `1px solid ${theme.border}`, background: writeWithHibi ? theme.accent : theme.panel, color: writeWithHibi ? "#fff" : theme.text, borderRadius: 999, padding: "7px 12px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}
          >
            {writeWithHibi ? "✦ Focus Mode" : "Focus Writing"}
          </button>
          <button
            type="button"
            onClick={exportEntries}
            title={`Export ${monthNames[selectedMonth]} ${selectedYear} as Markdown`}
            aria-label={`Export journal entries for ${monthNames[selectedMonth]} ${selectedYear}`}
            className="hibi-journal-export-btn"
            style={{ border: `1px solid ${theme.border}`, background: theme.panel, color: theme.text, borderRadius: 999, padding: "7px 12px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}
          >
            ↓ Export
          </button>
          <select
            value={nightModePreference}
            onChange={(e) => {
              const next = e.target.value;
              setNightModePreference(next);
              setStoredNightModePreference(next);
            }}
            className="hibi-journal-night-select"
            style={{ border: `1px solid ${theme.border}`, background: theme.panel, color: theme.text, borderRadius: 999, padding: "7px 10px", fontWeight: 700, fontSize: 12 }}
          >
            <option value={NIGHT_MODE_OPTIONS.AUTO}>Night: Auto</option>
            <option value={NIGHT_MODE_OPTIONS.ON}>Night: Always on</option>
            <option value={NIGHT_MODE_OPTIONS.OFF}>Night: Always off</option>
          </select>
          <button
            type="button"
            onClick={() => palette.setOpen(true)}
            style={{ border: `1px solid ${theme.border}`, background: theme.panel, color: theme.text, borderRadius: 999, padding: "7px 12px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}
            title="Open command palette"
          >
            ⌘K
          </button>
        </div>
      </div>

      {showJournalTips ? (
        <div style={{ maxWidth: 1140, margin: "0 auto 10px", borderRadius: 12, border: `1px solid ${theme.border}`, background: nightMode ? "rgba(34,197,94,0.10)" : "rgba(26,110,54,0.08)", padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: theme.text, fontWeight: 700 }}>Tips:</span>
          <span style={{ fontSize: 12, color: theme.muted, flex: 1 }}>Use J/K to glide days, Cmd/Ctrl+S to save, and long-press an entry chip for quick actions.</span>
          <button
            onClick={() => {
              setShowJournalTips(false);
              markJournalTipsSeen(userId);
            }}
            style={{ border: `1px solid ${theme.border}`, background: "transparent", color: theme.muted, borderRadius: 8, padding: "4px 8px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div style={{ maxWidth: 1140, margin: "0 auto 12px", position: "relative", zIndex: 2 }}>
        <input
          type="search"
          placeholder="Search entries, tags, or phrases…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: "100%", padding: "10px 44px 10px 16px", borderRadius: 999, border: `1px solid ${theme.glassBorder}`, background: theme.glass, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", color: theme.text, fontSize: 14, outline: "none", boxSizing: "border-box", boxShadow: nightMode ? "0 2px 10px rgba(0,0,0,0.3)" : "0 2px 10px rgba(46,125,50,0.07)", transition: "box-shadow 0.2s ease" }}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: theme.muted, cursor: "pointer", fontWeight: 700, fontSize: 18, lineHeight: 1 }}>×</button>
        )}
      </div>

      <div className="hibi-journal-grid" style={{ maxWidth: 1140, margin: "0 auto", display: "grid", gridTemplateColumns: writeWithHibi ? "1fr" : `${sidebarWidth}px 10px 1fr`, gap: 14, alignItems: "start", position: "relative", zIndex: 2 }}>
        {!writeWithHibi && (
        <aside
          className="hibi-journal-sidebar"
          style={{
            background: theme.glass,
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            border: `1px solid ${theme.glassBorder}`,
            borderRadius: 18,
            padding: 14,
            minHeight: 320,
            boxShadow: nightMode ? "0 4px 20px rgba(0,0,0,0.4)" : "0 4px 16px rgba(46,125,50,0.08)",
          }}
        >
          <p className="hibi-sticky-sidebar-heading" style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: theme.muted }}>Reflection Timeline</p>

          <div style={{ display: "flex", gap: 4, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => { setStarFilter(false); setPinnedFilter(false); }}
              style={{ border: `1px solid ${theme.border}`, background: !starFilter && !pinnedFilter ? theme.accent : "transparent", color: !starFilter && !pinnedFilter ? "#fff" : theme.muted, borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >All</button>
            <button
              onClick={() => { setStarFilter(true); setPinnedFilter(false); }}
              style={{ border: `1px solid ${theme.border}`, background: starFilter ? theme.accent : "transparent", color: starFilter ? "#fff" : theme.muted, borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >★ Starred</button>
            <button
              onClick={() => { setPinnedFilter((v) => !v); setStarFilter(false); }}
              style={{ border: `1px solid ${theme.border}`, background: pinnedFilter ? theme.accent : "transparent", color: pinnedFilter ? "#fff" : theme.muted, borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >📌 Pinned</button>
          </div>

          {allTagsInMonth.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 8 }}>
              <button
                onClick={() => setTagFilter(null)}
                style={{ border: `1px solid ${theme.border}`, background: tagFilter === null ? (nightMode ? "rgba(255,255,255,0.10)" : "rgba(46,125,50,0.14)") : "transparent", color: theme.muted, borderRadius: 999, padding: "2px 7px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
              >
                All tags
              </button>
              {allTagsInMonth.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  style={{ border: `1px solid ${theme.border}`, background: tagFilter === tag ? theme.accent : "transparent", color: tagFilter === tag ? "#fff" : theme.muted, borderRadius: 999, padding: "2px 7px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          <div style={{ position: "relative", paddingLeft: 16 }}>
            {filteredJournaledDays.length > 1 ? (
              <div style={{ position: "absolute", left: 18, top: 10, bottom: 10, width: 1.5, background: nightMode ? "#353c46" : "#b9d2ba" }} />
            ) : null}

            <div className="hibi-journal-timeline-list" style={{ display: "grid", gap: 10 }}>
              {filteredJournaledDays.map((item) => {
                const mood = MOOD_TONES.find((m) => m.key === item.mood) || MOOD_TONES[1];
                const active = item.day === selectedDay;
                const isStarred = getEntriesForDate(dateKey(item.day)).some((e) => e.starred);
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
                      <span style={{ fontSize: 12, fontWeight: active ? 800 : 600 }}>{item.day}{isStarred ? " ★" : ""}</span>
                    </span>
                    <span style={{ fontSize: 11, color: theme.muted }}>{item.count}</span>
                  </button>
                );
              })}
              {!filteredJournaledDays.length ? (
                <p style={{ margin: 0, color: theme.muted, fontSize: 12 }}>{searchQuery.trim() ? "No entries match your search." : starFilter ? "No starred entries yet." : "Your timeline begins with your first saved entry."}</p>
              ) : null}
            </div>
          </div>

          {monthlyReflection.totalEntries > 0 && (
            <div className="hibi-sidebar-stats" style={{ marginTop: 12, borderTop: `1px solid ${theme.border}`, paddingTop: 10 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: theme.muted }}>This Month</p>
              <p style={{ margin: "0 0 3px", color: theme.text, fontSize: 12 }}>{monthlyReflection.totalEntries} {monthlyReflection.totalEntries === 1 ? "entry" : "entries"}</p>
              <p style={{ margin: "0 0 3px", color: theme.text, fontSize: 12 }}>~{monthlyReflection.totalWords} words</p>
              {monthlyReflection.topTags.length > 0 && (
                <p style={{ margin: 0, color: theme.muted, fontSize: 11 }}>{monthlyReflection.topTags.map((t) => `#${t}`).join(" · ")}</p>
              )}
            </div>
          )}

          <div className="hibi-sidebar-stats" style={{ marginTop: 10, borderTop: `1px solid ${theme.border}`, paddingTop: 8 }}>
            <div style={{ display: "flex", gap: 3 }}>
              {last7MoodDots.map(({ key, day, mood }) => {
                const m = MOOD_TONES.find((x) => x.key === mood);
                return (
                  <div
                    key={key}
                    title={mood ? `Day ${day}: ${mood}` : `Day ${day}: no entry`}
                    style={{ flex: 1, height: 8, borderRadius: 4, background: m ? m.color : (nightMode ? "#2b3139" : "#e8f0e8"), opacity: m ? 1 : 0.35 }}
                  />
                );
              })}
            </div>
          </div>

          {moodTimelinePoints.length >= 2 && (
            <div className="hibi-sidebar-stats" style={{ marginTop: 10, borderTop: `1px solid ${theme.border}`, paddingTop: 8 }}>
              <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: theme.muted }}>Mood Timeline · {monthNames[selectedMonth]}</p>
              <svg width="100%" height="38" viewBox={`0 0 ${daysInMonth} 10`} preserveAspectRatio="none" style={{ display: "block" }}>
                <polyline
                  fill="none"
                  stroke={nightMode ? "#4ade80" : "#1a6e36"}
                  strokeWidth="0.7"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={moodTimelinePoints
                    .map(({ day, value }) => `${((day - 1) / Math.max(daysInMonth - 1, 1)) * daysInMonth},${10 - (value / 5) * 8}`)
                    .join(" ")}
                />
                {moodTimelinePoints.map(({ day, value }) => (
                  <circle
                    key={day}
                    cx={((day - 1) / Math.max(daysInMonth - 1, 1)) * daysInMonth}
                    cy={10 - (value / 5) * 8}
                    r="0.9"
                    fill={nightMode ? "#4ade80" : "#1a6e36"}
                  />
                ))}
              </svg>
            </div>
          )}
        </aside>
        )}

        {!writeWithHibi ? (
          <div
            className="hibi-journal-sidebar-resizer"
            onMouseDown={() => { resizingSidebarRef.current = true; }}
            title="Drag to resize sidebar"
            style={{ width: 10, cursor: "col-resize", borderRadius: 999, background: nightMode ? "rgba(255,255,255,0.08)" : "rgba(46,125,50,0.14)", alignSelf: "stretch" }}
          />
        ) : null}

        <section
          className="hibi-journal-entry"
          style={{
            background: theme.glass,
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            border: `1px solid ${theme.glassBorder}`,
            borderRadius: 20,
            boxShadow: nightMode ? "0 8px 32px rgba(0,0,0,0.45)" : "0 8px 28px rgba(46,125,50,0.10)",
            padding: 20,
            transition: "all 0.25s ease",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8, position: "sticky", top: 0, zIndex: 3, background: theme.glass, backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", paddingBottom: 8 }}>
            <p style={{ margin: 0, color: theme.muted, fontWeight: 700, fontSize: 13 }}>{dateKey(selectedDay)}</p>
            <div style={{ display: "flex", gap: 6, position: "relative" }}>
              <button
                onClick={() => setTemplatePickerOpen((v) => !v)}
                aria-expanded={templatePickerOpen}
                aria-controls="journal-template-menu"
                style={{ border: `1px solid ${theme.border}`, background: theme.input, color: theme.text, borderRadius: 8, padding: "6px 10px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}
              >
                📋 Templates
              </button>
              <button
                onClick={beginNewEntry}
                style={{ border: `1px solid ${theme.border}`, background: theme.input, color: theme.text, borderRadius: 8, padding: "6px 10px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}
              >
                + New Entry
              </button>
              {templatePickerOpen && (
                <div
                  id="journal-template-menu"
                  role="menu"
                  aria-label="Journal templates"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    background: theme.panel,
                    border: `1px solid ${theme.glassBorder}`,
                    borderRadius: 14,
                    boxShadow: nightMode ? "0 8px 28px rgba(0,0,0,0.5)" : "0 8px 24px rgba(46,125,50,0.15)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    zIndex: 20,
                    minWidth: 220,
                    maxHeight: 350,
                    overflowY: "auto",
                    overflow: "hidden",
                  }}
                >
                  <p style={{ margin: 0, padding: "8px 14px 4px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: theme.muted }}>Built-in</p>
                  {TEMPLATES.map((tpl) => (
                    <button
                      role="menuitem"
                      aria-label={`Insert template ${tpl.label}`}
                      key={tpl.label}
                      onClick={() => {
                        setDraftEntry((prev) => ({ ...prev, text: tpl.text }));
                        setTemplatePickerOpen(false);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        border: "none",
                        borderBottom: `1px solid ${theme.glassBorder}`,
                        background: "transparent",
                        color: theme.text,
                        padding: "10px 14px",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {tpl.label}
                    </button>
                  ))}
                  {customTemplates.length > 0 && (
                    <>
                      <p style={{ margin: 0, padding: "8px 14px 4px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: theme.muted }}>Custom</p>
                      {customTemplates.map((tpl, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${theme.glassBorder}` }}>
                          <button
                            role="menuitem"
                            onClick={() => {
                              setDraftEntry((prev) => ({ ...prev, text: tpl.text }));
                              setTemplatePickerOpen(false);
                            }}
                            style={{
                              flex: 1,
                              textAlign: "left",
                              border: "none",
                              background: "transparent",
                              color: theme.text,
                              padding: "10px 14px",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {tpl.label}
                          </button>
                          <button
                            onClick={() => {
                              removeCustomTemplate(userId, i);
                              setCustomTemplates(readCustomTemplates(userId));
                            }}
                            style={{ border: "none", background: "transparent", color: nightMode ? "#fca5a5" : "#b91c1c", padding: "4px 10px", cursor: "pointer", fontSize: 12 }}
                            title="Remove template"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                  <div style={{ borderTop: `1px solid ${theme.glassBorder}`, padding: "8px 14px" }}>
                    {showSaveTemplate ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <input
                          value={newTemplateName}
                          onChange={(e) => setNewTemplateName(e.target.value)}
                          placeholder="Template name…"
                          style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.input, color: theme.text, fontSize: 12, outline: "none" }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && newTemplateName.trim() && draftEntry.text.trim()) {
                              addCustomTemplate(userId, newTemplateName.trim(), draftEntry.text);
                              setCustomTemplates(readCustomTemplates(userId));
                              setNewTemplateName("");
                              setShowSaveTemplate(false);
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            if (newTemplateName.trim() && draftEntry.text.trim()) {
                              addCustomTemplate(userId, newTemplateName.trim(), draftEntry.text);
                              setCustomTemplates(readCustomTemplates(userId));
                              setNewTemplateName("");
                              setShowSaveTemplate(false);
                            }
                          }}
                          style={{ border: "none", background: nightMode ? "#22c55e" : "#2e7d32", color: "#fff", padding: "6px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowSaveTemplate(true)}
                        style={{ border: "none", background: "transparent", color: theme.muted, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}
                      >
                        + Save current as template
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <p style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 600, color: theme.text }}>{prompt}</p>

          {/* Entry selector — shows preview text for each saved entry + "New" badge */}
          {entriesForSelectedDay.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: theme.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>Saved entries for this day</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {visibleEntriesForSelectedDay.map((entry, idx) => {
                  const active = entry.id === selectedEntryId;
                  const rawPreview = stripMarkdownPreview((entry.text || "").trim()).slice(0, 38) || "(no text)";
                  const preview = searchQuery.trim() ? highlightQueryInText(rawPreview, searchQuery) : rawPreview;
                  const isLong = (entry.text || "").length > 38;
                  return (
                    <button
                      key={entry.id}
                      onClick={() => selectExistingEntry(entry.id)}
                      onMouseDown={(e) => entryLongPress.onMouseDown(entry.id, e)}
                      onMouseUp={entryLongPress.onMouseUp}
                      onMouseLeave={entryLongPress.onMouseLeave}
                      onTouchStart={(e) => {
                        handleEntrySwipeStart(entry.id, e);
                        entryLongPress.onTouchStart(entry.id, e);
                      }}
                      onTouchEnd={(e) => {
                        handleEntrySwipeEnd(entry.id, e);
                        entryLongPress.onTouchEnd(e);
                      }}
                      title={`${entry.text || "(empty)"}\nMood: ${entry.mood || "neutral"}\n${entry.tags?.length ? `Tags: ${entry.tags.join(", ")}` : "No tags"}`}
                      style={{
                        border: `1.5px solid ${active ? theme.accent : theme.border}`,
                        background: active ? (nightMode ? "rgba(34,197,94,0.12)" : "rgba(26,110,54,0.08)") : theme.input,
                        color: active ? theme.accent : theme.text,
                        borderRadius: 10,
                        padding: "6px 10px",
                        fontSize: 12,
                        cursor: "pointer",
                        fontWeight: active ? 700 : 500,
                        maxWidth: 180,
                        textAlign: "left",
                        lineHeight: 1.3,
                        display: "flex",
                        flexDirection: "column",
                        gap: 1,
                        animation: reducedMotion ? "none" : "hibiSlideRight var(--hibi-motion-normal) var(--hibi-ease-enter) both",
                        animationDelay: `calc(${Math.min(idx, 7)} * var(--hibi-stagger-journal-step))`,
                        touchAction: "pan-y",
                      }}
                    >
                      <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6 }}>#{entriesForSelectedDay.length - idx}{entry.starred ? " ★" : ""}{pinnedEntries.has(entry.id) ? " 📌" : ""}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        {entry.photos?.[0] ? <Image src={mediaSrc(entry.photos[0])} alt="Entry thumb" width={16} height={16} unoptimized style={{ borderRadius: 4, objectFit: "cover", flexShrink: 0 }} /> : null}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}{isLong ? "…" : ""}</span>
                      </span>
                    </button>
                  );
                })}
                {!selectedEntryId && (
                  <span style={{ alignSelf: "center", fontSize: 11, fontWeight: 700, color: theme.accent, padding: "4px 8px", border: `1.5px solid ${theme.accent}`, borderRadius: 10, background: nightMode ? "rgba(34,197,94,0.08)" : "rgba(26,110,54,0.06)" }}>
                    ✏️ Writing new
                  </span>
                )}
              </div>
              {entriesForSelectedDay.length > visibleEntriesForSelectedDay.length ? (
                <button
                  onClick={() => setEntryChipRenderLimit((n) => n + 40)}
                  style={{ marginTop: 6, border: `1px solid ${theme.border}`, background: "transparent", color: theme.muted, borderRadius: 8, padding: "5px 9px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  Show {Math.min(40, entriesForSelectedDay.length - visibleEntriesForSelectedDay.length)} More
                </button>
              ) : null}
            </div>
          )}

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
            <button
              type="button"
              onClick={starCurrentEntry}
              title={draftEntry.starred ? "Unstar entry" : "Star entry"}
              style={{ ...toolbarBtn(theme), color: draftEntry.starred ? (nightMode ? "#f5c842" : "#c8910a") : theme.muted }}
            >
              {draftEntry.starred ? "★ Starred" : "☆ Star"}
            </button>
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
            <input
              type="text"
              value={customTagInput}
              onChange={(e) => setCustomTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customTagInput.trim()) {
                  insertTag(customTagInput.trim());
                  setCustomTagInput("");
                }
              }}
              placeholder="Custom tag…"
              aria-label="Custom tag"
              style={{ ...toolbarBtn(theme), width: 90, cursor: "text" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
              <span style={{ fontSize: 11, color: theme.muted }}>Goal</span>
              <input
                type="number"
                min={0}
                max={2000}
                value={wordGoal || ""}
                onChange={(e) => setWordGoal(Math.max(0, parseInt(e.target.value) || 0))}
                placeholder="words"
                style={{ width: 54, padding: "4px 6px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.input, color: theme.text, fontSize: 11 }}
              />
            </div>
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
              transition: "height var(--hibi-motion-fast) var(--hibi-ease-emphasized)",
              overflow: "hidden",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "6px 0 0", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: theme.muted, flexShrink: 0 }}>
              {draftEntry.text.trim() ? draftEntry.text.trim().split(/\s+/).length : 0} words · {draftEntry.text.length} chars
            </span>
            {syncStatus !== "idle" ? (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color:
                    syncStatus === "error"
                      ? (nightMode ? "#fca5a5" : "#b91c1c")
                      : syncStatus === "conflict"
                        ? (nightMode ? "#fda4af" : "#be123c")
                      : syncStatus === "retrying"
                        ? (nightMode ? "#f5c842" : "#c8910a")
                        : (nightMode ? "#86efac" : "#166534"),
                  flexShrink: 0,
                }}
              >
                {syncStatus === "syncing" ? "Syncing..." : syncStatus === "retrying" ? "Retrying..." : syncStatus === "synced" ? "Synced" : syncStatus === "conflict" ? "Sync conflict" : "Sync issue"}
              </span>
            ) : null}
            {unsavedChanges && (
              <span style={{ fontSize: 12, color: nightMode ? "#f5c842" : "#c8910a", fontWeight: 700, flexShrink: 0 }}>● Unsaved</span>
            )}
          </div>
          {(!isOnline || syncPending > 0 || syncStatus === "retrying" || syncStatus === "error" || syncStatus === "conflict") ? (
            <div
              role="status"
              aria-live="polite"
              style={{
                marginTop: 8,
                borderRadius: 10,
                border: `1px solid ${theme.border}`,
                background: nightMode ? "rgba(255,255,255,0.03)" : "rgba(46,125,50,0.04)",
                padding: "8px 10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 12, color: theme.text, fontWeight: 600 }}>
                {!isOnline
                  ? "Offline mode: keep writing. We will sync when you reconnect."
                  : syncStatus === "conflict"
                    ? "Conflict found. Resolve once and keep going."
                    : syncStatus === "error"
                      ? "Sync hit a snag. Local writing is safe."
                      : syncStatus === "retrying"
                        ? "Retrying sync in the background."
                        : `${syncPending} change${syncPending === 1 ? "" : "s"} queued for sync.`}
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {syncStatus === "conflict" && syncConflictDate ? (
                  <button
                    onClick={() => openConflictReview(syncConflictDate)}
                    style={{ border: `1px solid ${theme.border}`, background: theme.panel, color: theme.text, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  >
                    Resolve now
                  </button>
                ) : null}
                {(syncStatus === "retrying" || syncStatus === "error" || syncPending > 0) && isOnline ? (
                  <button
                    onClick={retrySyncNow}
                    style={{ border: "none", background: theme.accent, color: "#fff", borderRadius: 8, padding: "5px 8px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  >
                    Retry now
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {wordGoal > 0 && (() => {
            const wc = draftEntry.text.trim() ? draftEntry.text.trim().split(/\s+/).length : 0;
            const pct = Math.min(100, Math.round((wc / wordGoal) * 100));
            return (
              <div style={{ marginTop: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: theme.muted }}>Word goal</span>
                  <span style={{ fontSize: 11, color: theme.muted }}>{wc} / {wordGoal}</span>
                </div>
                <div style={{ height: 4, borderRadius: 999, background: nightMode ? "#2b3139" : "#dde8dd", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "#2e7d32" : theme.accent, borderRadius: 999, transition: "width 0.3s ease" }} />
                </div>
              </div>
            );
          })()}

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

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {selectedEntryId ? (
                deleteConfirm ? (
                  <>
                    <span style={{ fontSize: 12, color: nightMode ? "#fca5a5" : "#b91c1c", alignSelf: "center", fontWeight: 600 }}>Delete this entry?</span>
                    <button
                      onClick={deleteCurrentEntry}
                      style={{ border: `1px solid ${nightMode ? "rgba(255,80,80,0.50)" : "rgba(180,40,40,0.35)"}`, background: nightMode ? "rgba(255,80,80,0.15)" : "#fee2e2", color: nightMode ? "#fca5a5" : "#b91c1c", borderRadius: 8, padding: "8px 12px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}
                    >
                      Yes, Delete
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(false)}
                      style={{ border: `1px solid ${theme.border}`, background: "transparent", color: theme.muted, borderRadius: 8, padding: "8px 12px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={deleteCurrentEntry}
                    style={{ border: `1px solid ${nightMode ? "rgba(255,80,80,0.30)" : "rgba(180,40,40,0.20)"}`, background: nightMode ? "rgba(255,80,80,0.08)" : "#fff0f0", color: nightMode ? "#fca5a5" : "#b91c1c", borderRadius: 8, padding: "8px 12px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}
                  >
                    Delete Entry
                  </button>
                )
              ) : (
                <button
                  onClick={() => setDraftEntry(makeEmptyEntry())}
                  disabled={!draftEntry.text && !draftEntry.photos.length && !draftEntry.tags.length}
                  style={{ border: `1px solid ${theme.border}`, background: "transparent", color: theme.muted, borderRadius: 8, padding: "8px 12px", fontWeight: 600, cursor: "pointer", fontSize: 13, opacity: (!draftEntry.text && !draftEntry.photos.length && !draftEntry.tags.length) ? 0.4 : 1 }}
                >
                  Clear Draft
                </button>
              )}
              <button
                onClick={saveEntry}
                style={{
                  border: "none",
                  background: saveFlash ? (nightMode ? "#16a34a" : "#15803d") : theme.accent,
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  position: "relative",
                  transition: "background 0.2s ease",
                }}
              >
                {saveFlash ? "✓ Saved" : "Save Entry"}
                {unsavedChanges && !saveFlash ? <span style={{ position: "absolute", top: -4, right: -4, width: 8, height: 8, borderRadius: "50%", background: nightMode ? "#f5c842" : "#c8910a" }} /> : null}
              </button>
              {/* Share / Export entry */}
              <button
                onClick={async () => {
                  const md = exportEntryAsMarkdown(draftEntry, dateKey(selectedDay));
                  const ok = await copyToClipboard(md);
                  setShareStatus(ok ? "Copied!" : "Failed");
                  setTimeout(() => setShareStatus(""), 2000);
                }}
                title="Copy entry as Markdown"
                style={{
                  border: `1px solid ${theme.border}`,
                  background: theme.input,
                  color: theme.text,
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {shareStatus || "📋 Copy"}
              </button>
            </div>
          </div>

          {(draftEntry.photos || []).length ? (
            <div style={{ marginTop: 10, display: "flex", gap: 6, overflowX: "auto" }}>
              {draftEntry.photos.map((src, idx) => (
                <div key={`entry-photo-${idx}`} style={{ position: "relative" }}>
                  <Image src={mediaSrc(src)} alt={`Entry ${idx + 1}`} width={56} height={56} unoptimized style={{ borderRadius: 8, objectFit: "cover", border: `1px solid ${theme.border}` }} />
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

          <div style={{ marginTop: 12, padding: 10, borderRadius: 10, borderLeft: `3px solid ${nightMode ? "#5a7a5d" : "#81c784"}`, background: nightMode ? "#1d2229" : "#f0f8f0", paddingLeft: 13 }}>
            <p style={{ margin: 0, color: nightMode ? "#7aad7e" : "#2e7d32", fontWeight: 700, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase" }}>Hibi Note</p>
            <p style={{ margin: "6px 0 0", color: theme.text, fontStyle: "italic", fontSize: 14 }}>
              {draftEntry.hibiNote || "Write and save to receive a gentle Hibi reflection."}
            </p>
          </div>

          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: `1px solid ${theme.border}`, background: nightMode ? "#1a1f25" : "#fafcfa" }}>
            <p style={{ margin: 0, color: theme.muted, fontWeight: 700, fontSize: 12, opacity: 0.7 }}>Weekly Journal Summary</p>
            <p style={{ margin: "6px 0 0", color: theme.text, fontSize: 13 }}>{weeklySummary}</p>
          </div>
        </section>
      </div>

      <section
        style={{
          maxWidth: 1140,
          margin: "14px auto 0",
          background: theme.glass,
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: `1px solid ${theme.glassBorder}`,
          borderRadius: 18,
          padding: 14,
          position: "relative",
          zIndex: 2,
          boxShadow: nightMode ? "0 4px 20px rgba(0,0,0,0.35)" : "0 4px 16px rgba(46,125,50,0.07)",
        }}
      >
        <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: theme.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>Photo Memories</p>
        {calendarPhotoTiles.length ? (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            {calendarPhotoTiles.map((tile) => (
              <button
                key={`calendar-photo-${tile.day}`}
                onClick={() => setSelectedDay(tile.day)}
                style={{ border: selectedDay === tile.day ? `2px solid ${theme.accent}` : `1px solid ${theme.border}`, borderRadius: 8, background: "transparent", padding: 2, cursor: "pointer" }}
                title={dateKey(tile.day)}
              >
                <Image src={mediaSrc(tile.src)} alt={dateKey(tile.day)} width={44} height={44} unoptimized style={{ borderRadius: 6, objectFit: "cover" }} />
              </button>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, color: theme.muted, fontSize: 13 }}>Upload photos in Calendar to build your journal memory strip.</p>
        )}
      </section>

      <MobileActionBar
        className="hibi-mobile-action-bar"
        style={{ position: "fixed", left: 10, right: 10, bottom: 82, zIndex: 40, display: "none", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}
        actions={[
          {
            label: "New",
            ariaLabel: "Create a new journal entry",
            onClick: beginNewEntry,
            className: "hibi-intent-press",
            style: { border: `1px solid ${theme.border}`, background: theme.panel, color: theme.text, borderRadius: 12, padding: "9px 8px", fontSize: 12, fontWeight: 700 },
          },
          {
            label: "Save",
            ariaLabel: "Save current journal entry",
            onClick: () => saveEntryRef.current?.(),
            className: "hibi-intent-press",
            style: { border: "none", background: theme.accent, color: "#fff", borderRadius: 12, padding: "9px 8px", fontSize: 12, fontWeight: 700 },
          },
          {
            label: "Template",
            ariaLabel: "Toggle entry templates",
            onClick: () => setTemplatePickerOpen((v) => !v),
            className: "hibi-intent-press",
            style: { border: `1px solid ${theme.border}`, background: theme.panel, color: theme.text, borderRadius: 12, padding: "9px 8px", fontSize: 12, fontWeight: 700 },
          },
          {
            label: "Export",
            ariaLabel: "Export monthly journal markdown",
            onClick: exportEntries,
            className: "hibi-intent-press",
            style: { border: `1px solid ${theme.border}`, background: theme.panel, color: theme.text, borderRadius: 12, padding: "9px 8px", fontSize: 12, fontWeight: 700 },
          },
        ]}
      />

      {undoDelete ? (
        <div style={{ position: "fixed", left: "50%", bottom: 16, transform: "translateX(-50%)", zIndex: 60, background: nightMode ? "#1b2026" : "#ecf7ed", border: `1px solid ${theme.border}`, borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, boxShadow: nightMode ? "0 8px 22px rgba(0,0,0,0.4)" : "0 8px 22px rgba(46,125,50,0.15)" }}>
          <span style={{ color: theme.text, fontSize: 12 }}>Entry deleted.</span>
          <button onClick={undoDeleteEntry} style={{ border: "none", background: theme.accent, color: "#fff", borderRadius: 8, padding: "5px 10px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Undo</button>
          <button onClick={() => setUndoDelete(null)} style={{ border: "none", background: "transparent", color: theme.muted, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>×</button>
        </div>
      ) : null}

      {syncConflictDate ? (
        <div style={{ position: "fixed", left: "50%", bottom: 70, transform: "translateX(-50%)", zIndex: 65, background: nightMode ? "#2a1419" : "#fff1f2", border: `1px solid ${nightMode ? "#7f1d1d" : "#fecdd3"}`, borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, boxShadow: nightMode ? "0 8px 22px rgba(0,0,0,0.4)" : "0 8px 22px rgba(190,24,93,0.18)" }}>
          <span style={{ color: nightMode ? "#fecdd3" : "#9f1239", fontSize: 12 }}>Remote changes were newer for {syncConflictDate}. Refreshing day data is recommended.</span>
          <button onClick={() => openConflictReview(syncConflictDate)} style={{ border: "none", background: nightMode ? "#3f1d25" : "#ffe4e6", color: nightMode ? "#fecdd3" : "#9f1239", borderRadius: 8, padding: "5px 10px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Review</button>
          <button onClick={() => setSyncConflictDate(null)} style={{ border: "none", background: "transparent", color: theme.muted, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>×</button>
        </div>
      ) : null}

      {syncConflictReview.open ? (
        <div role="presentation" style={{ position: "fixed", inset: 0, zIndex: 75, background: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", padding: 16 }} onClick={closeConflictReview}>
          <div ref={conflictDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Resolve sync conflict" style={{ width: "min(96vw, 840px)", maxHeight: "85vh", overflowY: "auto", background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 14, display: "grid", gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <div>
              <p style={{ margin: 0, fontSize: 12, color: theme.muted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>Conflict Review</p>
              <p style={{ margin: "6px 0 0", color: theme.text, fontSize: 14 }}>Date: {syncConflictReview.date}</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setAllConflictChoices("local")} style={{ border: `1px solid ${theme.border}`, background: "transparent", color: theme.text, borderRadius: 8, padding: "5px 10px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Choose all local</button>
              <button onClick={() => setAllConflictChoices("merged")} style={{ border: `1px solid ${theme.border}`, background: "transparent", color: theme.text, borderRadius: 8, padding: "5px 10px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Choose all merged</button>
              <button onClick={() => setAllConflictChoices("remote")} style={{ border: `1px solid ${theme.border}`, background: "transparent", color: theme.text, borderRadius: 8, padding: "5px 10px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Choose all remote</button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {buildConflictRows(syncConflictReview.localEntries, syncConflictReview.remoteEntries, normalizeEntry).map((row, index) => {
                const local = row.local;
                const remote = row.remote;
                const currentChoice = syncConflictChoices[row.key] || "merged";
                const localText = String(local?.text || "").trim();
                const remoteText = String(remote?.text || "").trim();
                const textsDiffer = localText !== remoteText;
                const localUpdated = Number(local?.updatedAt) || 0;
                const remoteUpdated = Number(remote?.updatedAt) || 0;

                return (
                  <article key={`${row.key}-${index}`} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 10, background: nightMode ? "#141a20" : "#f9fdf9", display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <p style={{ margin: 0, color: theme.text, fontWeight: 700, fontSize: 12 }}>Entry {index + 1}</p>
                      <div role="radiogroup" aria-label={`Conflict choice for entry ${index + 1}`} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button onClick={() => setSyncConflictChoices((prev) => ({ ...prev, [row.key]: "local" }))} aria-pressed={currentChoice === "local"} style={{ border: `1px solid ${currentChoice === "local" ? theme.accent : theme.border}`, background: currentChoice === "local" ? (nightMode ? "rgba(34,197,94,0.18)" : "rgba(26,110,54,0.10)") : "transparent", color: theme.text, borderRadius: 8, padding: "4px 8px", fontWeight: 700, cursor: "pointer", fontSize: 11 }}>Local</button>
                        <button onClick={() => setSyncConflictChoices((prev) => ({ ...prev, [row.key]: "merged" }))} aria-pressed={currentChoice === "merged"} style={{ border: `1px solid ${currentChoice === "merged" ? theme.accent : theme.border}`, background: currentChoice === "merged" ? (nightMode ? "rgba(34,197,94,0.18)" : "rgba(26,110,54,0.10)") : "transparent", color: theme.text, borderRadius: 8, padding: "4px 8px", fontWeight: 700, cursor: "pointer", fontSize: 11 }}>Merged</button>
                        <button onClick={() => setSyncConflictChoices((prev) => ({ ...prev, [row.key]: "remote" }))} aria-pressed={currentChoice === "remote"} style={{ border: `1px solid ${currentChoice === "remote" ? theme.accent : theme.border}`, background: currentChoice === "remote" ? (nightMode ? "rgba(34,197,94,0.18)" : "rgba(26,110,54,0.10)") : "transparent", color: theme.text, borderRadius: 8, padding: "4px 8px", fontWeight: 700, cursor: "pointer", fontSize: 11 }}>Remote</button>
                      </div>
                    </div>

                    {textsDiffer ? <p style={{ margin: 0, color: nightMode ? "#fcd34d" : "#92400e", fontSize: 11, fontWeight: 700 }}>Text differs between local and remote.</p> : null}

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>
                      <section style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 8, background: nightMode ? "#0e141a" : "#ffffff" }}>
                        <p style={{ margin: 0, color: theme.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Local</p>
                        <p style={{ margin: "4px 0 0", color: theme.text, fontSize: 12, whiteSpace: "pre-wrap" }}>{localText || "No text"}</p>
                        <p style={{ margin: "6px 0 0", color: theme.muted, fontSize: 11 }}>Mood: {local?.mood || "—"} · Tags: {(local?.tags || []).join(", ") || "—"}</p>
                        <p style={{ margin: "2px 0 0", color: theme.muted, fontSize: 11 }}>Updated: {localUpdated ? new Date(localUpdated).toLocaleString() : "—"}</p>
                      </section>
                      <section style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 8, background: nightMode ? "#0e141a" : "#ffffff" }}>
                        <p style={{ margin: 0, color: theme.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Remote</p>
                        <p style={{ margin: "4px 0 0", color: theme.text, fontSize: 12, whiteSpace: "pre-wrap" }}>{remoteText || "No text"}</p>
                        <p style={{ margin: "6px 0 0", color: theme.muted, fontSize: 11 }}>Mood: {remote?.mood || "—"} · Tags: {(remote?.tags || []).join(", ") || "—"}</p>
                        <p style={{ margin: "2px 0 0", color: theme.muted, fontSize: 11 }}>Updated: {remoteUpdated ? new Date(remoteUpdated).toLocaleString() : "—"}</p>
                      </section>
                    </div>
                  </article>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button onClick={resolveConflictUseRemote} style={{ border: `1px solid ${theme.border}`, background: theme.panel, color: theme.text, borderRadius: 8, padding: "8px 10px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Use Remote</button>
              <button onClick={resolveConflictMerge} style={{ border: "none", background: nightMode ? "#164e63" : "#0369a1", color: "#fff", borderRadius: 8, padding: "8px 10px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Apply Selected Merge</button>
              <button onClick={resolveConflictUseLocal} style={{ border: "none", background: theme.accent, color: "#fff", borderRadius: 8, padding: "8px 10px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Keep Local</button>
              <button onClick={closeConflictReview} style={{ border: "none", background: "transparent", color: theme.muted, borderRadius: 8, padding: "8px 10px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      {entryContextMenu.open ? (
        <div
          role="presentation"
          style={{ position: "fixed", inset: 0, zIndex: 70 }}
          onClick={() => setEntryContextMenu({ open: false, x: 0, y: 0, entryId: null })}
        >
          <div
            ref={entryContextMenuRef}
            tabIndex={-1}
            role="menu"
            aria-label="Entry quick actions"
            style={{ position: "fixed", left: entryContextMenu.x, top: entryContextMenu.y, transform: "translate(-50%, -110%)", background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 6, display: "grid", gap: 4, minWidth: 160 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button role="menuitem" aria-label="Open selected entry" onClick={() => { if (entryContextMenu.entryId) selectExistingEntry(entryContextMenu.entryId); setEntryContextMenu({ open: false, x: 0, y: 0, entryId: null }); }} style={{ border: "none", background: "transparent", color: theme.text, textAlign: "left", padding: "6px 8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Open Entry</button>
            <button role="menuitem" aria-label="Delete selected entry" onClick={() => { if (entryContextMenu.entryId) deleteEntryById(entryContextMenu.entryId); setEntryContextMenu({ open: false, x: 0, y: 0, entryId: null }); }} style={{ border: "none", background: "transparent", color: nightMode ? "#fca5a5" : "#b91c1c", textAlign: "left", padding: "6px 8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Delete Entry</button>
          </div>
        </div>
      ) : null}

      <CommandPaletteDialog
        open={palette.open}
        onClose={() => palette.setOpen(false)}
        palette={palette}
        theme={theme}
        nightMode={nightMode}
        dialogLabel="Journal command palette"
        inputLabel="Search journal commands"
      />
      <LiveRegion message={liveMessage} politeness={syncStatus === "error" || syncStatus === "conflict" ? "assertive" : "polite"} />
    </main>
  );
}

function toolbarBtn(theme) {
  return {
    border: `1px solid ${theme.glassBorder}`,
    background: theme.glass,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    color: theme.text,
    borderRadius: 10,
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    transition: "all 0.16s ease",
  };
}
