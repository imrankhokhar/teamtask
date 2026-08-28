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

const { readDb, updateDb, initDb, isCloudDbConfigured } = require('./db');
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
    avatarUrl: u.avatarUrl || null,
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
      ensureTaskReminders(task);
      for (const rem of task.reminders) {
        if (
          rem.at &&
          !rem.notified &&
          new Date(rem.at).getTime() <= now
        ) {
          rem.notified = true;
          due.push({
            taskId: task.id,
            title: task.title,
            at: rem.at,
          });
        }
      }
      syncLegacyReminderFields(task);
    }
  });
  for (const item of due) {
    await notifyTaskUsers(item.taskId, {
      type: 'reminder_due',
      title: 'Task reminder',
      body: `Reminder: "${item.title}"`,
      excludeUserId: null,
      emailVars: {
        taskTitle: item.title,
        reminderAt: new Date(item.at).toLocaleString(),
      },
    });
  }
  return due.length;
}

/** Migrate legacy reminderAt into reminders[]; keep both in sync. */
function ensureTaskReminders(task) {
  if (!Array.isArray(task.reminders)) task.reminders = [];
  if (
    task.reminderAt &&
    !task.reminders.some((r) => r.at === task.reminderAt)
  ) {
    task.reminders.push({
      id: uuid(),
      at: task.reminderAt,
      notified: Boolean(task.reminderNotified),
    });
  }
  return task.reminders;
}

function syncLegacyReminderFields(task) {
  ensureTaskReminders(task);
  const pending = task.reminders
    .filter((r) => r.at && !r.notified)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  if (pending.length) {
    task.reminderAt = pending[0].at;
    task.reminderNotified = false;
  } else if (task.reminders.length) {
    const sorted = [...task.reminders].sort(
      (a, b) => new Date(a.at) - new Date(b.at)
    );
    task.reminderAt = sorted[sorted.length - 1].at;
    task.reminderNotified = true;
  } else {
    task.reminderAt = null;
    task.reminderNotified = false;
  }
}

function buildRemindersFromAts(ats, existing = []) {
  const list = [];
  const seen = new Set();
  for (const raw of ats || []) {
    if (raw == null || raw === '') continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const at = d.toISOString();
    if (seen.has(at)) continue;
    seen.add(at);
    const prev = existing.find((r) => r.at === at);
    list.push(prev || { id: uuid(), at, notified: false });
  }
  return list.sort((a, b) => new Date(a.at) - new Date(b.at));
}

function enrichTask(db, task) {
  const assigneeIds = db.taskAssignees
    .filter((a) => a.taskId === task.id)
    .map((a) => a.userId);
  const teamIds = db.taskTeamAssignees
    .filter((a) => a.taskId === task.id)
    .map((a) => a.teamId);

  const reminders =
    Array.isArray(task.reminders) && task.reminders.length
      ? [...task.reminders].sort((a, b) => new Date(a.at) - new Date(b.at))
      : task.reminderAt
        ? [
            {
              id: 'legacy',
              at: task.reminderAt,
              notified: Boolean(task.reminderNotified),
            },
          ]
        : [];

  return {
    ...task,
    reminders,
    reminderAt: task.reminderAt || reminders.find((r) => !r.notified)?.at || reminders[0]?.at || null,
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
  const db = readDb();
  const user = db.users.find((u) => u.id === userId);
  if (user && isAdminUser(db, user)) return true;
  return getTaskRecipientIds(taskId, db).includes(userId);
}

function getVisibleTasksForUser(db, userId) {
  const user = db.users.find((u) => u.id === userId);
  const seeAll = user && isAdminUser(db, user);
  return db.tasks
    .filter((t) => seeAll || getTaskRecipientIds(t.id, db).includes(userId))
    .map((t) => enrichTask(db, t))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

// ---------- Auth ----------
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, firstName, lastName, roleId } = req.body || {};
  const fn = String(firstName || '').trim();
  const ln = String(lastName || '').trim();
  const fullName = String(name || `${fn} ${ln}`).trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const fields = {};
  if (!fullName) fields.name = 'Full name is required';
  if (!cleanEmail) fields.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) fields.email = 'Enter a valid email address';
  if (!password) fields.password = 'Password is required';
  else if (String(password).length < 6) fields.password = 'Password must be at least 6 characters';
  if (Object.keys(fields).length) {
    return res.status(400).json({ error: 'Please fix the highlighted fields', fields });
  }
  const db = readDb();
  if (db.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
    return res.status(409).json({
      error: 'Email already registered',
      fields: { email: 'This email is already registered' },
    });
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
    email: cleanEmail,
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
  const cleanEmail = String(email || '').trim().toLowerCase();
  const fields = {};
  if (!cleanEmail) fields.email = 'Email is required';
  if (!password) fields.password = 'Password is required';
  if (Object.keys(fields).length) {
    return res.status(400).json({ error: 'Please fix the highlighted fields', fields });
  }
  const db = readDb();
  const user = db.users.find((u) => u.email.toLowerCase() === cleanEmail);
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({
      error: 'Invalid email or password',
      fields: { password: 'Invalid email or password' },
    });
  }
  res.json({ token: signToken(user), user: publicUser(user, db) });
});

