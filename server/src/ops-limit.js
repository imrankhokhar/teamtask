/**
 * Cloudflare D1 free-tier limit detection + admin ops pause.
 *
 * Soft-stop at 90% of free-tier caps (before hard deny):
 *   rows read    4.5M / 5M
 *   rows written  90k / 100k
 *   storage      4.5 GB / 5 GB
 *
 * Daily read/write totals are summed from each D1 query's meta (UTC day).
 * Storage uses the latest size_after from D1 meta.
 * State is mirrored to a local JSON file so it survives restarts.
 */
const fs = require('fs');
const path = require('path');

const HARD = {
  rows_read: 5_000_000,
  rows_written: 100_000,
  storage: 5 * 1024 * 1024 * 1024,
};

/** Stop before hard cap so the app stays recoverable. */
const SOFT = {
  rows_read: 4_500_000,
  rows_written: 90_000,
  storage: 4.5 * 1024 * 1024 * 1024,
};

const KIND_LABELS = {
  rows_read: 'daily rows read (soft stop 4.5M of 5M)',
  rows_written: 'daily rows written (soft stop 90k of 100k)',
  storage: 'total storage (soft stop 4.5 GB of 5 GB)',
  quota: 'Cloudflare D1 free-tier quota',
};

/** @type {{
 *  quotaHit: boolean,
 *  kind: 'rows_read'|'rows_written'|'storage'|'quota'|null,
 *  message: string|null,
 *  at: string|null,
 *  opsPaused: boolean,
 *  pausedAt: string|null,
 *  usageDay: string|null,
 *  rowsRead: number,
 *  rowsWritten: number,
 *  storageBytes: number,
 * }} */
let state = blankState();

let dataDir = null;

function blankState() {
  return {
    quotaHit: false,
    kind: null,
    message: null,
    at: null,
    opsPaused: false,
    pausedAt: null,
    usageDay: utcDay(),
    rowsRead: 0,
    rowsWritten: 0,
    storageBytes: 0,
  };
}

function utcDay(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function filePath() {
  return path.join(dataDir || path.join(__dirname, '..', 'data'), 'ops-limit.json');
}

function ensureUsageDay() {
  const today = utcDay();
  if (state.usageDay === today) return;
  // New UTC day — reset daily counters; clear pause if it was a daily quota stop.
  const wasDaily =
    state.kind === 'rows_read' || state.kind === 'rows_written' || state.kind === 'quota';
  state.usageDay = today;
  state.rowsRead = 0;
  state.rowsWritten = 0;
  if (wasDaily && state.opsPaused) {
    state.opsPaused = false;
    state.pausedAt = null;
    state.quotaHit = false;
    state.kind = null;
    state.message = null;
    state.at = null;
  }
  // storage is not daily — keep storageBytes; re-check soft limit below if needed
  saveToDisk();
}

function loadFromDisk(dir) {
  dataDir = dir;
  try {
    const raw = fs.readFileSync(filePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      state = {
        ...blankState(),
        quotaHit: Boolean(parsed.quotaHit),
        kind: parsed.kind || null,
        message: parsed.message || null,
        at: parsed.at || null,
        opsPaused: Boolean(parsed.opsPaused),
        pausedAt: parsed.pausedAt || null,
        usageDay: parsed.usageDay || utcDay(),
        rowsRead: Number(parsed.rowsRead) || 0,
        rowsWritten: Number(parsed.rowsWritten) || 0,
        storageBytes: Number(parsed.storageBytes) || 0,
      };
    }
  } catch {
    // no file yet
  }
  ensureUsageDay();
  return getStatus();
}

function saveToDisk() {
  if (!dataDir) return;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(filePath(), JSON.stringify(state, null, 2));
  } catch (err) {
    console.warn('ops-limit: could not persist state:', err.message || err);
  }
}

function classifyQuotaError(err) {
  const msg = String(err && err.message ? err.message : err || '').toLowerCase();
  if (!msg) return null;
  if (/storage|database size|max size|5\s*gb|capacity|space/i.test(msg)) return 'storage';
  if (/rows_written|row write|write limit|writes exceeded|too many.*writ/i.test(msg)) {
    return 'rows_written';
  }
  if (/rows_read|row read|read limit|reads exceeded|too many.*read/i.test(msg)) {
    return 'rows_read';
  }
  if (/exceeded|10100|free tier|quota|too many/i.test(msg)) return 'quota';
  return null;
}

function triggerSoftStop(kind, detail) {
  const label = KIND_LABELS[kind] || KIND_LABELS.quota;
  state.quotaHit = true;
  state.kind = kind;
  state.message =
    detail ||
    `App data usage reached the safety limit (${label}). Operations are stopped to avoid hitting the hard D1 free-tier cap.`;
  state.at = new Date().toISOString();
  state.opsPaused = true;
  state.pausedAt = state.at;
  saveToDisk();
  console.error('[ops-limit]', state.message);
}

