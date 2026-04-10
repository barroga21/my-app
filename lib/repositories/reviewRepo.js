import { safeReadJSON, sanitizeHabitChecksMap, sanitizeStringArray } from "../storageSchema";
import { habitChecksKey, journalYearKey, toYmd } from "../dateKeys";

/**
 * Compute weekly stats for a given end-date (defaults to today).
 */
export function computeWeeklyStats(userId, endDate = new Date()) {
  if (!userId) return null;
  const year = endDate.getFullYear();
  const habitListRaw = safeReadJSON(`habit_list_${userId}`, [], sanitizeStringArray);
  const journalData = safeReadJSON(journalYearKey(userId, year), {});

  let journalDays = 0;
  let habitDays = 0;
  let totalWords = 0;
  const moodCounts = {};
  const dailyMoods = [];
  const dailyHabitCounts = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const dk = toYmd(d);
    const dayEntries = journalData[dk];
    let dayWords = 0;

    if (Array.isArray(dayEntries) && dayEntries.length > 0) {
      journalDays++;
      dayEntries.forEach((e) => {
        const t = (e.text || "").trim();
        if (t) dayWords += t.split(/\s+/).length;
        if (e.mood) moodCounts[e.mood] = (moodCounts[e.mood] || 0) + 1;
      });
      const topMood = dayEntries.find((e) => e.mood)?.mood || "neutral";
      dailyMoods.push({ date: dk, mood: topMood });
    } else {
      dailyMoods.push({ date: dk, mood: null });
    }
    totalWords += dayWords;

    const m = d.getMonth();
    const y = d.getFullYear();
    const checksKey = habitChecksKey(userId, y, m);
    const checks = safeReadJSON(checksKey, {}, sanitizeHabitChecksMap);
    let dayDone = 0;
    habitListRaw.forEach((h) => {
      if (checks[`${h}-${d.getDate()}`] === "dot") dayDone++;
    });
    if (dayDone > 0) habitDays++;
    dailyHabitCounts.push({ date: dk, done: dayDone, total: habitListRaw.length });
  }

  return { journalDays, habitDays, totalWords, moodCounts, dailyMoods, dailyHabitCounts };
}

/**
 * Compute monthly stats for a given year/month.
 */
export function computeMonthlyStats(userId, year, month) {
  if (!userId) return null;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const habitListRaw = safeReadJSON(`habit_list_${userId}`, [], sanitizeStringArray);
  const checksKey = habitChecksKey(userId, year, month);
  const checks = safeReadJSON(checksKey, {}, sanitizeHabitChecksMap);
  const journalData = safeReadJSON(journalYearKey(userId, year), {});

  let habitActiveDays = 0;
  let journalEntries = 0;
  let totalWords = 0;
  let longestStreak = 0;
  let currentStreak = 0;
  const moodCounts = {};
  const tagCounts = {};
  const dailyCompletionRates = [];
  const habitBreakdown = {};

  habitListRaw.forEach((h) => { habitBreakdown[h] = 0; });

  for (let d = 1; d <= daysInMonth; d++) {
    const dk = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const entries = journalData[dk];
    let dayDone = 0;

    habitListRaw.forEach((h) => {
      if (checks[`${h}-${d}`] === "dot") {
        dayDone++;
        habitBreakdown[h] = (habitBreakdown[h] || 0) + 1;
      }
    });

    if (dayDone > 0) {
      habitActiveDays++;
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }

    dailyCompletionRates.push({
      day: d,
      rate: habitListRaw.length > 0 ? Math.round((dayDone / habitListRaw.length) * 100) : 0,
    });

    if (Array.isArray(entries)) {
      journalEntries += entries.length;
      entries.forEach((e) => {
        const t = (e.text || "").trim();
        if (t) totalWords += t.split(/\s+/).length;
        if (e.mood) moodCounts[e.mood] = (moodCounts[e.mood] || 0) + 1;
        if (Array.isArray(e.tags)) {
          e.tags.forEach((tag) => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; });
        }
      });
    }
  }

  const completionRate = daysInMonth > 0 ? Math.round((habitActiveDays / daysInMonth) * 100) : 0;

  return {
    daysInMonth,
    habitActiveDays,
    journalEntries,
    totalWords,
    completionRate,
    longestStreak,
    moodCounts,
    tagCounts,
    dailyCompletionRates,
    habitBreakdown,
    habitList: habitListRaw,
  };
}

/**
 * Get mood-habit correlations: which moods appear on high-habit vs low-habit days.
 */
export function computeMoodCorrelations(userId, year, month) {
  if (!userId) return null;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const habitListRaw = safeReadJSON(`habit_list_${userId}`, [], sanitizeStringArray);
  const checksKey = habitChecksKey(userId, year, month);
  const checks = safeReadJSON(checksKey, {}, sanitizeHabitChecksMap);
  const journalData = safeReadJSON(journalYearKey(userId, year), {});

  const highHabitMoods = {};
  const lowHabitMoods = {};
  const dayOfWeekMoods = {};

  for (let d = 1; d <= daysInMonth; d++) {
    const dk = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const date = new Date(year, month, d);
    const dow = date.toLocaleDateString("en-US", { weekday: "short" });
    const entries = journalData[dk];
    let dayDone = 0;

    habitListRaw.forEach((h) => {
      if (checks[`${h}-${d}`] === "dot") dayDone++;
    });

    const threshold = Math.max(1, Math.ceil(habitListRaw.length * 0.5));
    const moods = Array.isArray(entries) ? entries.map((e) => e.mood).filter(Boolean) : [];

    moods.forEach((mood) => {
      if (dayDone >= threshold) {
        highHabitMoods[mood] = (highHabitMoods[mood] || 0) + 1;
      } else {
        lowHabitMoods[mood] = (lowHabitMoods[mood] || 0) + 1;
      }
      if (!dayOfWeekMoods[dow]) dayOfWeekMoods[dow] = {};
      dayOfWeekMoods[dow][mood] = (dayOfWeekMoods[dow][mood] || 0) + 1;
    });
  }

  return { highHabitMoods, lowHabitMoods, dayOfWeekMoods };
}