/** 6-digit reset code; emailed when SMTP works, returned when mail can't send. */
app.post('/api/auth/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email required' });

  const generic = {
    ok: true,
    message: 'If that account exists, a reset code was sent.',
  };

  const db = readDb();
  const user = db.users.find((u) => u.email.toLowerCase() === email);
  if (!user) return res.json(generic);

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  updateDb((store) => {
    const u = store.users.find((x) => x.id === user.id);
    if (!u) return;
    u.resetCodeHash = bcrypt.hashSync(code, 10);
    u.resetCodeExpiresAt = expiresAt;
  });

  const mailResult = await sendMail({
    to: user.email,
    subject: '[TeamTask] Password reset code',
    text:
      `Hi ${user.firstName || user.name || 'there'},\n\n` +
      `Your TeamTask password reset code is: ${code}\n\n` +
      `It expires in 30 minutes. If you did not request this, ignore this email.\n\n— TeamTask`,
  });

  if (mailResult?.skipped) {
    // ponytail: no SMTP → surface code in UI so local reset still works; upgrade = require SMTP only
    return res.json({
      ok: true,
      message: 'Email is not configured. Use the code below to reset your password.',
      code,
    });
  }

  res.json(generic);
});

app.post('/api/auth/reset-password', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();
  const newPassword = String(req.body?.newPassword || '');

  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: 'email, code, and newPassword required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const db = readDb();
  const user = db.users.find((u) => u.email.toLowerCase() === email);
  if (!user?.resetCodeHash || !user.resetCodeExpiresAt) {
    return res.status(400).json({ error: 'Invalid or expired reset code' });
  }
  if (new Date(user.resetCodeExpiresAt).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Reset code expired. Request a new one.' });
  }
  if (!bcrypt.compareSync(code, user.resetCodeHash)) {
    return res.status(400).json({ error: 'Invalid or expired reset code' });
  }

  updateDb((store) => {
    const u = store.users.find((x) => x.id === user.id);
    if (!u) return;
    u.passwordHash = bcrypt.hashSync(newPassword, 10);
    u.resetCodeHash = null;
    u.resetCodeExpiresAt = null;
  });

  res.json({ ok: true, message: 'Password updated. You can sign in now.' });
});

app.post('/api/me/password', authRequired, (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const db = readDb();
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  updateDb((store) => {
    const u = store.users.find((x) => x.id === user.id);
    if (u) u.passwordHash = bcrypt.hashSync(newPassword, 10);
  });

  res.json({ ok: true, message: 'Password changed' });
});

