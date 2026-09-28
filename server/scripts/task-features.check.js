/** ponytail: reminder fire rules + anti-spam. Run: node scripts/task-features.check.js */
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

const MIN_FIRE_GAP_MS = 20 * 60 * 60 * 1000;

function processOne(rem, taskStatus, now) {
  if (!rem.at || rem.notified) return { fired: false, rem };
  const atMs = new Date(rem.at).getTime();
  if (atMs > now) return { fired: false, rem };

  if (taskStatus === 'completed') {
    rem.notified = true;
    return { fired: false, rem };
  }

  const lastFired = rem.lastFiredAt ? new Date(rem.lastFiredAt).getTime() : 0;
  if (lastFired && now - lastFired < MIN_FIRE_GAP_MS) {
    rem.at = nextDailyOccurrence(rem.at, now);
    rem.notified = false;
    return { fired: false, rem };
  }

  rem.lastFiredAt = new Date(now).toISOString();
  rem.at = nextDailyOccurrence(rem.at, now);
  rem.notified = false;
  return { fired: true, rem };
}

const now = Date.now();
const dueAt = new Date(now - 1000).toISOString();

const open = processOne({ at: dueAt, notified: false }, 'in_progress', now);
assert.strictEqual(open.fired, true);

const spam = processOne({ ...open.rem, at: dueAt }, 'in_progress', now);
assert.strictEqual(spam.fired, false, 'must not re-fire within 20h');

const done = processOne({ at: dueAt, notified: false }, 'completed', now);
assert.strictEqual(done.fired, false);
assert.strictEqual(done.rem.at, dueAt);

console.log('task-features.check.js OK');
