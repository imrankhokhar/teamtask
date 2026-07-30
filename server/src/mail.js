const nodemailer = require('nodemailer');
const { readDb, updateDb } = require('./db');

function getSmtpConfig() {
  const db = readDb();
  return db.settings?.smtp || null;
}

function saveSmtpConfig(smtp) {
  updateDb((db) => {
    db.settings = db.settings || {};
    db.settings.smtp = smtp;
  });
}

/** Port 465 = implicit TLS; 587/25 = plain then STARTTLS. Wrong combo causes WRONG_VERSION_NUMBER. */
function normalizeSmtpSecure(port, secureFlag) {
  const p = Number(port || 587);
  if (p === 465) return true;
  if (p === 587 || p === 25 || p === 2525) return false;
  return Boolean(secureFlag);
}

async function createTransport() {
  const smtp = getSmtpConfig();
  if (!smtp || !smtp.host || !smtp.user || !smtp.pass) {
    return null;
  }
  const port = Number(smtp.port || 587);
  const secure = normalizeSmtpSecure(port, smtp.secure);
  return nodemailer.createTransport({
    host: smtp.host,
    port,
    secure,
    requireTLS: !secure && (port === 587 || port === 2525),
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
    tls: {
      // Local/dev hubs often hit corporate proxies; keep delivery working on LAN
      minVersion: 'TLSv1.2',
    },
  });
}

function friendlySmtpError(err) {
  const msg = String(err?.message || err || 'SMTP error');
  if (/WRONG_VERSION_NUMBER|wrong version number/i.test(msg)) {
    return (
      'SMTP SSL mismatch: use port 587 with Secure OFF (STARTTLS), ' +
      'or port 465 with Secure ON. Gmail/Outlook: smtp.gmail.com / smtp.office365.com port 587, Secure off.'
    );
  }
  if (/Invalid login|EAUTH|535/i.test(msg)) {
    return 'SMTP login failed. For Gmail use an App Password (not your normal password).';
  }
  return msg;
}

async function sendMail({ to, subject, text, html }) {
  const smtp = getSmtpConfig();
  if (!smtp?.enabled) {
    return { skipped: true, reason: 'SMTP disabled or not configured' };
  }
  const transport = await createTransport();
  if (!transport) {
    return { skipped: true, reason: 'SMTP incomplete' };
  }
  const from = smtp.from || smtp.user;
  try {
    const info = await transport.sendMail({
      from: `"TeamTask" <${from}>`,
      to,
      subject,
      text,
      html: html || `<p>${text}</p>`,
    });
    return { ok: true, messageId: info.messageId, preview: nodemailer.getTestMessageUrl?.(info) || null };
  } catch (err) {
    const e = new Error(friendlySmtpError(err));
    e.cause = err;
    throw e;
  }
}

async function createEtherealTestAccount() {
  const account = await nodemailer.createTestAccount();
  const smtp = {
    enabled: true,
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    user: account.user,
    pass: account.pass,
    from: account.user,
    provider: 'ethereal',
    note: 'Free Ethereal test inbox. Open https://ethereal.email to view messages (not real inbox delivery).',
  };
  saveSmtpConfig(smtp);
  return smtp;
}

async function emailUsers(userIds, { subject, text }) {
  const db = readDb();
  const results = [];
  for (const id of userIds) {
    const user = db.users.find((u) => u.id === id);
    if (!user?.email) continue;
    try {
      const r = await sendMail({ to: user.email, subject, text });
      results.push({ email: user.email, ...r });
    } catch (err) {
      results.push({ email: user.email, error: err.message });
    }
  }
  return results;
}

module.exports = {
  getSmtpConfig,
  saveSmtpConfig,
  sendMail,
  createEtherealTestAccount,
  emailUsers,
  createTransport,
  normalizeSmtpSecure,
  friendlySmtpError,
};
