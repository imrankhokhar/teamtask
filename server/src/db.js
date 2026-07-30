const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { createDefaultRoles } = require('./permissions');

function resolveDataDir() {
  if (process.env.TEAMTASK_DATA_DIR) return process.env.TEAMTASK_DATA_DIR;
  if (process.env.TEAMTASK_USER_DATA) {
    return path.join(process.env.TEAMTASK_USER_DATA, 'teamtask-data');
  }
  return path.join(__dirname, '..', 'data');
}

const DATA_DIR = resolveDataDir();
const DB_PATH = path.join(DATA_DIR, 'db.json');

/** @type {object|null} */
let memoryDb = null;
/** @type {import('mongodb').MongoClient|null} */
let mongoClient = null;
/** @type {import('mongodb').Collection|null} */
let mongoCol = null;
let mongoFlushTimer = null;
let mongoDirty = false;
const DOC_ID = 'teamtask-main';

function createSeededDb() {
  const now = new Date().toISOString();
  const roles = createDefaultRoles();
  const adminRole = roles.find((r) => r.id === 'role-admin');
  const memberRole = roles.find((r) => r.id === 'role-member');

  const admin = {
    id: uuid(),
    firstName: 'Admin',
    lastName: 'User',
    name: 'Admin User',
    email: 'admin@teamtask.local',
    passwordHash: bcrypt.hashSync('admin123', 10),
    role: 'admin',
    roleId: adminRole.id,
    pushToken: null,
    createdAt: now,
  };
  const alice = {
    id: uuid(),
    firstName: 'Alice',
    lastName: 'Team',
    name: 'Alice Team',
    email: 'alice@teamtask.local',
    passwordHash: bcrypt.hashSync('alice123', 10),
    role: 'user',
    roleId: memberRole.id,
    pushToken: null,
    createdAt: now,
  };
  const bob = {
    id: uuid(),
    firstName: 'Bob',
    lastName: 'Team',
    name: 'Bob Team',
    email: 'bob@teamtask.local',
    passwordHash: bcrypt.hashSync('bob123', 10),
    role: 'user',
    roleId: memberRole.id,
    pushToken: null,
    createdAt: now,
  };
  const teamId = uuid();
  return {
    roles,
    users: [admin, alice, bob],
    teams: [
      {
        id: teamId,
        name: 'Core Team',
        createdBy: admin.id,
        createdAt: now,
      },
    ],
    teamMembers: [
      { teamId, userId: admin.id },
      { teamId, userId: alice.id },
      { teamId, userId: bob.id },
    ],
    tasks: [],
    taskAssignees: [],
    taskTeamAssignees: [],
    checklistItems: [],
    checklistReplies: [],
    notifications: [],
    settings: {
      ringtoneUrl: null,
      ringtoneName: null,
      notificationToneUrl: null,
      notificationToneName: null,
      alertToneUrl: null,
      alertToneName: null,
      reminderToneUrl: null,
      reminderToneName: null,
      emailTemplates: {},
    },
  };
}

function migrateDb(db) {
  let changed = false;
  if (!Array.isArray(db.roles) || db.roles.length === 0) {
    db.roles = createDefaultRoles();
    changed = true;
  } else {
    const all = require('./permissions').allPermissionKeys();
    const admin = db.roles.find((r) => r.id === 'role-admin' || r.name === 'Admin');
    if (admin) {
      const next = all.slice().sort().join(',');
      const prev = (admin.permissions || []).slice().sort().join(',');
      if (next !== prev) {
        admin.permissions = all;
        changed = true;
      }
    }
  }
  const adminRole = db.roles.find((r) => r.id === 'role-admin' || r.name === 'Admin');
  const memberRole = db.roles.find((r) => r.id === 'role-member' || r.name === 'Member');
  for (const u of db.users || []) {
    if (!u.roleId) {
      u.roleId = u.role === 'admin' ? adminRole?.id : memberRole?.id;
      changed = true;
    }
  }
  const { ensureEmailTemplates } = require('./templates');
  if (ensureEmailTemplates(db)) changed = true;
  return changed;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function ensureFileDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(createSeededDb(), null, 2));
    return;
  }
  try {
    const current = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (!Array.isArray(current.users) || current.users.length === 0) {
      fs.writeFileSync(DB_PATH, JSON.stringify(createSeededDb(), null, 2));
      return;
    }
    if (migrateDb(current)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(current, null, 2));
    }
  } catch {
    fs.writeFileSync(DB_PATH, JSON.stringify(createSeededDb(), null, 2));
  }
}

async function flushMongo() {
  if (!mongoCol || !memoryDb || !mongoDirty) return;
  mongoDirty = false;
  const data = clone(memoryDb);
  await mongoCol.updateOne(
    { _id: DOC_ID },
    { $set: { data, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
}

function scheduleMongoFlush() {
  mongoDirty = true;
  if (mongoFlushTimer) return;
  mongoFlushTimer = setTimeout(() => {
    mongoFlushTimer = null;
    flushMongo().catch((err) => console.error('Mongo flush failed:', err.message));
  }, 200);
}

/**
 * Call once before accepting traffic.
 * Uses MongoDB when MONGODB_URI is set (shared cloud), else local JSON file.
 */
async function initDb() {
  const uri = process.env.MONGODB_URI || process.env.TEAMTASK_MONGODB_URI;
  if (uri) {
    const { MongoClient } = require('mongodb');
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    const dbName = process.env.MONGODB_DB || 'teamtask';
    mongoCol = mongoClient.db(dbName).collection('appstate');
    const existing = await mongoCol.findOne({ _id: DOC_ID });
    if (existing?.data && Array.isArray(existing.data.users) && existing.data.users.length) {
      memoryDb = existing.data;
    } else {
      memoryDb = createSeededDb();
      mongoDirty = true;
      await flushMongo();
    }
    if (migrateDb(memoryDb)) {
      mongoDirty = true;
      await flushMongo();
    }
    console.log('TeamTask data store: MongoDB (shared cloud)');
    return { mode: 'mongodb' };
  }

  ensureFileDb();
  memoryDb = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  if (migrateDb(memoryDb)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(memoryDb, null, 2));
  }
  console.log('TeamTask data store: local file', DB_PATH);
  return { mode: 'file' };
}

function readDb() {
  if (!memoryDb) {
    // Sync fallback for local/tests before initDb
    ensureFileDb();
    memoryDb = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (migrateDb(memoryDb)) writeDb(memoryDb);
  }
  return memoryDb;
}

function writeDb(db) {
  memoryDb = db;
  if (mongoCol) {
    scheduleMongoFlush();
    return;
  }
  ensureFileDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function updateDb(mutator) {
  const db = readDb();
  const result = mutator(db);
  writeDb(db);
  return result;
}

async function closeDb() {
  if (mongoFlushTimer) {
    clearTimeout(mongoFlushTimer);
    mongoFlushTimer = null;
  }
  await flushMongo().catch(() => undefined);
  if (mongoClient) {
    await mongoClient.close().catch(() => undefined);
    mongoClient = null;
    mongoCol = null;
  }
}

module.exports = {
  initDb,
  closeDb,
  readDb,
  writeDb,
  updateDb,
  DB_PATH,
  DATA_DIR,
  createSeededDb,
};