app.patch('/api/me', authRequired, (req, res) => {
  const { firstName, lastName, name, email, currentPassword, newPassword } = req.body || {};
  const fields = {};
  const db0 = readDb();
  const me = db0.users.find((u) => u.id === req.user.id);
  if (!me) return res.status(404).json({ error: 'User not found' });

  const fn = firstName != null ? String(firstName).trim() : me.firstName;
  const ln = lastName != null ? String(lastName).trim() : me.lastName;
  const fullName =
    name != null
      ? String(name).trim()
      : `${fn || ''} ${ln || ''}`.trim() || me.name;
  const cleanEmail =
    email != null ? String(email).trim().toLowerCase() : me.email;

  if (!fullName) fields.name = 'Name is required';
  if (!cleanEmail) fields.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    fields.email = 'Enter a valid email address';
  }
  if (
    cleanEmail !== me.email &&
    db0.users.some((u) => u.id !== me.id && u.email.toLowerCase() === cleanEmail)
  ) {
    fields.email = 'This email is already in use';
  }

  if (newPassword) {
    if (!currentPassword) fields.currentPassword = 'Current password is required';
    else if (!bcrypt.compareSync(String(currentPassword), me.passwordHash)) {
      fields.currentPassword = 'Current password is incorrect';
    }
    if (String(newPassword).length < 6) {
      fields.newPassword = 'Password must be at least 6 characters';
    }
  }

  if (Object.keys(fields).length) {
    return res.status(400).json({ error: 'Please fix the highlighted fields', fields });
  }

  updateDb((db) => {
    const u = db.users.find((x) => x.id === me.id);
    if (!u) return;
    u.firstName = fn || fullName.split(' ')[0] || '';
    u.lastName = ln || fullName.split(' ').slice(1).join(' ') || '';
    u.name = fullName;
    u.email = cleanEmail;
    if (newPassword) u.passwordHash = bcrypt.hashSync(String(newPassword), 10);
  });

  const db = readDb();
  const user = db.users.find((u) => u.id === me.id);
  res.json({ user: publicUser(user, db), message: 'Profile updated' });
});

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '.jpg';
      cb(null, `avatar-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\//i.test(file.mimetype || '') || /\.(png|jpe?g|gif|webp)$/i.test(file.originalname || '');
    if (!ok) return cb(new Error('Image files only'));
    cb(null, true);
  },
});

app.post('/api/me/avatar', authRequired, avatarUpload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Avatar image required' });
  const url = `/uploads/${req.file.filename}`;
  updateDb((db) => {
    const u = db.users.find((x) => x.id === req.user.id);
    if (!u) return;
    if (u.avatarUrl) {
      const old = path.join(UPLOADS, path.basename(u.avatarUrl));
      try {
        if (fs.existsSync(old)) fs.unlinkSync(old);
      } catch {
        // ignore
      }
    }
    u.avatarUrl = url;
  });
  const db = readDb();
  const user = db.users.find((u) => u.id === req.user.id);
  res.json({ user: publicUser(user, db), avatarUrl: url });
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
  const canFullList =
    req.isAdmin ||
    hasPermission(db, req.user, 'users.view') ||
    hasPermission(db, req.user, 'teams.create') ||
    hasPermission(db, req.user, 'tasks.create');
  const canFuelList = hasPermission(db, req.user, 'fuel.view');
  if (!canFullList && !canFuelList) {
    return res.status(403).json({ error: 'Missing permission: users.view' });
  }
  const full = req.isAdmin || hasPermission(db, req.user, 'users.view');
  const source = canFullList
    ? db.users
    : db.users.filter((u) => u.id === req.user.id);
  res.json({
    users: source.map((u) =>
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
  const fields = {};
  if (!fn) fields.firstName = 'First name is required';
  if (!ln) fields.lastName = 'Last name is required';
  if (!cleanEmail) fields.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) fields.email = 'Enter a valid email address';
  if (!password) fields.password = 'Password is required';
  else if (String(password).length < 6) fields.password = 'Password must be at least 6 characters';
  if (Object.keys(fields).length) {
    return res.status(400).json({ error: 'Please fix the highlighted fields', fields });
  }
  const db = readDb();
  if (db.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
    return res.status(409).json({
      error: 'Email already registered',
      fields: { email: 'This email is already registered' },
    });
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
      if (team.createdBy) ids.add(team.createdBy);
      ids.add(req.user.id);
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
  if (!userCanAccessTask(req.user.id, req.params.id)) {
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
    reminders: remindersInput,
  } = req.body || {};

  if (!title) {
    return res.status(400).json({
      error: 'Please fix the highlighted fields',
      fields: { title: 'Title is required' },
    });
  }
  if (!TASK_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `Status must be one of: ${TASK_STATUSES.join(', ')}`,
      fields: { status: 'Invalid status' },
    });
  }

  const reminderAts = Array.isArray(remindersInput)
    ? remindersInput
    : reminderAt
      ? [reminderAt]
      : [];
  const reminders = buildRemindersFromAts(reminderAts);

  const now = new Date().toISOString();
  const task = {
    id: uuid(),
    title: title.trim(),
    description: String(description || ''),
    status,
    reporterId: req.user.id,
    reminders,
    reminderAt: null,
    reminderNotified: false,
    createdAt: now,
    updatedAt: now,
  };
  syncLegacyReminderFields(task);

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

    const anyDue = reminders.some((r) => new Date(r.at).getTime() <= Date.now());
    if (anyDue) {
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
  if (!userCanAccessTask(req.user.id, taskId)) {
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
    reminders: remindersInput,
  } = req.body || {};

  let statusChanged = false;
  let assigneesChanged = false;
  let reminderChanged = false;
  let newReminderSummary = '';

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
    if (remindersInput !== undefined || reminderAt !== undefined) {
      ensureTaskReminders(task);
      const nextAts = Array.isArray(remindersInput)
        ? remindersInput
        : reminderAt
          ? [reminderAt]
          : [];
      const next = buildRemindersFromAts(nextAts, task.reminders);
      const prevKey = JSON.stringify(
        (task.reminders || []).map((r) => r.at).sort()
      );
      const nextKey = JSON.stringify(next.map((r) => r.at).sort());
      if (prevKey !== nextKey) {
        task.reminders = next;
        syncLegacyReminderFields(task);
        reminderChanged = true;
        newReminderSummary = next
          .map((r) => new Date(r.at).toLocaleString())
          .join(', ');
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
  if (reminderChanged) {
    await notifyTaskUsers(taskId, {
      type: 'reminder_set',
      title: 'Reminders updated',
      body: newReminderSummary
        ? `${req.user.name} updated reminders for "${task.title}": ${newReminderSummary}`
        : `${req.user.name} cleared reminders on "${task.title}"`,
      excludeUserId: req.user.id,
      actorUserId: req.user.id,
      emailVars: {
        taskTitle: task.title,
        reminderAt: newReminderSummary || 'cleared',
      },
    });
    const anyDue = (task.reminders || []).some(
      (r) => !r.notified && new Date(r.at).getTime() <= Date.now()
    );
    if (anyDue) {
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
app.post('/api/tasks/:id/checklist', authRequired, async (req, res) => {
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

  const task = readDb().tasks.find((t) => t.id === taskId);
  await notifyTaskUsers(taskId, {
    type: 'checklist_added',
    title: 'Checklist item added',
    body: `${req.user.name} added "${item.text}" on "${task?.title || 'task'}"`,
    excludeUserId: req.user.id,
    actorUserId: req.user.id,
    emailVars: {
      taskTitle: task?.title || '',
      checklistItem: item.text,
    },
  });

  res.status(201).json({ item });
});

app.delete('/api/checklist/:id', authRequired, adminRequired, (req, res) => {
  const itemId = req.params.id;
  const db0 = readDb();
  const item0 = db0.checklistItems.find((c) => c.id === itemId);
  if (!item0) return res.status(404).json({ error: 'Checklist item not found' });

  updateDb((db) => {
    db.checklistItems = db.checklistItems.filter((c) => c.id !== itemId);
    db.checklistReplies = db.checklistReplies.filter((r) => r.checklistItemId !== itemId);
    const task = db.tasks.find((t) => t.id === item0.taskId);
    if (task) task.updatedAt = new Date().toISOString();
  });

  res.json({ ok: true });
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
app.get('/api/notifications', authRequired, (req, res) => {
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
    appName: String(s.appName || 'TeamTask').trim() || 'TeamTask',
    logoUrl: s.logoUrl || null,
    tagline:
      String(s.tagline || 'Plan work. Share progress. Stay aligned.').trim() ||
      'Plan work. Share progress. Stay aligned.',
  };
}

/** Public branding for login / unauthenticated screens */
app.get('/api/branding', (_req, res) => {
  const s = normalizeSettings(readDb().settings);
  res.json({
    appName: s.appName,
    logoUrl: s.logoUrl,
    tagline: s.tagline,
  });
});

app.patch('/api/settings/branding', authRequired, requirePerm('settings.edit'), (req, res) => {
  const { appName, tagline } = req.body || {};
  const fields = {};
  if (appName != null && !String(appName).trim()) fields.appName = 'App name is required';
  if (Object.keys(fields).length) {
    return res.status(400).json({ error: 'Please fix the highlighted fields', fields });
  }
  updateDb((db) => {
    db.settings = normalizeSettings(db.settings);
    if (appName != null) db.settings.appName = String(appName).trim() || 'TeamTask';
    if (tagline != null) {
      db.settings.tagline =
        String(tagline).trim() || 'Plan work. Share progress. Stay aligned.';
    }
  });
  res.json({ settings: normalizeSettings(readDb().settings) });
});

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '.png';
      cb(null, `logo-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      /^image\//i.test(file.mimetype || '') ||
      /\.(png|jpe?g|gif|webp|svg)$/i.test(file.originalname || '');
    if (!ok) return cb(new Error('Image files only'));
    cb(null, true);
  },
});

