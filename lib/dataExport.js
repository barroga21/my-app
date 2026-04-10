import { safeReadJSON, sanitizeHabitChecksMap, sanitizeStringArray } from "./storageSchema";
import { habitChecksKey, journalYearKey, toYmd } from "./dateKeys";

/**
 * Export all user data as a structured JSON object.
 */
export function exportAllDataAsJSON(userId) {
  if (!userId) return null;

  const now = new Date();
  const data = {
    exportedAt: now.toISOString(),
    version: 1,
    userId,
    habits: {
      list: safeReadJSON(`habit_list_${userId}`, [], sanitizeStringArray),
      archived: safeReadJSON(`habit_archived_${userId}`, [], sanitizeStringArray),
      colors: safeReadJSON(`habit_colors_${userId}`, {}),
      checks: {},
      closeouts: {},
      notes: {},
    },
    journal: {},
    calendar: { notes: {}, rituals: {} },
    oneThing: {},
    preferences: {
      nightMode: localStorage.getItem(`hibi_night_mode_pref_${userId}`) || "auto",
      wordGoal: localStorage.getItem(`hibi_word_goal_${userId}`) || "0",
    },
  };

  // Export 2 years of habit checks, closeouts, notes
  for (let y = now.getFullYear() - 1; y <= now.getFullYear(); y++) {
    for (let m = 0; m < 12; m++) {
      const mk = `${y}_${String(m + 1).padStart(2, "0")}`;
      const checksKey = `habit_checks_${userId}_${mk}`;
      const closeoutsKey = `habit_closeouts_${userId}_${mk}`;
      const notesKey = `habit_notes_${userId}_${mk}`;
      const checks = safeReadJSON(checksKey, {}, sanitizeHabitChecksMap);
      const closeouts = safeReadJSON(closeoutsKey, {});
      const notes = safeReadJSON(notesKey, {});
      if (Object.keys(checks).length) data.habits.checks[mk] = checks;
      if (Object.keys(closeouts).length) data.habits.closeouts[mk] = closeouts;
      if (Object.keys(notes).length) data.habits.notes[mk] = notes;
    }
  }

  // Export journal entries
  for (let y = now.getFullYear() - 1; y <= now.getFullYear(); y++) {
    const entries = safeReadJSON(journalYearKey(userId, y), {});
    if (Object.keys(entries).length) data.journal[y] = entries;
  }

  // Export calendar notes/rituals
  for (let y = now.getFullYear() - 1; y <= now.getFullYear(); y++) {
    for (let m = 0; m < 12; m++) {
      const mk = `${userId}_${y}_${String(m + 1).padStart(2, "0")}`;
      const calNotes = safeReadJSON(`calendar_notes_${mk}`, {});
      const calRitual = safeReadJSON(`calendar_ritual_${mk}`, {});
      if (Object.keys(calNotes).length) data.calendar.notes[`${y}_${String(m + 1).padStart(2, "0")}`] = calNotes;
      if (Object.keys(calRitual).length) data.calendar.rituals[`${y}_${String(m + 1).padStart(2, "0")}`] = calRitual;
    }
  }

  // Export One Thing entries (last 90 days)
  for (let i = 0; i < 90; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dk = toYmd(d);
    const val = localStorage.getItem(`hibi_one_thing_${userId}_${dk}`);
    if (val) data.oneThing[dk] = val;
  }

  return data;
}

/**
 * Export all data as markdown text.
 */
export function exportAllDataAsMarkdown(userId) {
  const data = exportAllDataAsJSON(userId);
  if (!data) return "";

  let md = `# Hibi Export\n\nExported: ${data.exportedAt}\n\n`;

  // Habits
  md += `## Habits\n\n`;
  md += `### Active\n${data.habits.list.map((h) => `- ${h}`).join("\n") || "None"}\n\n`;
  md += `### Archived\n${data.habits.archived.map((h) => `- ${h}`).join("\n") || "None"}\n\n`;

  // Journal
  md += `## Journal Entries\n\n`;
  Object.entries(data.journal).forEach(([year, entries]) => {
    md += `### ${year}\n\n`;
    Object.entries(entries).sort().forEach(([date, dayEntries]) => {
      if (!Array.isArray(dayEntries)) return;
      dayEntries.forEach((entry) => {
        md += `#### ${date}`;
        if (entry.mood) md += ` (${entry.mood})`;
        if (entry.starred) md += ` ⭐`;
        md += `\n\n`;
        if (entry.tags?.length) md += `Tags: ${entry.tags.join(", ")}\n\n`;
        md += `${entry.text || "(empty)"}\n\n`;
        if (entry.hibiNote) md += `> Hibi note: ${entry.hibiNote}\n\n`;
        md += `---\n\n`;
      });
    });
  });

  // Calendar notes
  md += `## Calendar Notes\n\n`;
  Object.entries(data.calendar.notes).forEach(([key, notes]) => {
    Object.entries(notes).sort().forEach(([date, note]) => {
      if (note) md += `- **${date}**: ${note}\n`;
    });
  });

  // One Thing
  md += `\n## Daily Focus (One Thing)\n\n`;
  Object.entries(data.oneThing).sort().forEach(([date, val]) => {
    md += `- **${date}**: ${val}\n`;
  });

  return md;
}

/**
 * Trigger a file download in the browser.
 */
export function downloadFile(content, filename, mimeType = "application/json") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export a single journal entry as markdown.
 */
export function exportEntryAsMarkdown(entry, date) {
  let md = `# Journal Entry — ${date}\n\n`;
  if (entry.mood) md += `Mood: ${entry.mood}\n`;
  if (entry.starred) md += `⭐ Starred\n`;
  if (entry.tags?.length) md += `Tags: ${entry.tags.join(", ")}\n`;
  md += `\n${entry.text || "(empty)"}\n`;
  if (entry.hibiNote) md += `\n> Hibi note: ${entry.hibiNote}\n`;
  return md;
}

/**
 * Copy text to clipboard.
 */
export async function copyToClipboard(text) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}
