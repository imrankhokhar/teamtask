const { readDb, updateDb } = require('./db');
const { isAdminUser, getUserRole } = require('./permissions');

/**
 * Email template catalog.
 * Placeholders: {{recipientName}} {{actorName}} {{actorRole}} {{taskTitle}}
 * {{teamName}} {{status}} {{message}} {{checklistItem}} {{reason}}
 * {{reminderAt}} {{email}} {{tempPassword}} {{body}}
 */
const TEMPLATE_DEFS = [
  {
    key: 'reply_from_lead',
    label: 'Reply from Admin / HOD',
    description: 'When an Admin, HOD, or lead role replies on a checklist item',
    category: 'replies',
    defaultSubject: '[TeamTask] Reply from {{actorRole}}: {{taskTitle}}',
    defaultBody:
      'Hi {{recipientName}},\n\n{{actorName}} ({{actorRole}}) replied on checklist item "{{checklistItem}}" for task "{{taskTitle}}":\n\n{{message}}\n\n— TeamTask',
  },
  {
    key: 'reply_from_member',
    label: 'Reply from Member',
    description: 'When a team member replies on a checklist item',
    category: 'replies',
    defaultSubject: '[TeamTask] Member reply: {{taskTitle}}',
    defaultBody:
      'Hi {{recipientName}},\n\n{{actorName}} replied on "{{checklistItem}}" for task "{{taskTitle}}":\n\n{{message}}\n\n— TeamTask',
  },
  {
    key: 'team_added',
    label: 'Added to team',
    description: 'When Admin/HOD adds someone to a team',
    category: 'teams',
    defaultSubject: '[TeamTask] You were added to {{teamName}}',
    defaultBody:
      'Hi {{recipientName}},\n\n{{actorName}} ({{actorRole}}) added you to the team "{{teamName}}".\n\nYou can sign in to TeamTask to view this team and its tasks.\n\n— TeamTask',
  },
  {
    key: 'welcome_team',
    label: 'Welcome (new team member account)',
    description: 'When a new user account is created while adding them to a team',
    category: 'teams',
    defaultSubject: '[TeamTask] Welcome — added to {{teamName}}',
    defaultBody:
      'Hi {{recipientName}},\n\n{{actorName}} ({{actorRole}}) added you to "{{teamName}}" on TeamTask.\n\nLogin email: {{email}}\nTemporary password: {{tempPassword}}\n\nPlease change your password after first login.\n\n— TeamTask',
  },
  {
    key: 'task_assigned',
    label: 'Task assigned',
    description: 'When someone is assigned a task',
    category: 'tasks',
    defaultSubject: '[TeamTask] New task assigned: {{taskTitle}}',
    defaultBody:
      'Hi {{recipientName}},\n\n{{actorName}} ({{actorRole}}) assigned you the task "{{taskTitle}}".\n\n{{body}}\n\nOpen TeamTask to view details and checklist.\n\n— TeamTask',
  },
  {
    key: 'status_changed',
    label: 'Task status changed',
    description: 'When task status is updated',
    category: 'tasks',
    defaultSubject: '[TeamTask] Status update: {{taskTitle}} → {{status}}',
    defaultBody:
      'Hi {{recipientName}},\n\n{{actorName}} ({{actorRole}}) changed the status of "{{taskTitle}}" to {{status}}.\n\n— TeamTask',
  },
  {
    key: 'checklist_checked',
    label: 'Checklist marked complete',
    description: 'When a checklist item is checked',
    category: 'checklist',
    defaultSubject: '[TeamTask] Checklist completed: {{taskTitle}}',
    defaultBody:
      'Hi {{recipientName}},\n\n{{actorName}} marked "{{checklistItem}}" as complete on task "{{taskTitle}}".\n\n— TeamTask',
  },
  {
    key: 'checklist_unchecked',
    label: 'Checklist unmarked',
    description: 'When a checklist item is unchecked (with reason)',
    category: 'checklist',
    defaultSubject: '[TeamTask] Checklist unmarked: {{taskTitle}}',
    defaultBody:
      'Hi {{recipientName}},\n\n{{actorName}} unmarked "{{checklistItem}}" on "{{taskTitle}}".\n\nReason: {{reason}}\n\n— TeamTask',
  },
  {
    key: 'reminder_set',
    label: 'Reminder scheduled',
    description: 'When a reminder is set on a task',
    category: 'reminders',
    defaultSubject: '[TeamTask] Reminder set: {{taskTitle}}',
    defaultBody:
      'Hi {{recipientName}},\n\nA reminder for "{{taskTitle}}" was scheduled for {{reminderAt}}.\n\n— TeamTask',
  },
  {
    key: 'reminder_due',
    label: 'Reminder due',
    description: 'When a task reminder becomes due',
    category: 'reminders',
    defaultSubject: '[TeamTask] Reminder due: {{taskTitle}}',
    defaultBody:
      'Hi {{recipientName}},\n\nReminder: "{{taskTitle}}" is due now ({{reminderAt}}).\n\n— TeamTask',
  },
];

