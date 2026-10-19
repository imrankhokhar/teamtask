/**
 * ponytail: self-check for ops-limit classification + pause/resume.
 * Run: node server/src/ops-limit.check.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  loadFromDisk,
  reportDbError,
  confirmPause,
  resumeOps,
  isOpsPaused,
  getStatus,
  classifyQuotaError,
} = require('./ops-limit');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-ops-'));
loadFromDisk(dir);

assert.strictEqual(classifyQuotaError('rows_read exceeded'), 'rows_read');
assert.strictEqual(classifyQuotaError('rows_written free tier'), 'rows_written');
assert.strictEqual(classifyQuotaError('database size / storage'), 'storage');
assert.ok(reportDbError(new Error('Cloudflare D1 error: exceeded rows_read limit')));
assert.strictEqual(getStatus().quotaHit, true);
assert.strictEqual(getStatus().opsPaused, false);

confirmPause();
assert.strictEqual(isOpsPaused(), true);
assert.ok(fs.existsSync(path.join(dir, 'ops-limit.json')));

resumeOps();
assert.strictEqual(isOpsPaused(), false);
assert.strictEqual(getStatus().quotaHit, false);

console.log('ops-limit.check.js: OK');
