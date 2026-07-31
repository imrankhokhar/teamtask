require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cron = require('node-cron');
const { WebSocketServer } = require('ws');
const { v4: uuid } = require('uuid');
const jwt = require('jsonwebtoken');

const { readDb, updateDb, initDb } = require('./db');
const { signToken, authRequired, adminRequired, requirePerm, JWT_SECRET } = require('./auth');
const {
  MODULES,
  ACTIONS,
  allPermissionKeys,
  getUserRole,
  hasPermission,
  isAdminUser,
} = require('./permissions');
const {
  registerSocket,
  notifyTaskUsers,
  getTaskRecipientIds,
  pushRealtime,
  sendTemplatedEmail,
} = require('./notify');
const {
  listTemplatesWithMeta,
  saveEmailTemplates,
  resetEmailTemplates,
  actorVars,
} = require('./templates');
const {
  getSmtpConfig,
  saveSmtpConfig,
  createEtherealTestAccount,
  sendMail,
  emailUsers,
  createTransport,
  normalizeSmtpSecure,
} = require('./mail');


const PORT = process.env.PORT || 4000;
const UPLOADS = process.env.TEAMTASK_UPLOADS_DIR
  || path.join(require('./db').DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

const TASK_STATUSES = [
  'ongoing',
  'ready',
  'in_progress',
  'pending',
  'completed',
  'reopen',
];

const storage = multer.diskStorage({
  destination: UPLOADS,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp3';
    cb(null, `ringtone-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okName = /\.(mp3|wav|m4a|ogg|caf|aac|mpeg)$/i.test(file.originalname || '');
    const okMime = /^audio\//i.test(file.mimetype || '');
    if (!okName && !okMime) {
      return cb(new Error('Audio files only'));
    }
    cb(null, true);
  },
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOADS));
app.use(express.static(path.join(__dirname, '..', 'public')));

function publicUser(u, db) {
  if (!u) return null;
  const store = db || readDb();
  const role = getUserRole(store, u);
  return {
    id: u.id,
    name: u.name,
    firstName: u.firstName || (u.name || '').split(' ')[0] || '',
    lastName: u.lastName || (u.name || '').split(' ').slice(1).join(' ') || '',
    email: u.email,
    role: role?.name === 'Admin' || u.role === 'admin' ? 'admin' : 'user',
    roleId: u.roleId || role?.id || null,
    roleName: role?.name || u.role || 'Member',
    permissions: role?.permissions || [],
    createdAt: u.createdAt,
  };
}

function ensureUserFromMember(db, { firstName, lastName, email, roleId }, createdBy) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return null;
  const memberRole =
    (db.roles || []).find((r) => r.id === roleId) ||
    (db.roles || []).find((r) => r.id === 'role-member') ||
    (db.roles || []).find((r) => r.name === 'Member');
  let user = db.users.find((u) => u.email.toLowerCase() === cleanEmail);
  if (user) {
    if (firstName) user.firstName = String(firstName).trim();
    if (lastName) user.lastName = String(lastName).trim();
    if (firstName || lastName) {
      user.name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name;
    }
    return user;
  }
  const fn = String(firstName || '').trim();
  const ln = String(lastName || '').trim();
  user = {
    id: uuid(),
    firstName: fn,
    lastName: ln,
    name: `${fn} ${ln}`.trim() || cleanEmail.split('@')[0],
    email: cleanEmail,
    passwordHash: bcrypt.hashSync('welcome123', 10),
    role: memberRole?.name === 'Admin' ? 'admin' : 'user',
    roleId: memberRole?.id || null,
    pushToken: null,
    createdAt: new Date().toISOString(),
    invitedBy: createdBy,
  };
  db.users.push(user);
  return user;
}

async function processDueReminders() {
  const now = Date.now();
  const due = [];
  updateDb((db) => {
    for (const task of db.tasks) {
      if (
        task.reminderAt &&
        !task.reminderNotified &&
        new Date(task.reminderAt).getTime() <= now
      ) {
        task.reminderNotified = true;
        due.push({ ...task });
      }
    }
  });
  for (const task of due) {
    await notifyTaskUsers(task.id, {
      type: 'reminder_due',
      title: 'Task reminder',
      body: `Reminder: "${task.title}"`,
      excludeUserId: null,
      emailVars: {
        taskTitle: task.title,
        reminderAt: new Date(task.reminderAt).toLocaleString(),
      },
    });
  }
  return due.length;
}

function enrichTask(db, task) {
  const assigneeIds = db.taskAssignees
    .filter((a) => a.taskId === task.id)
    .map((a) => a.userId);
  const teamIds = db.taskTeamAssignees
    .filter((a) => a.taskId === task.id)
    .map((a) => a.teamId);

  return {
    ...task,
    reporter: publicUser(db.users.find((u) => u.id === task.reporterId)),
    assignees: db.users.filter((u) => assigneeIds.includes(u.id)).map(publicUser),
    teams: db.teams.filter((t) => teamIds.includes(t.id)),
    checklist: db.checklistItems
      .filter((c) => c.taskId === task.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        ...item,
        replies: db.checklistReplies
          .filter((r) => r.checklistItemId === item.id)
          .map((r) => ({
            ...r,
            user: publicUser(db.users.find((u) => u.id === r.userId)),
          })),
      })),
  };
}

function userCanAccessTask(userId, taskId) {
  return getTaskRecipientIds(taskId).includes(userId);
}

function getVisibleTasksForUser(db, userId) {
  return db.tasks
    .filter((t) => getTaskRecipientIds(t.id).includes(userId))
    .map((t) => enrichTask(db, t))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

// ---------- Auth ----------
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, firstName, lastName, roleId } = req.body || {};
  const fn = String(firstName || '').trim();
  const ln = String(lastName || '').trim();
  const fullName = String(name || `${fn} ${ln}`).trim();
  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'name (or first/last), email, password required' });
  }
  const db = readDb();
  if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const memberRole =
    (db.roles || []).find((r) => r.id === roleId) ||
    (db.roles || []).find((r) => r.id === 'role-member');
  const adminRole = (db.roles || []).find((r) => r.id === 'role-admin');
  const assignedRole = db.users.length === 0 ? adminRole : memberRole;
  const user = {
    id: uuid(),
    firstName: fn || fullName.split(' ')[0] || '',
    lastName: ln || fullName.split(' ').slice(1).join(' ') || '',
    name: fullName,
    email: email.trim().toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 10),
    role: assignedRole?.name === 'Admin' ? 'admin' : 'user',
    roleId: assignedRole?.id || null,
    pushToken: null,
    createdAt: new Date().toISOString(),
  };
  updateDb((store) => store.users.push(user));
  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const db = readDb();
  const user = db.users.find(
    (u) => u.email.toLowerCase() === String(email || '').toLowerCase()
  );
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.json({ token: signToken(user), user: publicUser(user, db) });
});

app.get('/api/me', authRequired, (req, res) => {
  const db = readDb();
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    user: publicUser(user, db),
    settings: normalizeSettings(db.settings),
    modules: MODULES,
    actions: ACTIONS,
    permissionCatalog: allPermissionKeys(),
  });
});

app.post('/api/me/push-token', authRequired, (req, res) => {
  const { pushToken } = req.body || {};
  updateDb((db) => {
    const user = db.users.find((u) => u.id === req.user.id);
    if (user) user.pushToken = pushToken || null;
  });
  res.json({ ok: true });
});

// ---------- Users ----------
app.get('/api/users', authRequired, (req, res) => {
  const db = readDb();
  const canList =
    req.isAdmin ||
    hasPermission(db, req.user, 'users.view') ||
    hasPermission(db, req.user, 'teams.create') ||
    hasPermission(db, req.user, 'tasks.create');
  if (!canList) return res.status(403).json({ error: 'Missing permission: users.view' });
  const full = req.isAdmin || hasPermission(db, req.user, 'users.view');
  res.json({
    users: db.users.map((u) =>
      full
        ? publicUser(u, db)
        : {
            id: u.id,
            name: u.name,
            firstName: u.firstName,
            lastName: u.lastName,
            email: u.email,
            roleName: publicUser(u, db).roleName,
          }
    ),
  });
});

app.post('/api/users', authRequired, requirePerm('users.create'), (req, res) => {
  const { firstName, lastName, email, password, roleId } = req.body || {};
  const fn = String(firstName || '').trim();
  const ln = String(lastName || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!fn || !ln || !cleanEmail || !password) {
    return res.status(400).json({ error: 'firstName, lastName, email, password required' });
  }
  const db = readDb();
  if (db.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const role =
    (db.roles || []).find((r) => r.id === roleId) ||
    (db.roles || []).find((r) => r.id === 'role-member');
  const user = {
    id: uuid(),
    firstName: fn,
    lastName: ln,
    name: `${fn} ${ln}`.trim(),
    email: cleanEmail,
    passwordHash: bcrypt.hashSync(password, 10),
    role: role?.name === 'Admin' ? 'admin' : 'user',
    roleId: role?.id || null,
    pushToken: null,
    createdAt: new Date().toISOString(),
  };
  updateDb((store) => store.users.push(user));
  res.status(201).json({ user: publicUser(user) });
});

app.patch('/api/users/:id', authRequired, requirePerm('users.edit'), (req, res) => {
  const { firstName, lastName, email, password, roleId } = req.body || {};
  let updated = null;
  updateDb((db) => {
    const user = db.users.find((u) => u.id === req.params.id);
    if (!user) return;
    if (firstName != null) user.firstName = String(firstName).trim();
    if (lastName != null) user.lastName = String(lastName).trim();
    if (firstName != null || lastName != null) {
      user.name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    }
    if (email != null) user.email = String(email).trim().toLowerCase();
    if (password) user.passwordHash = bcrypt.hashSync(String(password), 10);
    if (roleId) {
      const role = (db.roles || []).find((r) => r.id === roleId);
      if (role) {
        user.roleId = role.id;
        user.role = role.name === 'Admin' ? 'admin' : 'user';
      }
    }
    updated = user;
  });
  if (!updated) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(updated) });
});

app.delete('/api/users/:id', authRequired, requirePerm('users.delete'), (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  updateDb((db) => {
    db.users = db.users.filter((u) => u.id !== req.params.id);
    db.teamMembers = db.teamMembers.filter((m) => m.userId !== req.params.id);
    db.taskAssignees = db.taskAssignees.filter((a) => a.userId !== req.params.id);
  });
  res.json({ ok: true });
});

// ---------- Roles ----------
app.get('/api/roles', authRequired, (req, res) => {
  const db = readDb();
  const full = req.isAdmin || hasPermission(db, req.user, 'roles.view');
  const canPick =
    full ||
    hasPermission(db, req.user, 'users.create') ||
    hasPermission(db, req.user, 'users.edit');
  if (!canPick) return res.status(403).json({ error: 'Missing permission: roles.view' });
  if (!full) {
    return res.json({
      roles: (db.roles || []).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
      })),
      modules: [],
      actions: [],
      permissionCatalog: [],
    });
  }
  res.json({
    roles: db.roles || [],
    modules: MODULES,
    actions: ACTIONS,
    permissionCatalog: allPermissionKeys(),
  });
});

app.post('/api/roles', authRequired, requirePerm('roles.create'), (req, res) => {
  const { name, description = '', permissions = [] } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const role = {
    id: uuid(),
    name: name.trim(),
    description: String(description || ''),
    isSystem: false,
    permissions: (permissions || []).filter((p) => allPermissionKeys().includes(p)),
    createdAt: new Date().toISOString(),
  };
  updateDb((db) => {
    db.roles = db.roles || [];
    db.roles.push(role);
  });
  res.status(201).json({ role });
});

app.patch('/api/roles/:id', authRequired, requirePerm('roles.edit'), (req, res) => {
  const { name, description, permissions } = req.body || {};
  let role = null;
  updateDb((db) => {
    role = (db.roles || []).find((r) => r.id === req.params.id);
    if (!role) return;
    if (name != null && !role.isSystem) role.name = String(name).trim();
    if (description != null) role.description = String(description);
    if (Array.isArray(permissions)) {
      role.permissions = permissions.filter((p) => allPermissionKeys().includes(p));
    }
  });
  if (!role) return res.status(404).json({ error: 'Role not found' });
  res.json({ role });
});

app.delete('/api/roles/:id', authRequired, requirePerm('roles.delete'), (req, res) => {
  const db0 = readDb();
  const role = (db0.roles || []).find((r) => r.id === req.params.id);
  if (!role) return res.status(404).json({ error: 'Role not found' });
  if (role.isSystem) return res.status(400).json({ error: 'Cannot delete system role' });
  if (db0.users.some((u) => u.roleId === role.id)) {
    return res.status(400).json({ error: 'Role is assigned to users' });
  }
  updateDb((db) => {
    db.roles = (db.roles || []).filter((r) => r.id !== req.params.id);
  });
  res.json({ ok: true });
});

// ---------- Teams ----------
app.post('/api/teams', authRequired, requirePerm('teams.create'), (req, res) => {
  const { name, memberIds = [], members = [] } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const team = {
    id: uuid(),
    name: name.trim(),
    createdBy: req.user.id,
    createdAt: new Date().toISOString(),
  };
  const createdMembers = [];
  updateDb((db) => {
    db.teams.push(team);
    const ids = new Set([req.user.id, ...memberIds]);

    (members || []).forEach((m) => {
      const user = ensureUserFromMember(db, m, req.user.id);
      if (user) {
        ids.add(user.id);
        createdMembers.push(publicUser(user, db));
      }
    });

    ids.forEach((userId) => {
      if (db.users.some((u) => u.id === userId)) {
        if (!db.teamMembers.some((x) => x.teamId === team.id && x.userId === userId)) {
          db.teamMembers.push({ teamId: team.id, userId });
        }
      }
    });
  });
  const db = readDb();
  const teamMembers = db.users.filter((u) =>
    db.teamMembers.some((m) => m.teamId === team.id && m.userId === u.id)
  );
  res.status(201).json({
    team: {
      ...team,
      members: teamMembers.map((u) => publicUser(u, db)),
    },
    createdMembers,
    note: createdMembers.length
      ? 'New members can sign in with their email and password welcome123'
      : undefined,
  });

  const actor = actorVars(req.user, db);
  for (const u of teamMembers) {
    if (u.id === req.user.id) continue;
    const isNew = createdMembers.some((c) => c.id === u.id);
    sendTemplatedEmail(u, isNew ? 'welcome_team' : 'team_added', {
      ...actor,
      teamName: team.name,
      email: u.email,
      tempPassword: 'welcome123',
    }).catch(() => undefined);
  }
});

app.post('/api/teams/:id/members', authRequired, requirePerm('teams.edit'), (req, res) => {
  const { userId, firstName, lastName, email } = req.body || {};
  const teamId = req.params.id;
  let member = null;
  updateDb((db) => {
    const team = db.teams.find((t) => t.id === teamId);
    if (!team) return;
    let uid = userId;
    if (!uid && email) {
      const user = ensureUserFromMember(db, { firstName, lastName, email }, req.user.id);
      if (user) {
        uid = user.id;
        member = publicUser(user);
      }
    }
    if (!uid || !db.users.some((u) => u.id === uid)) return;
    if (!db.teamMembers.some((m) => m.teamId === teamId && m.userId === uid)) {
      db.teamMembers.push({ teamId, userId: uid });
    }
    if (!member) member = publicUser(db.users.find((u) => u.id === uid));
  });
  if (!member) return res.status(400).json({ error: 'firstName, lastName, email required (or existing userId)' });
  res.json({ ok: true, member });
});

app.get('/api/teams', authRequired, requirePerm('teams.view'), (req, res) => {
  const db = readDb();
  const canSeeAll = req.isAdmin || hasPermission(db, req.user, 'teams.view_all');
  const teams = db.teams
    .filter((team) => {
      if (canSeeAll) return true;
      return db.teamMembers.some((m) => m.teamId === team.id && m.userId === req.user.id);
    })
    .map((team) => ({
      ...team,
      members: db.users
        .filter((u) =>
          db.teamMembers.some((m) => m.teamId === team.id && m.userId === u.id)
        )
        .map((u) => publicUser(u, db)),
    }));
  res.json({ teams });
});

app.patch('/api/teams/:id', authRequired, requirePerm('teams.edit'), async (req, res) => {
  const teamId = req.params.id;
  const { name, memberIds, members = [] } = req.body || {};
  const db0 = readDb();
  const existing = db0.teams.find((t) => t.id === teamId);
  if (!existing) return res.status(404).json({ error: 'Team not found' });
  const prevMemberIds = new Set(
    db0.teamMembers.filter((m) => m.teamId === teamId).map((m) => m.userId)
  );

  const invited = [];
  updateDb((db) => {
    const team = db.teams.find((t) => t.id === teamId);
    if (!team) return;
    if (name != null && String(name).trim()) team.name = String(name).trim();

    if (Array.isArray(memberIds) || (members && members.length)) {
      const ids = new Set(Array.isArray(memberIds) ? memberIds : db.teamMembers.filter((m) => m.teamId === teamId).map((m) => m.userId));
      (members || []).forEach((m) => {
        const user = ensureUserFromMember(db, m, req.user.id);
        if (user) {
          ids.add(user.id);
          invited.push(publicUser(user));
        }
      });
      db.teamMembers = db.teamMembers.filter((m) => m.teamId !== teamId);
      ids.forEach((userId) => {
        if (db.users.some((u) => u.id === userId)) {
          db.teamMembers.push({ teamId, userId });
        }
      });
    }
  });

  const db = readDb();
  const team = db.teams.find((t) => t.id === teamId);
  const actor = actorVars(req.user, db);
  const teamName = team?.name || existing.name;
  const newMemberIds = db.teamMembers
    .filter((m) => m.teamId === teamId)
    .map((m) => m.userId)
    .filter((id) => !prevMemberIds.has(id) && id !== req.user.id);

  for (const uid of newMemberIds) {
    const u = db.users.find((x) => x.id === uid);
    if (!u) continue;
    const isNew = invited.some((c) => c.id === u.id);
    await sendTemplatedEmail(u, isNew ? 'welcome_team' : 'team_added', {
      ...actor,
      teamName,
      email: u.email,
      tempPassword: 'welcome123',
    }).catch(() => undefined);
  }

  res.json({
    team: {
      ...team,
      members: db.users
        .filter((u) => db.teamMembers.some((m) => m.teamId === teamId && m.userId === u.id))
        .map((u) => publicUser(u, db)),
    },
  });
});

app.delete('/api/teams/:id', authRequired, requirePerm('teams.delete'), (req, res) => {
  const teamId = req.params.id;
  const db0 = readDb();
  if (!db0.teams.some((t) => t.id === teamId)) {
    return res.status(404).json({ error: 'Team not found' });
  }
  updateDb((db) => {
    db.teams = db.teams.filter((t) => t.id !== teamId);
    db.teamMembers = db.teamMembers.filter((m) => m.teamId !== teamId);
    db.taskTeamAssignees = db.taskTeamAssignees.filter((a) => a.teamId !== teamId);
  });
  res.json({ ok: true });
});

// ---------- Tasks ----------
app.get('/api/tasks', authRequired, requirePerm('tasks.view'), (req, res) => {
  const db = readDb();
  res.json({ tasks: getVisibleTasksForUser(db, req.user.id) });
});

app.get('/api/tasks/:id', authRequired, requirePerm('tasks.view'), (req, res) => {
  if (!userCanAccessTask(req.user.id, req.params.id) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not assigned to this task' });
  }
  const db = readDb();
  const task = db.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ task: enrichTask(db, task) });
});

app.post('/api/tasks', authRequired, requirePerm('tasks.create'), async (req, res) => {
  const {
    title,
    description = '',
    status = 'pending',
    assigneeIds = [],
    teamIds = [],
    checklist = [],
    reminderAt = null,
  } = req.body || {};

  if (!title) return res.status(400).json({ error: 'title required' });
  if (!TASK_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${TASK_STATUSES.join(', ')}` });
  }

  const now = new Date().toISOString();
  const task = {
    id: uuid(),
    title: title.trim(),
    description: String(description || ''),
    status,
    reporterId: req.user.id,
    reminderAt,
    reminderNotified: false,
    createdAt: now,
    updatedAt: now,
  };

  updateDb((db) => {
    db.tasks.push(task);
    [...new Set(assigneeIds)].forEach((userId) => {
      if (db.users.some((u) => u.id === userId)) {
        db.taskAssignees.push({ taskId: task.id, userId });
      }
    });
    [...new Set(teamIds)].forEach((teamId) => {
      if (db.teams.some((t) => t.id === teamId)) {
        db.taskTeamAssignees.push({ taskId: task.id, teamId });
      }
    });
    (checklist || []).forEach((text, i) => {
      if (!text || !String(text).trim()) return;
      db.checklistItems.push({
        id: uuid(),
        taskId: task.id,
        text: String(text).trim(),
        isChecked: false,
        checkedBy: null,
        checkedAt: null,
        uncheckReason: null,
        sortOrder: i,
      });
    });
  });

  try {
    // One notify on create — skip separate reminder_set (due reminders still fire later)
    await notifyTaskUsers(task.id, {
      type: 'task_assigned',
      title: 'New task assigned',
      body: `"${task.title}" was assigned to you`,
      excludeUserId: req.user.id,
      actorUserId: req.user.id,
      emailVars: { taskTitle: task.title },
    });

    if (reminderAt && new Date(reminderAt).getTime() <= Date.now()) {
      await processDueReminders();
    }
  } catch (err) {
    console.error('Notify after create failed:', err.message);
  }

  const db = readDb();
  res.status(201).json({ task: enrichTask(db, task) });
});

