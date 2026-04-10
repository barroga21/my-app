import { safeReadJSON, safeWriteJSON } from "../storageSchema";

const TEMPLATES_KEY = (userId) => `hibi_custom_templates_${userId}`;

export function readCustomTemplates(userId) {
  if (!userId) return [];
  const raw = safeReadJSON(TEMPLATES_KEY(userId), []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((t) => t && typeof t.label === "string" && typeof t.text === "string");
}

export function writeCustomTemplates(userId, templates) {
  if (!userId) return;
  safeWriteJSON(TEMPLATES_KEY(userId), templates || []);
}

export function addCustomTemplate(userId, label, text) {
  if (!userId || !label || !text) return;
  const existing = readCustomTemplates(userId);
  existing.push({ label, text, createdAt: Date.now() });
  writeCustomTemplates(userId, existing);
}

export function removeCustomTemplate(userId, index) {
  if (!userId) return;
  const existing = readCustomTemplates(userId);
  existing.splice(index, 1);
  writeCustomTemplates(userId, existing);
}