app.post(
  '/api/settings/logo',
  authRequired,
  requirePerm('settings.edit'),
  logoUpload.single('logo'),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Logo image required' });
    const url = `/uploads/${req.file.filename}`;
    updateDb((db) => {
      db.settings = normalizeSettings(db.settings);
      if (db.settings.logoUrl) {
        const old = path.join(UPLOADS, path.basename(db.settings.logoUrl));
        try {
          if (fs.existsSync(old)) fs.unlinkSync(old);
        } catch {
          // ignore
        }
      }
      db.settings.logoUrl = url;
    });

    // Also refresh web/PWA home-screen icons from the uploaded logo (best-effort).
    try {
      const src = req.file.path;
      const targets = [];
      if (webRoot) {
        targets.push(
          path.join(webRoot, 'pwa-192.png'),
          path.join(webRoot, 'pwa-512.png'),
          path.join(webRoot, 'apple-touch-icon.png')
        );
      }
      const publicDir = path.join(__dirname, '..', 'public');
      if (fs.existsSync(publicDir)) {
        targets.push(
          path.join(publicDir, 'pwa-192.png'),
          path.join(publicDir, 'pwa-512.png'),
          path.join(publicDir, 'apple-touch-icon.png')
        );
      }
      for (const dest of targets) {
        try {
          fs.copyFileSync(src, dest);
        } catch {
          // ignore per-file failures
        }
      }
    } catch (err) {
      console.warn('PWA icon sync skipped:', err.message);
    }

    res.json({ settings: normalizeSettings(readDb().settings), logoUrl: url });
  }
);

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
    cloudMode: isCloudDbConfigured(),
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