app.patch('/api/tasks/:id', authRequired, requirePerm('tasks.edit'), async (req, res) => {
  const taskId = req.params.id;
  if (!userCanAccessTask(req.user.id, taskId) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not assigned to this task' });
  }

  const db0 = readDb();
  const existing = db0.tasks.find((t) => t.id === taskId);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const {
    title,
    description,
    status,
    assigneeIds,
    teamIds,
    reminderAt,
  } = req.body || {};

  let statusChanged = false;
  let assigneesChanged = false;
  let reminderChanged = false;
  let newReminderAt = existing.reminderAt;

  updateDb((db) => {
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (title != null) task.title = String(title).trim();
    if (description != null) task.description = String(description);
    if (status != null) {
      if (!TASK_STATUSES.includes(status)) return;
      if (task.status !== status) {
        task.status = status;
        statusChanged = true;
      }
    }
    if (reminderAt !== undefined) {
      if (task.reminderAt !== reminderAt) {
        task.reminderAt = reminderAt;
        task.reminderNotified = false;
        reminderChanged = true;
        newReminderAt = reminderAt;
      }
    }
    if (Array.isArray(assigneeIds)) {
      db.taskAssignees = db.taskAssignees.filter((a) => a.taskId !== taskId);
      [...new Set(assigneeIds)].forEach((userId) => {
        if (db.users.some((u) => u.id === userId)) {
          db.taskAssignees.push({ taskId, userId });
        }
      });
      assigneesChanged = true;
    }
    if (Array.isArray(teamIds)) {
      db.taskTeamAssignees = db.taskTeamAssignees.filter((a) => a.taskId !== taskId);
      [...new Set(teamIds)].forEach((teamId) => {
        if (db.teams.some((t) => t.id === teamId)) {
          db.taskTeamAssignees.push({ taskId, teamId });
        }
      });
      assigneesChanged = true;
    }
    task.updatedAt = new Date().toISOString();
  });

  const db = readDb();
  const task = db.tasks.find((t) => t.id === taskId);

  if (statusChanged) {
    await notifyTaskUsers(taskId, {
      type: 'status_changed',
      title: 'Task status updated',
      body: `"${task.title}" is now ${task.status.replace('_', ' ')}`,
      excludeUserId: req.user.id,
      actorUserId: req.user.id,
      emailVars: {
        taskTitle: task.title,
        status: task.status.replace(/_/g, ' '),
      },
    });
  }
  if (assigneesChanged) {
    await notifyTaskUsers(taskId, {
      type: 'task_assigned',
      title: 'Task assignment updated',
      body: `Assignments updated for "${task.title}"`,
      excludeUserId: req.user.id,
      actorUserId: req.user.id,
      emailVars: { taskTitle: task.title },
    });
  }
  if (reminderChanged && newReminderAt) {
    await notifyTaskUsers(taskId, {
      type: 'reminder_set',
      title: 'Reminder scheduled',
      body: `Reminder for "${task.title}" set for ${new Date(newReminderAt).toLocaleString()}`,
      excludeUserId: null,
      actorUserId: req.user.id,
      emailVars: {
        taskTitle: task.title,
        reminderAt: new Date(newReminderAt).toLocaleString(),
      },
    });
    if (new Date(newReminderAt).getTime() <= Date.now()) {
      await processDueReminders();
    }
  }

  res.json({ task: enrichTask(readDb(), task) });
});

