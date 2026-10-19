/**
 * Cloudflare D1 free-tier limit detection + admin ops pause.
 * State is kept in-memory and mirrored to a local JSON file so it survives
 * restarts even when D1 itself cannot accept writes.
 */
const fs = require('fs');
const path = require('path');

/** @type {{
 *  quotaHit: boolean,
 *  kind: 'rows_read'|'rows_written'|'storage'|'quota'|null,
 *  message: string|null,
 *  at: string|null,
 *  opsPaused: boolean,
 *  pausedAt: string|null,
 * }} */
let state = {
  quotaHit: false,
  kind: null,
  message: null,
  at: null,
  opsPaused: false,
  pausedAt: null,
};

let dataDir = null;

const KIND_LABELS = {
  rows_read: 'daily rows read limit (5M)',
  rows_written: 'daily rows written limit (100k)',
  storage: 'total storage limit (5 GB)',
  quota: 'Cloudflare D1 free-tier quota',
};

function filePath() {
  return path.join(dataDir || path.join(__dirname, '..', 'data'), 'ops-limit.json');
}

function loadFromDisk(dir) {
  dataDir = dir;
  try {
    const raw = fs.readFileSync(filePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      state = {
        quotaHit: Boolean(parsed.quotaHit),
        kind: parsed.kind || null,
        message: parsed.message || null,
        at: parsed.at || null,
        opsPaused: Boolean(parsed.opsPaused),
        pausedAt: parsed.pausedAt || null,
      };
    }
  } catch {
    // no file yet
  }
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

function reportDbError(err) {
  const kind = classifyQuotaError(err);
  if (!kind) return false;
  const label = KIND_LABELS[kind] || KIND_LABELS.quota;
  state.quotaHit = true;
  state.kind = kind;
  state.message = `App data limit reached (${label}). Please stop today's operations.`;
  state.at = new Date().toISOString();
  saveToDisk();
  console.error('[ops-limit]', state.message);
  return true;
}

function confirmPause() {
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
  return Boolean(state.opsPaused);
}

function getStatus() {
  return {
    quotaHit: Boolean(state.quotaHit),
    kind: state.kind,
    message: state.message,
    at: state.at,
    opsPaused: Boolean(state.opsPaused),
    pausedAt: state.pausedAt,
    kindLabel: state.kind ? KIND_LABELS[state.kind] || state.kind : null,
  };
}

module.exports = {
  loadFromDisk,
  reportDbError,
  classifyQuotaError,
  confirmPause,
  resumeOps,
  isOpsPaused,
  getStatus,
  KIND_LABELS,
};