function defaultTemplatesMap() {
  const map = {};
  for (const def of TEMPLATE_DEFS) {
    map[def.key] = {
      key: def.key,
      subject: def.defaultSubject,
      body: def.defaultBody,
      enabled: true,
    };
  }
  return map;
}

function ensureEmailTemplates(db) {
  let changed = false;
  db.settings = db.settings || {};
  if (!db.settings.emailTemplates || typeof db.settings.emailTemplates !== 'object') {
    db.settings.emailTemplates = defaultTemplatesMap();
    return true;
  }
  const defaults = defaultTemplatesMap();
  for (const key of Object.keys(defaults)) {
    if (!db.settings.emailTemplates[key]) {
      db.settings.emailTemplates[key] = defaults[key];
      changed = true;
    } else {
      const t = db.settings.emailTemplates[key];
      if (t.subject == null) {
        t.subject = defaults[key].subject;
        changed = true;
      }
      if (t.body == null) {
        t.body = defaults[key].body;
        changed = true;
      }
      if (t.enabled == null) {
        t.enabled = true;
        changed = true;
      }
      t.key = key;
    }
  }
  return changed;
}

function getEmailTemplates() {
  const db = readDb();
  ensureEmailTemplates(db);
  return db.settings.emailTemplates;
}

function listTemplatesWithMeta() {
  const stored = getEmailTemplates();
  return TEMPLATE_DEFS.map((def) => ({
    ...def,
    subject: stored[def.key]?.subject ?? def.defaultSubject,
    body: stored[def.key]?.body ?? def.defaultBody,
    enabled: stored[def.key]?.enabled !== false,
  }));
}

function saveEmailTemplates(updates) {
  updateDb((db) => {
    ensureEmailTemplates(db);
    for (const [key, patch] of Object.entries(updates || {})) {
      if (!db.settings.emailTemplates[key]) continue;
      if (patch.subject != null) db.settings.emailTemplates[key].subject = String(patch.subject);
      if (patch.body != null) db.settings.emailTemplates[key].body = String(patch.body);
      if (patch.enabled != null) db.settings.emailTemplates[key].enabled = Boolean(patch.enabled);
    }
  });
  return listTemplatesWithMeta();
}

function resetEmailTemplates() {
  updateDb((db) => {
    db.settings = db.settings || {};
    db.settings.emailTemplates = defaultTemplatesMap();
  });
  return listTemplatesWithMeta();
}

function renderTemplate(str, vars = {}) {
  return String(str || '').replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? '' : String(v);
  });
}

function isLeadUser(db, user) {
  if (!user) return false;
  if (isAdminUser(db, user)) return true;
  const role = getUserRole(db, user);
  const name = String(role?.name || user.role || '').toLowerCase();
  return /\b(hod|admin|manager|lead|head)\b/.test(name) || name.includes('head of');
}

function resolveTemplateKey(type, actor) {
  const db = readDb();
  if (type === 'checklist_reply') {
    return isLeadUser(db, actor) ? 'reply_from_lead' : 'reply_from_member';
  }
  const map = {
    task_assigned: 'task_assigned',
    status_changed: 'status_changed',
    checklist_checked: 'checklist_checked',
    checklist_unchecked: 'checklist_unchecked',
    reminder_set: 'reminder_set',
    reminder_due: 'reminder_due',
    team_added: 'team_added',
    welcome_team: 'welcome_team',
  };
  return map[type] || null;
}

function buildEmailFromTemplate(templateKey, vars = {}) {
  const templates = getEmailTemplates();
  const tpl = templates[templateKey];
  if (!tpl || tpl.enabled === false) {
    return null;
  }
  const subject = renderTemplate(tpl.subject, vars);
  const text = renderTemplate(tpl.body, vars);
  const html = `<div style="font-family:sans-serif;line-height:1.5;white-space:pre-wrap">${escapeHtml(text)}</div>`;
  return { subject, text, html, templateKey };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function actorVars(user, db) {
  const role = getUserRole(db, user);
  return {
    actorName: user?.name || 'Someone',
    actorRole: role?.name || user?.role || 'Member',
  };
}

module.exports = {
  TEMPLATE_DEFS,
  defaultTemplatesMap,
  ensureEmailTemplates,
  getEmailTemplates,
  listTemplatesWithMeta,
  saveEmailTemplates,
  resetEmailTemplates,
  renderTemplate,
  isLeadUser,
  resolveTemplateKey,
  buildEmailFromTemplate,
  actorVars,
};
