/** ponytail: fire-on-due + next-day shift only. Run: node scripts/task-features.check.js */
const assert = require('assert');

function nextDailyOccurrence(fromIso, afterMs) {
  const day = 24 * 60 * 60 * 1000;
  let t = new Date(fromIso).getTime();
  if (Number.isNaN(t)) t = afterMs;
  if (t <= afterMs) {
    t += (Math.floor((afterMs - t) / day) + 1) * day;
  }
  while (t <= afterMs) t += day;
  return new Date(t).toISOString();
}

// Simulate original fire rule + shift
function processOne(rem, taskStatus, now) {
  if (!rem.at || rem.notified) return { fired: false, rem };
  const atMs = new Date(rem.at).getTime();
  if (atMs > now) return { fired: false, rem };
  const fired = true;
  if (taskStatus === 'completed') {
    rem.notified = true;
  } else {
    rem.at = nextDailyOccurrence(rem.at, now);
    rem.notified = false;
  }
  return { fired, rem };
}

const now = Date.now();
const dueAt = new Date(now - 1000).toISOString();

const a = processOne({ at: dueAt, notified: false }, 'in_progress', now);
assert.strictEqual(a.fired, true);
assert.strictEqual(a.rem.notified, false);
assert.ok(new Date(a.rem.at).getTime() > now);

const b = processOne({ ...a.rem }, 'in_progress', now);
assert.strictEqual(b.fired, false, 'must not fire again until next day');

const c = processOne({ at: dueAt, notified: false }, 'completed', now);
assert.strictEqual(c.fired, true);
assert.strictEqual(c.rem.notified, true);

console.log('task-features.check.js OK');
