import { safeReadJSON, safeWriteJSON, sanitizeHabitChecksMap, sanitizeStringArray } from "../storageSchema";
import { journalYearKey } from "../dateKeys";

function monthKey(userId, year, month) {
  return `${userId || "guest"}_${year}_${String(month + 1).padStart(2, "0")}`;
}

export function readCalendarNotes(userId, year, month) {
  return safeReadJSON(`calendar_notes_${monthKey(userId, year, month)}`, {});
}

export function writeCalendarNotes(userId, year, month, notes) {
  safeWriteJSON(`calendar_notes_${monthKey(userId, year, month)}`, notes || {});
}

export function readCalendarRitual(userId, year, month) {
  return safeReadJSON(`calendar_ritual_${monthKey(userId, year, month)}`, {});
}

export function writeCalendarRitual(userId, year, month, payload) {
  safeWriteJSON(`calendar_ritual_${monthKey(userId, year, month)}`, payload || {});
}

export function readCalendarHabitChecks(userId, year, month) {
  const primary = safeReadJSON(`habit_checks_${monthKey(userId, year, month)}`, {}, sanitizeHabitChecksMap);
  const backup = safeReadJSON(`hibi_habit_checks_backup_${monthKey(userId, year, month)}`, {}, sanitizeHabitChecksMap);
  return { ...backup, ...primary };
}

export function readCalendarHabitList(userId) {
  return sanitizeStringArray(safeReadJSON(`habit_list_${userId || "guest"}`, []));
}

export function readJournalMoodMap(userId, year) {
  return safeReadJSON(journalYearKey(userId, year), {});
}
