export const NIGHT_MODE_PREFERENCE_KEY = "hibi_night_mode_preference";

export const NIGHT_MODE_OPTIONS = {
  AUTO: "auto",
  ON: "on",
  OFF: "off",
};

export const AUTO_LIGHT_START_HOUR = 6;
export const AUTO_DARK_START_HOUR = 19;

export function getUserTimeZone() {
  if (typeof Intl === "undefined" || !Intl.DateTimeFormat) return "UTC";
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function getHourForTimeZone(date, timeZone) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone,
    });

    const hourPart = formatter
      .formatToParts(date)
      .find((part) => part.type === "hour");

    const hour = Number(hourPart?.value);
    if (Number.isFinite(hour)) return hour;
  } catch {
    // Fall back to browser local hour when time zone formatting fails.
  }

  return date.getHours();
}

export function isAutoNightTime(date = new Date(), timeZone = getUserTimeZone()) {
  const hour = getHourForTimeZone(date, timeZone);
  return hour >= AUTO_DARK_START_HOUR || hour < AUTO_LIGHT_START_HOUR;
}

export function getStoredNightModePreference() {
  if (typeof window === "undefined") return NIGHT_MODE_OPTIONS.AUTO;
  const value = window.localStorage.getItem(NIGHT_MODE_PREFERENCE_KEY);
  if (value === NIGHT_MODE_OPTIONS.ON || value === NIGHT_MODE_OPTIONS.OFF || value === NIGHT_MODE_OPTIONS.AUTO) {
    return value;
  }
  return NIGHT_MODE_OPTIONS.AUTO;
}

export function setStoredNightModePreference(preference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NIGHT_MODE_PREFERENCE_KEY, preference);
}

export function isNightModeEnabled(preference, date = new Date()) {
  if (preference === NIGHT_MODE_OPTIONS.ON) return true;
  if (preference === NIGHT_MODE_OPTIONS.OFF) return false;
  return isAutoNightTime(date);
}
