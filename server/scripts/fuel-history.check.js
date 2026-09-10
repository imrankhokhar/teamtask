/** ponytail: fuel history permission + row shape. Run: node scripts/fuel-history.check.js */
const assert = require('assert');
const { allPermissionKeys, createDefaultRoles, hasPermission } = require('../src/permissions');

const keys = allPermissionKeys();
assert.ok(keys.includes('fuel.history'), 'fuel.history must be in catalog');
assert.ok(keys.includes('fuel.view'), 'fuel.view must be in catalog');

const roles = createDefaultRoles();
const admin = roles.find((r) => r.id === 'role-admin');
const member = roles.find((r) => r.id === 'role-member');
assert.ok(admin.permissions.includes('fuel.history'));
assert.ok(member.permissions.includes('fuel.history'));
assert.ok(hasPermission({ roles }, { roleId: 'role-admin' }, 'fuel.history'));
assert.ok(hasPermission({ roles }, { roleId: 'role-member' }, 'fuel.history'));

console.log('fuel-history.check.js OK');