app.delete('/api/tasks/:id', authRequired, requirePerm('tasks.delete'), (req, res) => {
  const taskId = req.params.id;
  const db0 = readDb();
  const task = db0.tasks.find((t) => t.id === taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const can =
    task.reporterId === req.user.id ||
    req.user.role === 'admin' ||
    userCanAccessTask(req.user.id, taskId);
  if (!can) return res.status(403).json({ error: 'Not allowed to delete this task' });

  updateDb((db) => {
    const checklistIds = db.checklistItems.filter((c) => c.taskId === taskId).map((c) => c.id);
    db.tasks = db.tasks.filter((t) => t.id !== taskId);
    db.taskAssignees = db.taskAssignees.filter((a) => a.taskId !== taskId);
    db.taskTeamAssignees = db.taskTeamAssignees.filter((a) => a.taskId !== taskId);
    db.checklistItems = db.checklistItems.filter((c) => c.taskId !== taskId);
    db.checklistReplies = db.checklistReplies.filter((r) => !checklistIds.includes(r.checklistItemId));
    db.notifications = db.notifications.filter((n) => n.taskId !== taskId);
  });
  res.json({ ok: true });
});

// ---------- Checklist ----------
app.post('/api/tasks/:id/checklist', authRequired, (req, res) => {
  const taskId = req.params.id;
  if (!userCanAccessTask(req.user.id, taskId)) {
    return res.status(403).json({ error: 'Not assigned to this task' });
  }
  const { text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });

  let item;
  updateDb((db) => {
    const count = db.checklistItems.filter((c) => c.taskId === taskId).length;
    item = {
      id: uuid(),
      taskId,
      text: text.trim(),
      isChecked: false,
      checkedBy: null,
      checkedAt: null,
      uncheckReason: null,
      sortOrder: count,
    };
    db.checklistItems.push(item);
    const task = db.tasks.find((t) => t.id === taskId);
    if (task) task.updatedAt = new Date().toISOString();
  });
  res.status(201).json({ item });
});

