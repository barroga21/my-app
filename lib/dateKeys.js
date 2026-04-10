export function toYmd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function yearMonthKey(year, monthIndex) {
  return `${year}_${String(monthIndex + 1).padStart(2, "0")}`;
}

export function habitChecksKey(userId, year, monthIndex) {
  return `habit_checks_${userId || "guest"}_${yearMonthKey(year, monthIndex)}`;
}

export function journalYearKey(userId, year) {
  return `hibi_journal_${userId || "guest"}_${year}_all`;
}

export function oneThingDailyKey(userId, date) {
  return `hibi_one_thing_${userId}_${toYmd(date)}`;
}
