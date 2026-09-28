/** ponytail: completed = no notify / no shift; open = notify + next day. Run: node scripts/task-features.check.js */
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

function processOne(rem, taskStatus, now) {
  if (!rem.at || rem.notified) return { fired: false, rem };
  const atMs = new Date(rem.at).getTime();
  if (atMs > now) return { fired: false, rem };

  if (taskStatus === 'completed') {
    rem.notified = true;
    return { fired: false, rem };
  }

  const originalAt = rem.at;
  rem.at = nextDailyOccurrence(rem.at, now);
  rem.notified = false;
  return { fired: true, rem, originalAt };
}

const now = Date.now();
const dueAt = new Date(now - 1000).toISOString();

const open = processOne({ at: dueAt, notified: false }, 'in_progress', now);
assert.strictEqual(open.fired, true);
assert.strictEqual(open.rem.notified, false);
assert.ok(new Date(open.rem.at).getTime() > now);

const again = processOne({ ...open.rem }, 'in_progress', now);
assert.strictEqual(again.fired, false);

const done = processOne({ at: dueAt, notified: false }, 'completed', now);
assert.strictEqual(done.fired, false, 'completed must not notify');
assert.strictEqual(done.rem.notified, true);
assert.strictEqual(done.rem.at, dueAt, 'completed must not shift date');

console.log('task-features.check.js OK');