app.post('/api/email/send', authRequired, async (req, res) => {
  try {
    const to = String(req.body?.to || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const description = String(req.body?.description || req.body?.text || '').trim();
    if (!to) return res.status(400).json({ error: 'To address is required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    if (!subject) return res.status(400).json({ error: 'Subject is required' });
    if (!description) return res.status(400).json({ error: 'Description is required' });

    const result = await sendMail({
      to,
      subject,
      text: description,
      html: `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;">${description
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</pre>`,
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
  const cloudMode = isCloudDbConfigured();
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

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

if (webRoot) {
  // Nginx-safe flat font path (public/fonts copied into web root on export)
  app.get('/fonts/:file', (req, res, next) => {
    const file = path.basename(req.params.file || '');
    const abs = path.join(webRoot, 'fonts', file);
    if (!abs.startsWith(path.join(webRoot, 'fonts')) || !fs.existsSync(abs)) return next();
    if (/\.ttf$/i.test(file)) res.type('font/ttf');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(abs);
  });

  // Map legacy Expo vector-icon URLs (contain @expo) to the flat font file
  app.get(
    '/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/:file',
    (req, res, next) => {
      const file = path.basename(req.params.file || '');
      const flat = path.join(webRoot, 'fonts', 'Ionicons.ttf');
      const hashed = path.join(
        webRoot,
        'assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts',
        file
      );
      const abs = fs.existsSync(flat) ? flat : hashed;
      if (!fs.existsSync(abs)) return next();
      res.type('font/ttf');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.sendFile(abs);
    }
  );

  app.use(
    express.static(webRoot, {
      etag: false,
      lastModified: false,
      fallthrough: true,
      setHeaders(res, filePath) {
        const name = path.basename(filePath);
        if (/^(index\.html|sw\.js|manifest\.json|pwa-register\.js)$/i.test(name)) {
          noStore(res);
          return;
        }
        if (/\.ttf$/i.test(filePath)) {
          res.setHeader('Content-Type', 'font/ttf');
          res.setHeader('Access-Control-Allow-Origin', '*');
        }
        if (/\.[a-f0-9]{8,}\./i.test(name) || /\.ttf$/i.test(name)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          noStore(res);
        }
      },
    })
  );
  app.get('/', (_req, res) => {
    noStore(res);
    res.sendFile(path.join(webRoot, 'index.html'));
  });
  app.get(/^(?!\/api)(?!\/uploads)(?!\/ws).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    // Don't SPA-fallback real static asset paths (icons/fonts/images/PWA)
    if (/\.[a-z0-9]+$/i.test(req.path)) return next();
    noStore(res);
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
    const ping = setInterval(() => {
      if (ws.readyState === 1) ws.ping();
      else clearInterval(ping);
    }, 25000);
    ws.on('close', () => clearInterval(ping));
  } catch {
    ws.close();
  }
});

async function boot() {
  try {
    await initDb();
  } catch (err) {
    const msg = [err && err.code, err && err.message].filter(Boolean).join(' ') || String(err);
    console.error('Database init failed:', msg);
    if (err && err.errors && err.errors.length) {
      for (const e of err.errors.slice(0, 3)) {
        console.error('  →', e.code || '', e.message || e);
      }
    }
    console.error(
      'Tip: for local dev, comment out DATABASE_URL in server/.env to use the file DB, or fix Neon network access (port 5432).'
    );
    process.exit(1);
  }
  const host = process.env.HOST || process.env.BIND_HOST || '127.0.0.1';
  server.listen(PORT, host, () => {
    console.log(`TeamTask API running on http://${host}:${PORT}`);
  });
}

function onListenError(err) {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other process or change PORT in server/.env.`);
  } else {
    console.error('Server listen error:', err.message || err);
  }
  process.exit(1);
}
server.on('error', onListenError);
wss.on('error', onListenError);

boot();
