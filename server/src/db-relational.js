/**
 * Normalized relational storage — one row per record per module.
 * Used by SQLite, Cloudflare D1, and PostgreSQL backends.
 */

const { v4: uuid } = require('uuid');

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    permissions TEXT NOT NULL DEFAULT '[]'
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    role_id TEXT,
    push_token TEXT,
    avatar_url TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS team_members (
    team_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (team_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL,
    reporter_id TEXT,
    reminder_at TEXT,
    reminder_notified INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS task_reminders (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    at TEXT NOT NULL,
    notified INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS task_assignees (
    task_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (task_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS task_team_assignees (
    task_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    PRIMARY KEY (task_id, team_id)
  )`,
  `CREATE TABLE IF NOT EXISTS checklist_items (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    text TEXT NOT NULL,
    is_checked INTEGER DEFAULT 0,
    checked_by TEXT,
    checked_at TEXT,
    uncheck_reason TEXT,
    sort_order INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS checklist_replies (
    id TEXT PRIMARY KEY,
    checklist_item_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    task_id TEXT,
    type TEXT,
    title TEXT,
    body TEXT,
    read INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`,
  // Legacy blob table — kept for one-time migration from old installs
  `CREATE TABLE IF NOT EXISTS appstate (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
];

const SETTINGS_SCALAR_KEYS = [
  'ringtoneUrl',
  'ringtoneName',
  'notificationToneUrl',
  'notificationToneName',
  'alertToneUrl',
  'alertToneName',
  'reminderToneUrl',
  'reminderToneName',
  'appName',
  'logoUrl',
  'tagline',
];

function bool(v) {
  return v ? 1 : 0;
}

function fromBool(v) {
  return v === 1 || v === true || v === '1';
}

function rowToUser(r) {
  return {
    id: r.id,
    firstName: r.first_name || '',
    lastName: r.last_name || '',
    name: r.name,
    email: r.email,
    passwordHash: r.password_hash,
    role: r.role || 'user',
    roleId: r.role_id || null,
    pushToken: r.push_token || null,
    avatarUrl: r.avatar_url || null,
    createdAt: r.created_at,
  };
}

function rowToRole(r) {
  let permissions = [];
  try {
    permissions = JSON.parse(r.permissions || '[]');
  } catch {
    permissions = [];
  }
  return { id: r.id, name: r.name, permissions };
}

function rowToTask(r, reminders) {
  return {
    id: r.id,
    title: r.title,
    description: r.description || '',
    status: r.status,
    reporterId: r.reporter_id || null,
    reminders: reminders || [],
    reminderAt: r.reminder_at || null,
    reminderNotified: fromBool(r.reminder_notified),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function settingsFromRows(rows) {
  const settings = {};
  for (const r of rows) {
    if (r.key === 'emailTemplates' || r.key === 'smtp') {
      try {
        settings[r.key] = JSON.parse(r.value || '{}');
      } catch {
        settings[r.key] = {};
      }
    } else {
      settings[r.key] = r.value;
    }
  }
  return settings;
}

function settingsToRows(settings = {}) {
  const rows = [];
  for (const key of SETTINGS_SCALAR_KEYS) {
    if (settings[key] != null && settings[key] !== '') {
      rows.push({ key, value: String(settings[key]) });
    }
  }
  if (settings.emailTemplates) {
    rows.push({ key: 'emailTemplates', value: JSON.stringify(settings.emailTemplates) });
  }
  if (settings.smtp) {
    rows.push({ key: 'smtp', value: JSON.stringify(settings.smtp) });
  }
  return rows;
}

function createSqliteAdapter(sqliteDb) {
  return {
    async exec(sql) {
      sqliteDb.exec(sql);
    },
    async query(sql, params = []) {
      return sqliteDb.prepare(sql).all(...params);
    },
    async run(sql, params = []) {
      sqliteDb.prepare(sql).run(...params);
    },
    async batch(ops) {
      const tx = sqliteDb.transaction((statements) => {
        for (const op of statements) {
          sqliteDb.prepare(op.sql).run(...op.params);
        }
      });
      tx(ops);
    },
  };
}

function createD1Adapter(queryD1) {
  return {
    async exec(sql) {
      await queryD1(sql);
    },
    async query(sql, params = []) {
      return queryD1(sql, params);
    },
    async run(sql, params = []) {
      await queryD1(sql, params);
    },
    async batch(ops) {
      // Sequential: D1 HTTP has no multi-statement transaction across calls.
      for (const op of ops) {
        await queryD1(op.sql, op.params);
      }
    },
  };
}

function uniqByKey(rows, keyFn) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    if (!row) continue;
    const key = keyFn(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function createPgAdapter(pgPool) {
  function pgSql(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }
  return {
    async exec(sql) {
      await pgPool.query(pgSql(sql));
    },
    async query(sql, params = []) {
      const res = await pgPool.query(pgSql(sql), params);
      return res.rows;
    },
    async run(sql, params = []) {
      await pgPool.query(pgSql(sql), params);
    },
    async batch(ops) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        for (const op of ops) {
          // SQLite/D1 use INSERT OR REPLACE; Postgres uses plain INSERT after DELETE
          const raw = String(op.sql || '').replace(/^INSERT OR REPLACE/i, 'INSERT');
          await client.query(pgSql(raw), op.params);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

async function ensureSchema(adapter) {
  for (const sql of SCHEMA) {
    await adapter.exec(sql);
  }
}

async function countUsers(adapter) {
  const rows = await adapter.query('SELECT COUNT(*) AS c FROM users');
  const row = rows[0] || {};
  return Number(row.c || row.count || 0);
}

async function loadLegacyBlob(adapter, docId) {
  try {
    const rows = await adapter.query('SELECT data FROM appstate WHERE id = ?', [docId]);
    const row = rows[0];
    if (!row?.data) return null;
    const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    if (parsed && Array.isArray(parsed.users) && parsed.users.length) return parsed;
  } catch {
    // table may not exist yet
  }
  return null;
}

async function loadFromRelational(adapter) {
  const roles = (await adapter.query('SELECT * FROM roles')).map(rowToRole);
  const users = (await adapter.query('SELECT * FROM users')).map(rowToUser);
  const teams = (await adapter.query('SELECT * FROM teams')).map((r) => ({
    id: r.id,
    name: r.name,
    createdBy: r.created_by || null,
    createdAt: r.created_at,
  }));
  const teamMembers = (await adapter.query('SELECT * FROM team_members')).map((r) => ({
    teamId: r.team_id,
    userId: r.user_id,
  }));

  const reminderRows = await adapter.query('SELECT * FROM task_reminders');
  const remindersByTask = {};
  for (const r of reminderRows) {
    if (!remindersByTask[r.task_id]) remindersByTask[r.task_id] = [];
    remindersByTask[r.task_id].push({
      id: r.id,
      at: r.at,
      notified: fromBool(r.notified),
    });
  }

  const tasks = (await adapter.query('SELECT * FROM tasks')).map((r) =>
    rowToTask(r, remindersByTask[r.id] || [])
  );

  const taskAssignees = (await adapter.query('SELECT * FROM task_assignees')).map((r) => ({
    taskId: r.task_id,
    userId: r.user_id,
  }));
  const taskTeamAssignees = (await adapter.query('SELECT * FROM task_team_assignees')).map((r) => ({
    taskId: r.task_id,
    teamId: r.team_id,
  }));

  const checklistItems = (await adapter.query('SELECT * FROM checklist_items')).map((r) => ({
    id: r.id,
    taskId: r.task_id,
    text: r.text,
    isChecked: fromBool(r.is_checked),
    checkedBy: r.checked_by || null,
    checkedAt: r.checked_at || null,
    uncheckReason: r.uncheck_reason || null,
    sortOrder: r.sort_order || 0,
  }));

  const checklistReplies = (await adapter.query('SELECT * FROM checklist_replies')).map((r) => ({
    id: r.id,
    checklistItemId: r.checklist_item_id,
    userId: r.user_id,
    message: r.message,
    createdAt: r.created_at,
  }));

  const notifications = (await adapter.query('SELECT * FROM notifications')).map((r) => ({
    id: r.id,
    userId: r.user_id,
    taskId: r.task_id || null,
    type: r.type || null,
    title: r.title || '',
    body: r.body || '',
    read: fromBool(r.read),
    createdAt: r.created_at,
  }));

  const settings = settingsFromRows(await adapter.query('SELECT * FROM app_settings'));

  return {
    roles,
    users,
    teams,
    teamMembers,
    tasks,
    taskAssignees,
    taskTeamAssignees,
    checklistItems,
    checklistReplies,
    notifications,
    settings,
  };
}

/** @type {object|null} last successfully persisted in-memory snapshot */
let lastPersistedDb = null;

function cloneJson(value) {
  return JSON.stringify(value);
}

function normalizeDb(db) {
  return {
    roles: uniqByKey(db.roles, (x) => x.id),
    users: uniqByKey(db.users, (x) => x.id),
    teams: uniqByKey(db.teams, (x) => x.id),
    teamMembers: uniqByKey(db.teamMembers, (x) => `${x.teamId}|${x.userId}`),
    tasks: uniqByKey(db.tasks, (x) => x.id).map((t) => ({
      ...t,
      reminders: uniqByKey(t.reminders || [], (x) => x.id || `${t.id}|${x.at}`).map((r) => ({
        id: r.id || uuid(),
        at: r.at,
        notified: Boolean(r.notified),
      })),
    })),
    taskAssignees: uniqByKey(db.taskAssignees, (x) => `${x.taskId}|${x.userId}`),
    taskTeamAssignees: uniqByKey(db.taskTeamAssignees, (x) => `${x.taskId}|${x.teamId}`),
    checklistItems: uniqByKey(db.checklistItems, (x) => x.id),
    checklistReplies: uniqByKey(db.checklistReplies, (x) => x.id),
    notifications: uniqByKey(db.notifications, (x) => x.id),
    settings: db.settings || {},
  };
}

function diffByKey(prevList, nextList, keyFn) {
  const prevMap = new Map((prevList || []).map((row) => [keyFn(row), row]));
  const nextMap = new Map((nextList || []).map((row) => [keyFn(row), row]));
  const upserts = [];
  const deletes = [];
  for (const [key, row] of nextMap) {
    const old = prevMap.get(key);
    if (!old || cloneJson(old) !== cloneJson(row)) upserts.push(row);
  }
  for (const [key] of prevMap) {
    if (!nextMap.has(key)) deletes.push(key);
  }
  return { upserts, deletes };
}

function roleInsert(r) {
  return {
    sql: 'INSERT OR REPLACE INTO roles (id, name, permissions) VALUES (?, ?, ?)',
    params: [r.id, r.name, JSON.stringify(r.permissions || [])],
  };
}

function userInsert(u) {
  return {
    sql: `INSERT OR REPLACE INTO users (
      id, first_name, last_name, name, email, password_hash, role, role_id,
      push_token, avatar_url, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      u.id,
      u.firstName || '',
      u.lastName || '',
      u.name,
      u.email,
      u.passwordHash,
      u.role || 'user',
      u.roleId || null,
      u.pushToken || null,
      u.avatarUrl || null,
      u.createdAt,
    ],
  };
}

function teamInsert(t) {
  return {
    sql: 'INSERT OR REPLACE INTO teams (id, name, created_by, created_at) VALUES (?, ?, ?, ?)',
    params: [t.id, t.name, t.createdBy || null, t.createdAt],
  };
}

function taskInsert(t) {
  return {
    sql: `INSERT OR REPLACE INTO tasks (
      id, title, description, status, reporter_id, reminder_at, reminder_notified,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      t.id,
      t.title,
      t.description || '',
      t.status,
      t.reporterId || null,
      t.reminderAt || null,
      bool(t.reminderNotified),
      t.createdAt,
      t.updatedAt,
    ],
  };
}

function checklistInsert(c) {
  return {
    sql: `INSERT OR REPLACE INTO checklist_items (
      id, task_id, text, is_checked, checked_by, checked_at, uncheck_reason, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      c.id,
      c.taskId,
      c.text,
      bool(c.isChecked),
      c.checkedBy || null,
      c.checkedAt || null,
      c.uncheckReason || null,
      c.sortOrder || 0,
    ],
  };
}

function notificationInsert(n) {
  return {
    sql: 'INSERT OR REPLACE INTO notifications (id, user_id, task_id, type, title, body, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    params: [
      n.id,
      n.userId,
      n.taskId || null,
      n.type || null,
      n.title || '',
      n.body || '',
      bool(n.read),
      n.createdAt,
    ],
  };
}

/** Build SQL ops that touch only changed rows (never rewrite whole tables). */
function buildIncrementalOps(prevDb, nextDb) {
  const prev = normalizeDb(prevDb || {});
  const next = normalizeDb(nextDb || {});
  const ops = [];

  // Deletes first for child-ish rows, then upserts
  const roles = diffByKey(prev.roles, next.roles, (x) => x.id);
  for (const id of roles.deletes) ops.push({ sql: 'DELETE FROM roles WHERE id = ?', params: [id] });
  for (const r of roles.upserts) ops.push(roleInsert(r));

  const users = diffByKey(prev.users, next.users, (x) => x.id);
  for (const id of users.deletes) ops.push({ sql: 'DELETE FROM users WHERE id = ?', params: [id] });
  for (const u of users.upserts) ops.push(userInsert(u));

  const teams = diffByKey(prev.teams, next.teams, (x) => x.id);
  for (const id of teams.deletes) {
    ops.push({ sql: 'DELETE FROM team_members WHERE team_id = ?', params: [id] });
    ops.push({ sql: 'DELETE FROM teams WHERE id = ?', params: [id] });
  }
  for (const t of teams.upserts) ops.push(teamInsert(t));

  const teamMembers = diffByKey(prev.teamMembers, next.teamMembers, (x) => `${x.teamId}|${x.userId}`);
  for (const key of teamMembers.deletes) {
    const [teamId, userId] = key.split('|');
    ops.push({ sql: 'DELETE FROM team_members WHERE team_id = ? AND user_id = ?', params: [teamId, userId] });
  }
  for (const m of teamMembers.upserts) {
    ops.push({
      sql: 'INSERT OR REPLACE INTO team_members (team_id, user_id) VALUES (?, ?)',
      params: [m.teamId, m.userId],
    });
  }

  const tasks = diffByKey(prev.tasks, next.tasks, (x) => x.id);
  for (const id of tasks.deletes) {
    ops.push({ sql: 'DELETE FROM task_reminders WHERE task_id = ?', params: [id] });
    ops.push({ sql: 'DELETE FROM task_assignees WHERE task_id = ?', params: [id] });
    ops.push({ sql: 'DELETE FROM task_team_assignees WHERE task_id = ?', params: [id] });
    ops.push({ sql: 'DELETE FROM tasks WHERE id = ?', params: [id] });
  }
  for (const t of tasks.upserts) {
    ops.push(taskInsert(t));
    // Sync reminders for this task only
    ops.push({ sql: 'DELETE FROM task_reminders WHERE task_id = ?', params: [t.id] });
    for (const rem of t.reminders || []) {
      ops.push({
        sql: 'INSERT OR REPLACE INTO task_reminders (id, task_id, at, notified) VALUES (?, ?, ?, ?)',
        params: [rem.id || uuid(), t.id, rem.at, bool(rem.notified)],
      });
    }
  }

  const assignees = diffByKey(prev.taskAssignees, next.taskAssignees, (x) => `${x.taskId}|${x.userId}`);
  for (const key of assignees.deletes) {
    const [taskId, userId] = key.split('|');
    ops.push({ sql: 'DELETE FROM task_assignees WHERE task_id = ? AND user_id = ?', params: [taskId, userId] });
  }
  for (const a of assignees.upserts) {
    ops.push({
      sql: 'INSERT OR REPLACE INTO task_assignees (task_id, user_id) VALUES (?, ?)',
      params: [a.taskId, a.userId],
    });
  }

  const teamAssign = diffByKey(
    prev.taskTeamAssignees,
    next.taskTeamAssignees,
    (x) => `${x.taskId}|${x.teamId}`
  );
  for (const key of teamAssign.deletes) {
    const [taskId, teamId] = key.split('|');
    ops.push({
      sql: 'DELETE FROM task_team_assignees WHERE task_id = ? AND team_id = ?',
      params: [taskId, teamId],
    });
  }
  for (const a of teamAssign.upserts) {
    ops.push({
      sql: 'INSERT OR REPLACE INTO task_team_assignees (task_id, team_id) VALUES (?, ?)',
      params: [a.taskId, a.teamId],
    });
  }

  const checks = diffByKey(prev.checklistItems, next.checklistItems, (x) => x.id);
  for (const id of checks.deletes) {
    ops.push({ sql: 'DELETE FROM checklist_replies WHERE checklist_item_id = ?', params: [id] });
    ops.push({ sql: 'DELETE FROM checklist_items WHERE id = ?', params: [id] });
  }
  for (const c of checks.upserts) ops.push(checklistInsert(c));

  const replies = diffByKey(prev.checklistReplies, next.checklistReplies, (x) => x.id);
  for (const id of replies.deletes) {
    ops.push({ sql: 'DELETE FROM checklist_replies WHERE id = ?', params: [id] });
  }
  for (const r of replies.upserts) {
    ops.push({
      sql: 'INSERT OR REPLACE INTO checklist_replies (id, checklist_item_id, user_id, message, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [r.id, r.checklistItemId, r.userId, r.message, r.createdAt],
    });
  }

  const notes = diffByKey(prev.notifications, next.notifications, (x) => x.id);
  for (const id of notes.deletes) {
    ops.push({ sql: 'DELETE FROM notifications WHERE id = ?', params: [id] });
  }
  for (const n of notes.upserts) ops.push(notificationInsert(n));

  const prevSettings = settingsToRows(prev.settings);
  const nextSettings = settingsToRows(next.settings);
  const settingsDiff = diffByKey(prevSettings, nextSettings, (x) => x.key);
  for (const key of settingsDiff.deletes) {
    ops.push({ sql: 'DELETE FROM app_settings WHERE key = ?', params: [key] });
  }
  for (const s of settingsDiff.upserts) {
    ops.push({
      sql: 'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
      params: [s.key, s.value],
    });
  }

  return ops;
}

function buildFullReplaceOps(db) {
  const next = normalizeDb(db);
  const empty = normalizeDb({});
  // Diff against empty = insert every row once (migration / force)
  return [
    ...[
      'checklist_replies',
      'checklist_items',
      'notifications',
      'task_reminders',
      'task_assignees',
      'task_team_assignees',
      'tasks',
      'team_members',
      'teams',
      'users',
      'roles',
      'app_settings',
    ].map((t) => ({ sql: `DELETE FROM ${t}`, params: [] })),
    ...buildIncrementalOps(empty, next),
  ];
}

async function saveToRelational(adapter, db, { force = false } = {}) {
  const next = JSON.parse(JSON.stringify(normalizeDb(db)));
  let ops;
  if (force || !lastPersistedDb) {
    ops = buildFullReplaceOps(next);
  } else {
    ops = buildIncrementalOps(lastPersistedDb, next);
  }
  if (!ops.length) {
    lastPersistedDb = next;
    return { wrote: 0 };
  }
  await adapter.batch(ops);
  lastPersistedDb = next;
  return { wrote: ops.length };
}

function mergeLegacyIntoRelational(current, legacy) {
  if (!legacy) return { db: current, repaired: false };
  const out = { ...current };
  let repaired = false;

  if (!(out.tasks || []).length && (legacy.tasks || []).length) {
    out.tasks = legacy.tasks;
    out.taskAssignees = legacy.taskAssignees || [];
    out.taskTeamAssignees = legacy.taskTeamAssignees || [];
    repaired = true;
  }
  if (!(out.checklistItems || []).length && (legacy.checklistItems || []).length) {
    out.checklistItems = legacy.checklistItems;
    out.checklistReplies = legacy.checklistReplies || [];
    repaired = true;
  }
  if (!(out.teams || []).length && (legacy.teams || []).length) {
    out.teams = legacy.teams;
    out.teamMembers = legacy.teamMembers || [];
    repaired = true;
  }
  if (!(out.notifications || []).length && (legacy.notifications || []).length) {
    out.notifications = legacy.notifications;
    repaired = true;
  }
  if (!(out.roles || []).length && (legacy.roles || []).length) {
    out.roles = legacy.roles;
    repaired = true;
  }
  const curSettings = out.settings || {};
  const legSettings = legacy.settings || {};
  if (Object.keys(legSettings).length > Object.keys(curSettings).length) {
    out.settings = { ...curSettings, ...legSettings };
    repaired = true;
  }

  return { db: out, repaired };
}

async function countTable(adapter, table) {
  try {
    const rows = await adapter.query(`SELECT COUNT(*) AS c FROM ${table}`);
    const row = rows[0] || {};
    return Number(row.c || row.count || 0);
  } catch {
    return 0;
  }
}

async function initRelationalStore(adapter, { docId, createSeededDb, migrateDb }) {
  await ensureSchema(adapter);
  lastPersistedDb = null;

  let memoryDb;
  let needSave = false;
  const userCount = await countUsers(adapter);
  const taskCount = await countTable(adapter, 'tasks');
  const legacy = await loadLegacyBlob(adapter, docId);

  if (userCount > 0) {
    memoryDb = await loadFromRelational(adapter);
    const merged = mergeLegacyIntoRelational(memoryDb, legacy);
    if (merged.repaired) {
      memoryDb = merged.db;
      needSave = true;
      console.log('TeamTask: repaired relational tables from legacy appstate blob');
    }
  } else if (legacy) {
    memoryDb = legacy;
    needSave = true;
    console.log('TeamTask: migrated data from legacy appstate blob to relational tables');
  } else if (taskCount > 0) {
    memoryDb = await loadFromRelational(adapter);
  } else {
    memoryDb = createSeededDb();
    needSave = true;
  }

  if (migrateDb(memoryDb)) {
    needSave = true;
  }

  if (needSave) {
    const result = await saveToRelational(adapter, memoryDb, { force: true });
    console.log('TeamTask: relational save wrote', result.wrote, 'SQL statements');
  } else {
    lastPersistedDb = JSON.parse(JSON.stringify(normalizeDb(memoryDb)));
  }

  return memoryDb;
}

module.exports = {
  SCHEMA,
  createSqliteAdapter,
  createD1Adapter,
  createPgAdapter,
  ensureSchema,
  loadFromRelational,
  saveToRelational,
  initRelationalStore,
};
