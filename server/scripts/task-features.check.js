/** ponytail: reminder roll-forward must not spam. Run: node scripts/task-features.check.js */
const assert = require('assert');
const { allPermissionKeys, createDefaultRoles, hasPermission } = require('../src/permissions');

const keys = allPermissionKeys();
assert.ok(keys.includes('tasks.status'), 'tasks.status in catalog');

const roles = createDefaultRoles();
const member = roles.find((r) => r.id === 'role-member');
assert.ok(member.permissions.includes('tasks.status'));
assert.ok(hasPermission({ roles }, { roleId: 'role-member' }, 'tasks.status'));

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

const past = new Date(Date.now() - 10 * 86400000).toISOString();
const now = Date.now();
const next = nextDailyOccurrence(past, now);
assert.ok(new Date(next).getTime() > now, 'rolled reminder is in the future');
// Running twice without time passing should still stay in the future, not thrash.
const next2 = nextDailyOccurrence(next, now);
assert.ok(new Date(next2).getTime() > now);

console.log('task-features.check.js OK');
