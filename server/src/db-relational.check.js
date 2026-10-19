/**
 * ponytail: self-check for row-level relational diffs (no test framework).
 * Run: node server/src/db-relational.check.js
 */
const assert = require('assert');
const {
  createSqliteAdapter,
  initRelationalStore,
  saveToRelational,
} = require('./db-relational');

function seed() {
  return {
    roles: [{ id: 'role-admin', name: 'Admin', permissions: ['tasks.view'] }],
    users: [
      {
        id: 'u1',
        firstName: 'A',
        lastName: 'One',
        name: 'A One',
        email: 'a@t.com',
        passwordHash: 'x',
        role: 'admin',
        roleId: 'role-admin',
        pushToken: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'u2',
        firstName: 'B',
        lastName: 'Two',
        name: 'B Two',
        email: 'b@t.com',
        passwordHash: 'y',
        role: 'user',
        roleId: 'role-admin',
        pushToken: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    teams: [],
    teamMembers: [],
    tasks: [
      {
        id: 't1',
        title: 'Task 1',
        description: '',
        status: 'pending',
        reporterId: 'u1',
        reminders: [],
        reminderAt: null,
        reminderNotified: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    taskAssignees: [{ taskId: 't1', userId: 'u2' }],
    taskTeamAssignees: [],
    checklistItems: [
      {
        id: 'c1',
        taskId: 't1',
        text: 'Point 1',
        isChecked: false,
        checkedBy: null,
        checkedAt: null,
        uncheckReason: null,
        sortOrder: 0,
      },
    ],
    checklistReplies: [],
    notifications: [],
    fuelCalHistory: [],
    announcements: [],
    settings: { appName: 'TeamTask' },
  };
}

async function main() {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  const adapter = createSqliteAdapter(db);

  const memory = await initRelationalStore(adapter, {
    docId: 'teamtask-main',
    createSeededDb: seed,
    migrateDb: () => false,
  });

  assert.strictEqual(db.prepare('SELECT COUNT(*) AS c FROM users').get().c, 2);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS c FROM tasks').get().c, 1);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS c FROM checklist_items').get().c, 1);

  // Edit one checklist row only — should not rewrite users table wholesale
  memory.checklistItems[0].text = 'Point 1 edited';
  memory.checklistItems[0].isChecked = true;
  const r1 = await saveToRelational(adapter, memory);
  assert.ok(r1.wrote > 0 && r1.wrote < 10, `expected few ops, got ${r1.wrote}`);
  assert.strictEqual(
    db.prepare('SELECT text FROM checklist_items WHERE id = ?').get('c1').text,
    'Point 1 edited'
  );
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS c FROM users').get().c, 2);

  // Add one user row
  memory.users.push({
    id: 'u3',
    firstName: 'C',
    lastName: 'Three',
    name: 'C Three',
    email: 'c@t.com',
    passwordHash: 'z',
    role: 'user',
    roleId: 'role-admin',
    pushToken: null,
    createdAt: '2026-01-02T00:00:00.000Z',
  });
  const r2 = await saveToRelational(adapter, memory);
  assert.ok(r2.wrote >= 1 && r2.wrote <= 3, `expected ~1 user insert, got ${r2.wrote}`);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS c FROM users').get().c, 3);

  // No-op save
  const r3 = await saveToRelational(adapter, memory);
  assert.strictEqual(r3.wrote, 0);

  // Notification cap: bloated table is wiped/pruned on init, load stays bounded
  const { pruneNotificationsTable, MAX_NOTIFICATIONS_KEPT, loadFromRelational } = require('./db-relational');
  const insert = db.prepare(
    `INSERT INTO notifications (id, user_id, task_id, type, title, body, read, created_at)
     VALUES (?, ?, NULL, 't', 'x', 'y', 0, ?)`
  );
  for (let i = 0; i < MAX_NOTIFICATIONS_KEPT * 5; i++) {
    insert.run(`n${i}`, 'u1', `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`);
  }
  assert.strictEqual(
    db.prepare('SELECT COUNT(*) AS c FROM notifications').get().c,
    MAX_NOTIFICATIONS_KEPT * 5
  );
  const pruned = await pruneNotificationsTable(adapter);
  assert.ok(pruned.deleted > 0);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS c FROM notifications').get().c, 0);
  const loaded = await loadFromRelational(adapter);
  assert.ok(loaded.notifications.length <= MAX_NOTIFICATIONS_KEPT);

  // Re-init must not wipe users/tasks when notifications were pruned (no full-replace after load).
  const memory2 = await initRelationalStore(adapter, {
    docId: 'teamtask-main',
    createSeededDb: seed,
    migrateDb: () => false,
  });
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS c FROM users').get().c, 3);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS c FROM tasks').get().c, 1);
  assert.ok(memory2.users.length >= 2);

  console.log('db-relational.check.js: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