function checkSoftLimits() {
  ensureUsageDay();
  if (state.opsPaused) return state.kind;

  if (state.rowsRead >= SOFT.rows_read) {
    triggerSoftStop(
      'rows_read',
      `Rows read today reached ${state.rowsRead.toLocaleString()} (safety stop at 4.5M of 5M). Operations stopped.`
    );
    return 'rows_read';
  }
  if (state.rowsWritten >= SOFT.rows_written) {
    triggerSoftStop(
      'rows_written',
      `Rows written today reached ${state.rowsWritten.toLocaleString()} (safety stop at 90k of 100k). Operations stopped.`
    );
    return 'rows_written';
  }
  if (state.storageBytes >= SOFT.storage) {
    const gb = (state.storageBytes / (1024 * 1024 * 1024)).toFixed(2);
    triggerSoftStop(
      'storage',
      `Database storage reached ${gb} GB (safety stop at 4.5 GB of 5 GB). Operations stopped.`
    );
    return 'storage';
  }
  return null;
}

/**
 * Accumulate D1 query meta from Cloudflare responses.
 * @param {{ rowsRead?: number, rowsWritten?: number, sizeAfter?: number }} usage
 */
function recordD1Usage(usage = {}) {
  ensureUsageDay();
  const read = Math.max(0, Number(usage.rowsRead) || 0);
  const written = Math.max(0, Number(usage.rowsWritten) || 0);
  if (read) state.rowsRead += read;
  if (written) state.rowsWritten += written;
  if (usage.sizeAfter != null && Number(usage.sizeAfter) >= 0) {
    state.storageBytes = Number(usage.sizeAfter);
  }
  const hit = checkSoftLimits();
  if (!hit) saveToDisk();
  return hit;
}

function reportDbError(err) {
  const kind = classifyQuotaError(err);
  if (!kind) return false;
  // Hard error from Cloudflare — stop immediately (same as soft stop).
  triggerSoftStop(
    kind,
    `App data limit reached (${KIND_LABELS[kind] || KIND_LABELS.quota}). Operations stopped.`
  );
  return true;
}

function confirmPause() {
  ensureUsageDay();
  state.opsPaused = true;
  state.pausedAt = new Date().toISOString();
  if (!state.quotaHit) {
    state.quotaHit = true;
    state.kind = state.kind || 'quota';
    state.message =
      state.message ||
      'App data limit reached. Operations are stopped until an admin resumes them.';
    state.at = state.at || state.pausedAt;
  }
  saveToDisk();
  return getStatus();
}

function resumeOps() {
  ensureUsageDay();
  // Block resume if still over soft limits (except admin override after new day for daily meters).
  if (state.rowsRead >= SOFT.rows_read) {
    return {
      ...getStatus(),
      error: 'Cannot resume: rows read today still at/above 4.5M. Wait for midnight UTC reset.',
    };
  }
  if (state.rowsWritten >= SOFT.rows_written) {
    return {
      ...getStatus(),
      error: 'Cannot resume: rows written today still at/above 90k. Wait for midnight UTC reset.',
    };
  }
  if (state.storageBytes >= SOFT.storage) {
    return {
      ...getStatus(),
      error: 'Cannot resume: storage still at/above 4.5 GB. Free space in D1 first.',
    };
  }
  state.opsPaused = false;
  state.pausedAt = null;
  state.quotaHit = false;
  state.kind = null;
  state.message = null;
  state.at = null;
  saveToDisk();
  return getStatus();
}

function isOpsPaused() {
  ensureUsageDay();
  return Boolean(state.opsPaused);
}

function getStatus() {
  ensureUsageDay();
  return {
    quotaHit: Boolean(state.quotaHit),
    kind: state.kind,
    message: state.message,
    at: state.at,
    opsPaused: Boolean(state.opsPaused),
    pausedAt: state.pausedAt,
    kindLabel: state.kind ? KIND_LABELS[state.kind] || state.kind : null,
    usage: {
      day: state.usageDay,
      rowsRead: state.rowsRead,
      rowsWritten: state.rowsWritten,
      storageBytes: state.storageBytes,
      soft: { ...SOFT },
      hard: { ...HARD },
    },
  };
}

module.exports = {
  loadFromDisk,
  recordD1Usage,
  reportDbError,
  classifyQuotaError,
  confirmPause,
  resumeOps,
  isOpsPaused,
  getStatus,
  checkSoftLimits,
  KIND_LABELS,
  SOFT,
  HARD,
};
