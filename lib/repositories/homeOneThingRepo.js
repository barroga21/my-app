import { oneThingDailyKey } from "../dateKeys";

export function getOneThing(userId, date) {
  if (!userId) return "";
  const key = oneThingDailyKey(userId, date);
  return localStorage.getItem(key) || "";
}

export function setOneThing(userId, date, value) {
  if (!userId) return;
  const key = oneThingDailyKey(userId, date);
  localStorage.setItem(key, value);
}

export function clearOneThing(userId, date) {
  if (!userId) return;
  const key = oneThingDailyKey(userId, date);
  localStorage.removeItem(key);
}