app.patch('/api/checklist/:id/check', authRequired, async (req, res) => {
  const itemId = req.params.id;
  const db0 = readDb();
  const item0 = db0.checklistItems.find((c) => c.id === itemId);
  if (!item0) return res.status(404).json({ error: 'Checklist item not found' });
  if (!userCanAccessTask(req.user.id, item0.taskId)) {
    return res.status(403).json({ error: 'Not assigned to this task' });
  }

  let item;
  updateDb((db) => {
    item = db.checklistItems.find((c) => c.id === itemId);
    item.isChecked = true;
    item.checkedBy = req.user.id;
    item.checkedAt = new Date().toISOString();
    item.uncheckReason = null;
    const task = db.tasks.find((t) => t.id === item.taskId);
    if (task) task.updatedAt = new Date().toISOString();
  });

  const task = readDb().tasks.find((t) => t.id === item.taskId);
  await notifyTaskUsers(item.taskId, {
    type: 'checklist_checked',
    title: 'Checklist item completed',
    body: `${req.user.name} checked "${item.text}" on "${task.title}"`,
    excludeUserId: req.user.id,
    actorUserId: req.user.id,
    emailVars: {
      taskTitle: task.title,
      checklistItem: item.text,
    },
  });

  res.json({ item });
});

app.patch('/api/checklist/:id/uncheck', authRequired, async (req, res) => {
  const itemId = req.params.id;
  const { reason } = req.body || {};
  if (!reason?.trim()) {
    return res.status(400).json({ error: 'reason is required to uncheck' });
  }

  const db0 = readDb();
  const item0 = db0.checklistItems.find((c) => c.id === itemId);
  if (!item0) return res.status(404).json({ error: 'Checklist item not found' });
  if (!userCanAccessTask(req.user.id, item0.taskId)) {
    return res.status(403).json({ error: 'Not assigned to this task' });
  }

  let item;
  updateDb((db) => {
    item = db.checklistItems.find((c) => c.id === itemId);
    item.isChecked = false;
    item.checkedBy = null;
    item.checkedAt = null;
    item.uncheckReason = reason.trim();
    const task = db.tasks.find((t) => t.id === item.taskId);
    if (task) task.updatedAt = new Date().toISOString();
  });

  // Store reason also as a reply under the checklist point
  updateDb((db) => {
    db.checklistReplies.push({
      id: uuid(),
      checklistItemId: itemId,
      userId: req.user.id,
      message: `Unmarked: ${reason.trim()}`,
      createdAt: new Date().toISOString(),
    });
  });

  const task = readDb().tasks.find((t) => t.id === item.taskId);
  await notifyTaskUsers(item.taskId, {
    type: 'checklist_unchecked',
    title: 'Checklist item unmarked',
    body: `${req.user.name} unmarked "${item.text}" — ${reason.trim()}`,
    excludeUserId: req.user.id,
    actorUserId: req.user.id,
    emailVars: {
      taskTitle: task.title,
      checklistItem: item.text,
      reason: reason.trim(),
    },
  });

  res.json({ item });
});

