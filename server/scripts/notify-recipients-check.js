const { getTaskRecipientIds } = require('../src/notify');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const db = {
  roles: [
    { id: 'role-admin', name: 'Admin', permissions: [] },
    { id: 'role-member', name: 'Member', permissions: [] },
  ],
  users: [
    { id: 'admin-a', role: 'admin', roleId: 'role-admin' },
    { id: 'admin-b', role: 'admin', roleId: 'role-admin' },
    { id: 'member-1', role: 'user', roleId: 'role-member' },
    { id: 'admin-c', role: 'admin', roleId: 'role-admin' },
  ],
  tasks: [{ id: 'task-1', reporterId: 'admin-a' }],
  taskAssignees: [{ taskId: 'task-1', userId: 'admin-b' }],
  taskTeamAssignees: [{ taskId: 'task-1', teamId: 'team-1' }],
  teams: [{ id: 'team-1', createdBy: 'admin-a' }],
  teamMembers: [
    { teamId: 'team-1', userId: 'admin-a' },
    { teamId: 'team-1', userId: 'member-1' },
  ],
};

const ids = getTaskRecipientIds('task-1', db);
assert(ids.includes('admin-a'), 'reporter/admin A must be notified');
assert(ids.includes('admin-b'), 'assigned admin B must be notified');
assert(ids.includes('admin-c'), 'other admin must be notified when a team is assigned');
assert(ids.includes('member-1'), 'team member must be notified');

const peopleOnly = {
  ...db,
  taskAssignees: [{ taskId: 'task-2', userId: 'admin-b' }, { taskId: 'task-2', userId: 'member-1' }],
  taskTeamAssignees: [],
  tasks: [{ id: 'task-2', reporterId: 'admin-a' }],
};
const ids2 = getTaskRecipientIds('task-2', peopleOnly);
assert(ids2.includes('admin-a') && ids2.includes('admin-b') && ids2.includes('member-1'), 'people assignment keeps both admins');
assert(!ids2.includes('admin-c'), 'unassigned admin is not notified on people-only tasks');
console.log('notify-recipients-check ok', ids.join(','), '|', ids2.join(','));
