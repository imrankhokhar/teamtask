/**
 * ponytail: self-check for soft-stop thresholds + pause/resume.
 * Run: node server/src/ops-limit.check.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  loadFromDisk,
  reportDbError,
  recordD1Usage,
  confirmPause,
  resumeOps,
  isOpsPaused,
  getStatus,
  classifyQuotaError,
  SOFT,
} = require('./ops-limit');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-ops-'));
loadFromDisk(dir);

assert.strictEqual(classifyQuotaError('rows_read exceeded'), 'rows_read');
assert.strictEqual(classifyQuotaError('rows_written free tier'), 'rows_written');
assert.strictEqual(classifyQuotaError('database size / storage'), 'storage');

// Soft stop on reads at 4.5M
recordD1Usage({ rowsRead: SOFT.rows_read });
assert.strictEqual(isOpsPaused(), true);
assert.strictEqual(getStatus().kind, 'rows_read');
assert.ok(getStatus().usage.rowsRead >= SOFT.rows_read);

// Resume blocked while still over soft limit
const blocked = resumeOps();
assert.ok(blocked.error);

// Simulate new counters under soft limit via disk rewrite
const file = path.join(dir, 'ops-limit.json');
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
raw.rowsRead = 100;
raw.rowsWritten = 10;
raw.storageBytes = 1000;
raw.opsPaused = true;
raw.quotaHit = true;
fs.writeFileSync(file, JSON.stringify(raw));
loadFromDisk(dir);
assert.strictEqual(isOpsPaused(), true);
const ok = resumeOps();
assert.ok(!ok.error);
assert.strictEqual(isOpsPaused(), false);

// Hard Cloudflare error still stops
reportDbError(new Error('Cloudflare D1 error: exceeded rows_written limit'));
assert.strictEqual(isOpsPaused(), true);

console.log('ops-limit.check.js: OK');