app.post('/api/checklist/:id/replies', authRequired, async (req, res) => {
  const itemId = req.params.id;
  const { message } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'message required' });

  const db0 = readDb();
  const item0 = db0.checklistItems.find((c) => c.id === itemId);
  if (!item0) return res.status(404).json({ error: 'Checklist item not found' });
  if (!userCanAccessTask(req.user.id, item0.taskId)) {
    return res.status(403).json({ error: 'Not assigned to this task' });
  }

  const reply = {
    id: uuid(),
    checklistItemId: itemId,
    userId: req.user.id,
    message: message.trim(),
    createdAt: new Date().toISOString(),
  };
  updateDb((db) => db.checklistReplies.push(reply));

  const task = readDb().tasks.find((t) => t.id === item0.taskId);
  await notifyTaskUsers(item0.taskId, {
    type: 'checklist_reply',
    title: 'New checklist reply',
    body: `${req.user.name} replied on "${item0.text}" (${task.title})`,
    excludeUserId: req.user.id,
    actorUserId: req.user.id,
    emailVars: {
      taskTitle: task.title,
      checklistItem: item0.text,
      message: message.trim(),
    },
  });

  res.status(201).json({
    reply: {
      ...reply,
      user: publicUser(readDb().users.find((u) => u.id === req.user.id)),
    },
  });
});

