import { safeReadJSON, safeWriteJSON } from "../storageSchema";

const PREFS_KEY = (userId) => `hibi_notification_prefs_${userId}`;

const DEFAULT_PREFS = {
  enabled: false,
  journalReminder: true,
  journalTime: "20:00",
  habitReminder: true,
  habitTime: "09:00",
  streakProtection: true,
};

export function getNotificationPrefs(userId) {
  if (!userId) return { ...DEFAULT_PREFS };
  return { ...DEFAULT_PREFS, ...safeReadJSON(PREFS_KEY(userId), DEFAULT_PREFS) };
}

export function setNotificationPrefs(userId, prefs) {
  if (!userId) return;
  safeWriteJSON(PREFS_KEY(userId), { ...DEFAULT_PREFS, ...prefs });
}

/**
 * Request notification permission and register push if granted.
 */
export async function requestNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  const result = await Notification.requestPermission();
  return result;
}

/**
 * Schedule a local notification at a given time (uses setTimeout loop, not push server).
 */
export function scheduleLocalNotification(title, body, tag) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "HIBI_SHOW_NOTIFICATION",
      title,
      body,
      tag,
    });
  } else {
    new Notification(title, { body, tag, icon: "/icon.svg" });
  }
}

/**
 * Compute next reminder times and check if one should fire.
 */
export function checkReminders(userId) {
  const prefs = getNotificationPrefs(userId);
  if (!prefs.enabled) return [];

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const currentTime = `${hh}:${mm}`;
  const reminders = [];

  const firedKey = `hibi_notif_fired_${userId}_${now.toISOString().slice(0, 10)}`;
  const fired = safeReadJSON(firedKey, {});

  if (prefs.journalReminder && currentTime === prefs.journalTime && !fired.journal) {
    reminders.push({ type: "journal", title: "Hibi Journal", body: "Time to reflect. Your journal is ready." });
    fired.journal = true;
  }

  if (prefs.habitReminder && currentTime === prefs.habitTime && !fired.habit) {
    reminders.push({ type: "habit", title: "Hibi Habits", body: "Start your day with a habit check-in." });
    fired.habit = true;
  }

  if (prefs.streakProtection && hh === "21" && mm === "00" && !fired.streak) {
    reminders.push({ type: "streak", title: "Streak Check", body: "Your streak is at risk! Finish your habits before bed." });
    fired.streak = true;
  }

  if (reminders.length > 0) {
    safeWriteJSON(firedKey, fired);
  }

  return reminders;
}
