import { safeReadJSON, safeWriteJSON, sanitizeHabitChecksMap, sanitizeStringArray } from "../storageSchema";

function monthKey(userId, year, month) {
  return `${userId || "guest"}_${year}_${String(month + 1).padStart(2, "0")}`;
}

export function readMonthHabitChecks(userId, year, month) {
  const primary = safeReadJSON(`habit_checks_${monthKey(userId, year, month)}`, {}, sanitizeHabitChecksMap);
  const backup = safeReadJSON(`hibi_habit_checks_backup_${monthKey(userId, year, month)}`, {}, sanitizeHabitChecksMap);
  return { ...backup, ...primary };
}

export function writeMonthHabitChecks(userId, year, month, map) {
  safeWriteJSON(`habit_checks_${monthKey(userId, year, month)}`, map || {});
  safeWriteJSON(`hibi_habit_checks_backup_${monthKey(userId, year, month)}`, map || {});
}

export function readHabitColors(userId) {
  return safeReadJSON(`habit_colors_${userId || "guest"}`, {});
}

export function writeHabitColors(userId, map) {
  safeWriteJSON(`habit_colors_${userId || "guest"}`, map || {});
}

export function readVacationDays(userId) {
  const list = safeReadJSON(`hibi_vacation_${userId}`, []);
  return new Set(Array.isArray(list) ? list : []);
}

export function writeVacationDays(userId, daysSet) {
  safeWriteJSON(`hibi_vacation_${userId}`, [...(daysSet || new Set())]);
}

export function hasSeenHabitTips(userId) {
  if (!userId) return true;
  return safeReadJSON(`hibi_tip_seen_habits_${userId}`, null) === "1" ||
    localStorage.getItem(`hibi_tip_seen_habits_${userId}`) === "1";
}

export function markHabitTipsSeen(userId) {
  if (!userId) return;
  localStorage.setItem(`hibi_tip_seen_habits_${userId}`, "1");
}

export function readHabitCloseouts(userId, year, month) {
  return safeReadJSON(`habit_closeouts_${userId || "guest"}_${year}_${String(month + 1).padStart(2, "0")}`, {});
}

export function writeHabitCloseouts(userId, year, month, map) {
  safeWriteJSON(`habit_closeouts_${userId || "guest"}_${year}_${String(month + 1).padStart(2, "0")}`, map || {});
}

export function readHabitNotes(userId, year, month) {
  return safeReadJSON(`habit_notes_${userId || "guest"}_${year}_${String(month + 1).padStart(2, "0")}`, {});
}

export function writeHabitNotes(userId, year, month, map) {
  safeWriteJSON(`habit_notes_${userId || "guest"}_${year}_${String(month + 1).padStart(2, "0")}`, map || {});
}

export function readArchivedHabits(userId) {
  return sanitizeStringArray(safeReadJSON(`habit_archived_${userId || "guest"}`, []));
}