// ---------- Notifications ----------
app.get('/api/notifications', authRequired, requirePerm('notifications.view'), (req, res) => {
  const db = readDb();
  const items = db.notifications
    .filter((n) => n.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ notifications: items });
});

app.post('/api/notifications/read-all', authRequired, (req, res) => {
  updateDb((db) => {
    db.notifications
      .filter((n) => n.userId === req.user.id)
      .forEach((n) => {
        n.read = true;
      });
  });
  res.json({ ok: true });
});

// ---------- Sounds / tones (stored locally on this device) ----------
function normalizeSettings(s = {}) {
  return {
    ringtoneUrl: s.ringtoneUrl || null,
    ringtoneName: s.ringtoneName || null,
    notificationToneUrl: s.notificationToneUrl || s.ringtoneUrl || null,
    notificationToneName: s.notificationToneName || s.ringtoneName || null,
    alertToneUrl: s.alertToneUrl || s.ringtoneUrl || null,
    alertToneName: s.alertToneName || s.ringtoneName || null,
    reminderToneUrl: s.reminderToneUrl || s.ringtoneUrl || null,
    reminderToneName: s.reminderToneName || s.ringtoneName || null,
  };
}

app.get('/api/settings', authRequired, requirePerm('settings.view'), (req, res) => {
  const db = readDb();
  res.json({ settings: normalizeSettings(db.settings) });
});

