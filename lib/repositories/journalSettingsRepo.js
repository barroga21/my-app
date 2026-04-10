import { safeReadJSON, safeWriteJSON } from "../storageSchema";

export function getJournalSidebarWidth(userId, fallback = 200) {
  if (!userId) return fallback;
  const raw = Number(localStorage.getItem(`hibi_journal_sidebar_width_${userId}`) || String(fallback));
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(170, Math.min(360, raw));
}

export function setJournalSidebarWidth(userId, value) {
  if (!userId) return;
  const clamped = Math.max(170, Math.min(360, Number(value) || 200));
  localStorage.setItem(`hibi_journal_sidebar_width_${userId}`, String(clamped));
}

export function hasSeenJournalTips(userId) {
  if (!userId) return true;
  return localStorage.getItem(`hibi_tip_seen_journal_${userId}`) === "1";
}

export function markJournalTipsSeen(userId) {
  if (!userId) return;
  localStorage.setItem(`hibi_tip_seen_journal_${userId}`, "1");
}

export function getJournalWordGoal(userId) {
  if (!userId) return 0;
  const raw = localStorage.getItem(`hibi_word_goal_${userId}`);
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function setJournalWordGoal(userId, value) {
  if (!userId) return;
  const normalized = Math.max(0, Number(value) || 0);
  localStorage.setItem(`hibi_word_goal_${userId}`, String(normalized));
}

export function readJournalYearMap(userId, year) {
  return safeReadJSON(`hibi_journal_${userId || "guest"}_${year}_all`, {});
}

export function writeJournalYearMap(userId, year, map) {
  safeWriteJSON(`hibi_journal_${userId || "guest"}_${year}_all`, map);
}
