/** ponytail: reminder roll-forward + tasks.status. Run: node scripts/task-features.check.js */
const assert = require('assert');
const { allPermissionKeys, createDefaultRoles, hasPermission } = require('../src/permissions');

const keys = allPermissionKeys();
assert.ok(keys.includes('tasks.status'), 'tasks.status in catalog');

const roles = createDefaultRoles();
const member = roles.find((r) => r.id === 'role-member');
assert.ok(member.permissions.includes('tasks.status'));
assert.ok(hasPermission({ roles }, { roleId: 'role-member' }, 'tasks.status'));

// Simulate roll-forward for incomplete task
function rollForward(atIso, nowMs) {
  const next = new Date(atIso);
  do {
    next.setDate(next.getDate() + 1);
  } while (next.getTime() <= nowMs);
  return next.toISOString();
}

const past = new Date(Date.now() - 3 * 86400000).toISOString();
const now = Date.now();
const next = rollForward(past, now);
assert.ok(new Date(next).getTime() > now, 'rolled reminder is in the future');

console.log('task-features.check.js OK');