app.get('/api/storage-info', authRequired, (_req, res) => {
  res.json({
    local: true,
    dataDir: require('./db').DATA_DIR,
    dbPath: require('./db').DB_PATH,
    uploadsDir: UPLOADS,
    note: 'All tasks, teams, alerts and tones are saved on this device only (no paid cloud).',
  });
});

const TONE_FIELDS = {
  notification: { url: 'notificationToneUrl', name: 'notificationToneName' },
  alert: { url: 'alertToneUrl', name: 'alertToneName' },
  reminder: { url: 'reminderToneUrl', name: 'reminderToneName' },
  default: { url: 'ringtoneUrl', name: 'ringtoneName' },
};

app.post(
  '/api/tones/:kind',
  authRequired,
  upload.single('ringtone'),
  async (req, res) => {
    const kind = String(req.params.kind || 'default').toLowerCase();
    const fields = TONE_FIELDS[kind] || TONE_FIELDS.default;
    if (!req.file) return res.status(400).json({ error: 'audio file required' });
    const toneUrl = `/uploads/${req.file.filename}`;

    updateDb((db) => {
      db.settings = normalizeSettings(db.settings);
      const prev = db.settings[fields.url];
      if (prev) {
        const old = path.join(UPLOADS, path.basename(prev));
        if (fs.existsSync(old)) {
          try { fs.unlinkSync(old); } catch { /* ignore */ }
        }
      }
      db.settings[fields.url] = toneUrl;
      db.settings[fields.name] = req.file.originalname;
      // Keep legacy default in sync when setting notification tone
      if (kind === 'notification' || kind === 'default') {
        db.settings.ringtoneUrl = toneUrl;
        db.settings.ringtoneName = req.file.originalname;
      }
    });

    const settings = normalizeSettings(readDb().settings);
    for (const user of readDb().users) {
      pushRealtime(user.id, { type: 'ringtone_updated', settings });
    }
    res.json({ settings });
  }
);

// backward-compatible admin route
app.post(
  '/api/admin/ringtone',
  authRequired,
  upload.single('ringtone'),
  async (req, res) => {
    req.params = { ...(req.params || {}), kind: 'notification' };
    // reuse handler logic via redirect-style call
    if (!req.file) return res.status(400).json({ error: 'ringtone file required' });
    const toneUrl = `/uploads/${req.file.filename}`;
    updateDb((db) => {
      db.settings = normalizeSettings(db.settings);
      db.settings.ringtoneUrl = toneUrl;
      db.settings.ringtoneName = req.file.originalname;
      db.settings.notificationToneUrl = toneUrl;
      db.settings.notificationToneName = req.file.originalname;
    });
    const settings = normalizeSettings(readDb().settings);
    for (const user of readDb().users) {
      pushRealtime(user.id, { type: 'ringtone_updated', settings });
    }
    res.json({ settings });
  }
);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    cloudMode: Boolean(process.env.MONGODB_URI || process.env.TEAMTASK_MONGODB_URI),
    time: new Date().toISOString(),
  });
});

// ---------- Free SMTP email settings ----------
app.get('/api/smtp', authRequired, requirePerm('settings.view'), (req, res) => {
  const smtp = getSmtpConfig() || {};
  res.json({
    smtp: {
      enabled: Boolean(smtp.enabled),
      host: smtp.host || '',
      port: smtp.port || 587,
      secure: Boolean(smtp.secure),
      user: smtp.user || '',
      from: smtp.from || '',
      provider: smtp.provider || '',
      note: smtp.note || '',
      // never return password
      hasPassword: Boolean(smtp.pass),
    },
  });
});

app.put('/api/smtp', authRequired, requirePerm('settings.edit'), (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  const body = req.body || {};
  const prev = getSmtpConfig() || {};
  const port = Number(body.port || 587);
  const smtp = {
    enabled: Boolean(body.enabled),
    host: String(body.host || '').trim(),
    port,
    secure: normalizeSmtpSecure(port, body.secure),
    user: String(body.user || '').trim(),
    pass: body.pass ? String(body.pass) : prev.pass || '',
    from: String(body.from || body.user || '').trim(),
    provider: String(body.provider || 'custom'),
    note: String(body.note || ''),
  };
  if (!smtp.host || !smtp.user || !smtp.pass) {
    return res.status(400).json({ error: 'host, user and password required' });
  }
  saveSmtpConfig(smtp);
  res.json({
    smtp: {
      ...smtp,
      pass: undefined,
      hasPassword: true,
    },
  });
});

