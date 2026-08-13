const { readDb, updateDb } = require('./db');
const { v4: uuid } = require('uuid');
const { isAdminUser } = require('./permissions');
const {
  resolveTemplateKey,
  buildEmailFromTemplate,
  actorVars,
} = require('./templates');

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const socketsByUser = new Map();

function registerSocket(userId, ws) {
  if (!socketsByUser.has(userId)) socketsByUser.set(userId, new Set());
  socketsByUser.get(userId).add(ws);
  ws.on('close', () => {
    socketsByUser.get(userId)?.delete(ws);
  });
}

function asUserId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value.userId || value.id || null;
  return null;
}

/** Reporter + individual assignees + every member of assigned teams. Any role, including Admin. */
function getTaskRecipientIds(taskId, db) {
  db = db || readDb();
  const task = (db.tasks || []).find((t) => t.id === taskId);
  if (!task) return [];

  const ids = new Set();
  const add = (value) => {
    const id = asUserId(value);
    if (id) ids.add(id);
  };

  add(task.reporterId);
  add(task.createdBy);

  for (const a of db.taskAssignees || []) {
    if (a.taskId === taskId) add(a.userId || a);
  }

  const teamIds = (db.taskTeamAssignees || [])
    .filter((a) => a.taskId === taskId)
    .map((a) => a.teamId)
    .filter(Boolean);

  for (const team of db.teams || []) {
    if (!teamIds.includes(team.id)) continue;
    add(team.createdBy);
    add(team.leadId);
  }

  for (const m of db.teamMembers || []) {
    if (teamIds.includes(m.teamId)) add(m.userId || m);
  }

  // Team-assigned tasks: every admin is in the loop (they manage the team even if not listed as a member).
  if (teamIds.length) {
    for (const u of db.users || []) {
      if (isAdminUser(db, u)) add(u.id);
    }
  }

  return [...ids];
}

async function sendExpoPush(tokens, title, body, data) {
  const valid = tokens.filter(Boolean);
  if (!valid.length) return;

  const messages = valid.map((to) => ({
    to,
    sound: 'default',
    title,
    body,
    data,
  }));

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.error('Expo push failed:', err.message);
  }
}

function pushRealtime(userId, payload) {
  const set = socketsByUser.get(userId);
  if (!set) return;
  const raw = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.readyState === 1) ws.send(raw);
  }
}

/**
 * Notify only reporter + assignees of a task (never unrelated users).
 * opts.templateKey / opts.emailVars control SMTP email content from Settings → Templates.
 */
async function notifyTaskUsers(taskId, { type, title, body, excludeUserId, actorUserId, emailVars = {}, templateKey }) {
  // Keep assigned admins; only skip the person who just acted.
  const recipientIds = getTaskRecipientIds(taskId).filter((id) => id && id !== excludeUserId);
  if (!recipientIds.length) return [];

  const db = readDb();
  const actor = actorUserId
    ? db.users.find((u) => u.id === actorUserId)
    : null;
  const created = [];
  const pushTokens = [];

  updateDb((store) => {
    for (const userId of recipientIds) {
      const n = {
        id: uuid(),
        userId,
        taskId,
        type,
        title,
        body,
        read: false,
        createdAt: new Date().toISOString(),
      };
      store.notifications.push(n);
      created.push(n);

      const user = store.users.find((u) => u.id === userId);
      if (user?.pushToken) pushTokens.push(user.pushToken);
    }
  });

  // Send each user only their own notification (not the full recipient list)
  for (const n of created) {
    pushRealtime(n.userId, { type: 'notification', items: [n] });
  }

  await sendExpoPush(pushTokens, title, body, { taskId, type });

  try {
    const { sendMail } = require('./mail');
    const key = templateKey || resolveTemplateKey(type, actor);
    const baseVars = {
      ...(actor ? actorVars(actor, db) : { actorName: 'Someone', actorRole: 'Member' }),
      body: body || '',
      taskTitle: emailVars.taskTitle || '',
      ...emailVars,
    };

    for (const userId of recipientIds) {
      const user = db.users.find((u) => u.id === userId);
      if (!user?.email) continue;
      const vars = {
        ...baseVars,
        recipientName: user.firstName || user.name || user.email,
      };
      let mail;
      if (key) {
        mail = buildEmailFromTemplate(key, vars);
      }
      if (!mail) {
        // Template disabled or missing — fall back to notification title/body
        mail = { subject: title, text: body, html: undefined };
      }
      await sendMail({
        to: user.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }).catch((err) => console.error('Email notify failed:', err.message));
    }
  } catch (err) {
    console.error('Email notify failed:', err.message);
  }

  return created;
}

async function sendTemplatedEmail(toUser, templateKey, vars = {}) {
  const { sendMail } = require('./mail');
  const db = readDb();
  const user = typeof toUser === 'string'
    ? db.users.find((u) => u.id === toUser)
    : toUser;
  if (!user?.email) return { skipped: true, reason: 'no email' };
  const mail = buildEmailFromTemplate(templateKey, {
    recipientName: user.firstName || user.name || user.email,
    email: user.email,
    ...vars,
  });
  if (!mail) return { skipped: true, reason: 'template disabled' };
  return sendMail({
    to: user.email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

module.exports = {
  registerSocket,
  getTaskRecipientIds,
  notifyTaskUsers,
  pushRealtime,
  sendTemplatedEmail,
};
