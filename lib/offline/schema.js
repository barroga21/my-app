const OFFLINE_DB_PREFIX = "hibi_offline_db_";
const LEGACY_QUEUE_PREFIX = "hibi_journal_sync_queue_";

const CURRENT_VERSION = 2;

function nowIso() {
  return new Date().toISOString();
}

function emptyDb(userId) {
  return {
    version: CURRENT_VERSION,
    userId,
    meta: {
      createdAt: nowIso(),
      migratedAt: nowIso(),
      lastSyncAt: null,
      migrationNotes: [],
    },
    journal: {
      byDate: {},
      conflictLedger: [],
    },
    sync: {
      queue: [],
      history: [],
      replay: [],
    },
    diagnostics: {
      lastWorkerState: "idle",
      lastWorkerError: null,
    },
  };
}

function keyFor(userId) {
  return `${OFFLINE_DB_PREFIX}${userId || "guest"}`;
}

function parseJson(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function migrateV1ToV2(db) {
  const next = {
    ...db,
    version: 2,
    sync: {
      queue: normalizeArray(db?.sync?.queue),
      history: normalizeArray(db?.sync?.history),
      replay: normalizeArray(db?.sync?.replay),
    },
    diagnostics: {
      lastWorkerState: db?.diagnostics?.lastWorkerState || "idle",
      lastWorkerError: db?.diagnostics?.lastWorkerError || null,
    },
  };

  next.meta = {
    ...normalizeObject(db?.meta),
    migratedAt: nowIso(),
    migrationNotes: [...normalizeArray(db?.meta?.migrationNotes), "migrated:v1->v2"],
  };

  return next;
}

function migrateToCurrent(db, userId) {
  if (!db || typeof db !== "object") {
    return emptyDb(userId);
  }

  let working = {
    ...emptyDb(userId),
    ...db,
    userId,
  };

  const originalVersion = Number(working.version) || 1;

  if (originalVersion < 2) {
    working = migrateV1ToV2(working);
  }

  working.version = CURRENT_VERSION;
  working.journal = {
    byDate: normalizeObject(working?.journal?.byDate),
    conflictLedger: normalizeArray(working?.journal?.conflictLedger),
  };
  working.sync = {
    queue: normalizeArray(working?.sync?.queue),
    history: normalizeArray(working?.sync?.history),
    replay: normalizeArray(working?.sync?.replay),
  };
  working.meta = {
    ...normalizeObject(working?.meta),
    migratedAt: nowIso(),
    migrationNotes: normalizeArray(working?.meta?.migrationNotes),
  };
  working.diagnostics = {
    lastWorkerState: working?.diagnostics?.lastWorkerState || "idle",
    lastWorkerError: working?.diagnostics?.lastWorkerError || null,
  };

  return working;
}

function importLegacyQueue(db, userId) {
  const legacyQueueKey = `${LEGACY_QUEUE_PREFIX}${userId}`;
  const legacyQueue = parseJson(localStorage.getItem(legacyQueueKey), []);
  if (!Array.isArray(legacyQueue) || !legacyQueue.length) {
    return db;
  }

  const importedQueue = legacyQueue.map((op, index) => ({
    id: op.id || `legacy-${Date.now()}-${index}`,
    type: "journal-day-upsert",
    status: "queued",
    createdAt: nowIso(),
    attempts: Number(op.retry) || 0,
    payload: {
      date: op.date,
      entries: Array.isArray(op.entries) ? op.entries : [],
      localUpdatedAt: Number(op.localUpdatedAt) || Date.now(),
      force: op.force === true,
    },
  }));

  return {
    ...db,
    sync: {
      ...db.sync,
      queue: db.sync.queue.length ? db.sync.queue : importedQueue,
      history: [
        ...db.sync.history,
        {
          id: `legacy-import-${Date.now()}`,
          type: "legacy-import",
          status: "ok",
          createdAt: nowIso(),
          payload: { importedCount: importedQueue.length },
        },
      ],
    },
    meta: {
      ...db.meta,
      migrationNotes: [...db.meta.migrationNotes, `legacy-queue-import:${importedQueue.length}`],
    },
  };
}

export function ensureOfflineStore(userId) {
  if (typeof localStorage === "undefined") return emptyDb(userId);
  const key = keyFor(userId);
  const raw = localStorage.getItem(key);
  const parsed = parseJson(raw, null);
  const migrated = migrateToCurrent(parsed, userId);
  const withLegacy = importLegacyQueue(migrated, userId);
  localStorage.setItem(key, JSON.stringify(withLegacy));
  return withLegacy;
}

export function readOfflineStore(userId) {
  if (typeof localStorage === "undefined") return emptyDb(userId);
  return ensureOfflineStore(userId);
}

export function writeOfflineStore(userId, nextStore) {
  if (typeof localStorage === "undefined") return false;
  const key = keyFor(userId);
  localStorage.setItem(key, JSON.stringify(migrateToCurrent(nextStore, userId)));
  return true;
}

export function updateOfflineStore(userId, updater) {
  const current = readOfflineStore(userId);
  const next = updater(current);
  writeOfflineStore(userId, next);
  return readOfflineStore(userId);
}

export function appendSyncHistory(userId, event) {
  return updateOfflineStore(userId, (store) => ({
    ...store,
    sync: {
      ...store.sync,
      history: [...store.sync.history.slice(-249), { ...event, createdAt: event.createdAt || nowIso() }],
    },
  }));
}

export function enqueueOfflineOp(userId, op) {
  return updateOfflineStore(userId, (store) => ({
    ...store,
    sync: {
      ...store.sync,
      queue: [...store.sync.queue, op],
    },
  }));
}

export function replaceQueue(userId, queue) {
  return updateOfflineStore(userId, (store) => ({
    ...store,
    sync: {
      ...store.sync,
      queue,
    },
  }));
}

export function setOfflineWorkerState(userId, state, error = null) {
  return updateOfflineStore(userId, (store) => ({
    ...store,
    diagnostics: {
      ...store.diagnostics,
      lastWorkerState: state,
      lastWorkerError: error,
    },
  }));
}

export function recordReplayRun(userId, payload) {
  return updateOfflineStore(userId, (store) => ({
    ...store,
    sync: {
      ...store.sync,
      replay: [...store.sync.replay.slice(-99), { createdAt: nowIso(), ...payload }],
    },
  }));
}

export const offlineSchema = {
  keyFor,
  CURRENT_VERSION,
};