app.post('/api/smtp/ethereal', authRequired, requirePerm('settings.edit'), async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  try {
    const smtp = await createEtherealTestAccount();
    res.json({
      smtp: {
        enabled: smtp.enabled,
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        user: smtp.user,
        from: smtp.from,
        provider: smtp.provider,
        note: smtp.note,
        hasPassword: true,
        // Ethereal shows password once for free testing
        pass: smtp.pass,
        web: 'https://ethereal.email',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create Ethereal account' });
  }
});

app.post('/api/smtp/test', authRequired, requirePerm('settings.edit'), async (req, res) => {
  try {
    const to = (req.body && req.body.to) || req.user.email;
    const result = await sendMail({
      to,
      subject: 'TeamTask SMTP test',
      text: 'This is a free SMTP test email from TeamTask.',
    });
    if (result.skipped) {
      return res.status(400).json({ error: result.reason || 'SMTP not configured' });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Send failed' });
  }
});

// ---------- Email templates ----------
app.get('/api/email-templates', authRequired, requirePerm('settings.view'), (_req, res) => {
  res.json({
    templates: listTemplatesWithMeta(),
    placeholders: [
      '{{recipientName}}',
      '{{actorName}}',
      '{{actorRole}}',
      '{{taskTitle}}',
      '{{teamName}}',
      '{{status}}',
      '{{message}}',
      '{{checklistItem}}',
      '{{reason}}',
      '{{reminderAt}}',
      '{{email}}',
      '{{tempPassword}}',
      '{{body}}',
    ],
  });
});

app.put('/api/email-templates', authRequired, requirePerm('settings.edit'), (req, res) => {
  if (req.user.role !== 'admin' && !req.isAdmin) {
    return res.status(403).json({ error: 'Admin only' });
  }
  const body = req.body || {};
  const updates = {};
  if (Array.isArray(body.templates)) {
    for (const t of body.templates) {
      if (!t?.key) continue;
      updates[t.key] = {
        subject: t.subject,
        body: t.body,
        enabled: t.enabled,
      };
    }
  } else if (body.templates && typeof body.templates === 'object') {
    Object.assign(updates, body.templates);
  }
  const templates = saveEmailTemplates(updates);
  res.json({ templates });
});

app.post('/api/email-templates/reset', authRequired, requirePerm('settings.edit'), (req, res) => {
  if (req.user.role !== 'admin' && !req.isAdmin) {
    return res.status(403).json({ error: 'Admin only' });
  }
  res.json({ templates: resetEmailTemplates() });
});

app.get('/api/lan-info', (_req, res) => {
  const os = require('os');
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ name, address: net.address, url: `http://${net.address}:${PORT}` });
      }
    }
  }
  const cloudMode = Boolean(process.env.MONGODB_URI || process.env.TEAMTASK_MONGODB_URI);
  res.json({
    port: Number(PORT),
    addresses,
    cloudMode,
    publicUrl: process.env.RENDER_EXTERNAL_URL || process.env.TEAMTASK_PUBLIC_URL || null,
    hint: cloudMode
      ? 'Shared cloud mode: all EXEs use this same server URL. No local hub needed.'
      : 'Local hub mode: phones set Server URL to one of these LAN addresses (same Wi‑Fi).',
  });
});

// Serve packaged web UI (desktop / production)
const webCandidates = [
  process.env.TEAMTASK_WEB_DIST,
  path.join(__dirname, 'web'),
  path.join(__dirname, '..', 'web'),
  // When running as a packaged embedded server, __dirname typically is:
  // resources/server/src -> so resources/web is ../../web
  path.join(__dirname, '..', '..', 'web'),
  path.join(process.resourcesPath || '', 'web'),
  path.join(__dirname, '..', '..', 'app', 'dist'),
].filter(Boolean);

let webRoot = null;
for (const candidate of webCandidates) {
  if (candidate && fs.existsSync(path.join(candidate, 'index.html'))) {
    webRoot = candidate;
    break;
  }
}

if (webRoot) {
  app.use(express.static(webRoot));
  app.get('/', (_req, res) => {
    res.sendFile(path.join(webRoot, 'index.html'));
  });
  app.get(/^(?!\/api)(?!\/uploads)(?!\/ws).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(webRoot, 'index.html'));
  });
  console.log('Serving web UI from', webRoot);
} else {
  console.log('Web UI not found. Candidates:', webCandidates);
}

// Reminder checker — every 15 seconds (local device)
cron.schedule('*/15 * * * * *', async () => {
  try {
    await processDueReminders();
  } catch (err) {
    console.error('Reminder check failed:', err.message);
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (!token) {
      ws.close();
      return;
    }
    const payload = jwt.verify(token, JWT_SECRET);
    registerSocket(payload.id, ws);
    ws.send(JSON.stringify({ type: 'connected', userId: payload.id }));
  } catch {
    ws.close();
  }
});

async function boot() {
  try {
    await initDb();
  } catch (err) {
    console.error('Database init failed:', err.message);
    process.exit(1);
  }
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`TeamTask API running on http://0.0.0.0:${PORT}`);
  });
}

server.on('error', (err) => {
  console.error('Server listen error:', err.message);
  process.exit(1);
});

boot();
