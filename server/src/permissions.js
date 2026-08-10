const MODULES = [
  { key: 'tasks', label: 'Tasks' },
  { key: 'teams', label: 'Teams' },
  { key: 'users', label: 'Users' },
  { key: 'roles', label: 'Roles & Permissions' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'fuel', label: 'Fuel Cal' },
  { key: 'settings', label: 'Settings' },
];

const ACTIONS = [
  { key: 'view', label: 'View' },
  { key: 'create', label: 'Create' },
  { key: 'edit', label: 'Edit' },
  { key: 'delete', label: 'Delete' },
];

function allPermissionKeys() {
  const keys = [];
  for (const m of MODULES) {
    for (const a of ACTIONS) keys.push(`${m.key}.${a.key}`);
  }
  // special: see all teams (not only assigned)
  keys.push('teams.view_all');
  return keys;
}

function createDefaultRoles() {
  const all = allPermissionKeys();
  return [
    {
      id: 'role-admin',
      name: 'Admin',
      description: 'Full access to all modules',
      isSystem: true,
      permissions: all,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'role-member',
      name: 'Member',
      description: 'Work on assigned tasks and own teams',
      isSystem: true,
      permissions: [
        'tasks.view',
        'tasks.create',
        'tasks.edit',
        'tasks.delete',
        'teams.view',
        'notifications.view',
        'fuel.view',
        'settings.view',
      ],
      createdAt: new Date().toISOString(),
    },
  ];
}

function getUserRole(db, user) {
  if (!user) return null;
  if (user.roleId) {
    const byId = (db.roles || []).find((r) => r.id === user.roleId);
    if (byId) return byId;
  }
  // legacy string role
  if (user.role === 'admin') {
    return (db.roles || []).find((r) => r.id === 'role-admin' || r.name === 'Admin');
  }
  return (db.roles || []).find((r) => r.id === 'role-member' || r.name === 'Member');
}

function userPermissions(db, user) {
  const role = getUserRole(db, user);
  return new Set(role?.permissions || []);
}

function hasPermission(db, user, perm) {
  const role = getUserRole(db, user);
  if (!role) return false;
  if (role.id === 'role-admin' || role.name === 'Admin') return true;
  return (role.permissions || []).includes(perm);
}

function isAdminUser(db, user) {
  const role = getUserRole(db, user);
  return Boolean(role && (role.id === 'role-admin' || role.name === 'Admin'));
}

module.exports = {
  MODULES,
  ACTIONS,
  allPermissionKeys,
  createDefaultRoles,
  getUserRole,
  userPermissions,
  hasPermission,
  isAdminUser,
};
