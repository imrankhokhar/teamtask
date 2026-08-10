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

/** @type {'postgres'|'mongodb'|'file'|null} */
let storeMode = null;

/** @type {import('pg').Pool|null} */
let pgPool = null;

/** @type {import('mongodb').MongoClient|null} */
let mongoClient = null;
/** @type {import('mongodb').Collection|null} */
let mongoCol = null;

let remoteDirty = false;
let remoteFlushTimer = null;
const DOC_ID = 'teamtask-main';

function getPostgresUri() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URI ||
    process.env.TEAMTASK_DATABASE_URL ||
    ''
  ).trim();
}

function getMongoUri() {
  return (process.env.MONGODB_URI || process.env.TEAMTASK_MONGODB_URI || '').trim();
}

function isCloudDbConfigured() {
  return Boolean(getPostgresUri() || getMongoUri());
}

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
    const member = db.roles.find((r) => r.id === 'role-member' || r.name === 'Member');
    if (member && Array.isArray(member.permissions) && !member.permissions.includes('fuel.view')) {
      member.permissions = [...member.permissions, 'fuel.view'];
      changed = true;
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
    if (!current?.users?.length) {
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

async function flushPostgres() {
  if (!pgPool || !memoryDb || !remoteDirty) return;
  remoteDirty = false;
  const data = clone(memoryDb);
  await pgPool.query(
    `INSERT INTO appstate (id, data, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE
     SET data = EXCLUDED.data, updated_at = NOW()`,
    [DOC_ID, JSON.stringify(data)]
  );
}

async function flushMongo() {
  if (!mongoCol || !memoryDb || !remoteDirty) return;
  remoteDirty = false;
  const data = clone(memoryDb);
  await mongoCol.updateOne(
    { _id: DOC_ID },
    { $set: { data, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
}

async function flushRemote() {
  if (storeMode === 'postgres') return flushPostgres();
  if (storeMode === 'mongodb') return flushMongo();
}

function scheduleRemoteFlush() {
  remoteDirty = true;
  if (remoteFlushTimer) return;
  remoteFlushTimer = setTimeout(() => {
    remoteFlushTimer = null;
    flushRemote().catch((err) => console.error('DB flush failed:', err.message));
  }, 200);
}

async function initPostgres(uri) {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: uri,
    ssl: uri.includes('sslmode=require') || uri.includes('neon.tech') || uri.includes('supabase')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS appstate (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const result = await pgPool.query('SELECT data FROM appstate WHERE id = $1', [DOC_ID]);
  const row = result.rows[0];
  if (row?.data && Array.isArray(row.data.users) && row.data.users.length) {
    memoryDb = row.data;
  } else {
    memoryDb = createSeededDb();
    remoteDirty = true;
    await flushPostgres();
  }
  if (migrateDb(memoryDb)) {
    remoteDirty = true;
    await flushPostgres();
  }
  storeMode = 'postgres';
  console.log('TeamTask data store: PostgreSQL (shared cloud via DATABASE_URL)');
  return { mode: 'postgres' };
}

async function initMongo(uri) {
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
    remoteDirty = true;
    await flushMongo();
  }
  if (migrateDb(memoryDb)) {
    remoteDirty = true;
    await flushMongo();
  }
  storeMode = 'mongodb';
  console.log('TeamTask data store: MongoDB (shared cloud)');
  return { mode: 'mongodb' };
}

/**
 * Call once before accepting traffic.
 * Priority: DATABASE_URL (Postgres) → MONGODB_URI → local JSON file.
 */
async function initDb() {
  const pgUri = getPostgresUri();
  if (pgUri) return initPostgres(pgUri);

  const mongoUri = getMongoUri();
  if (mongoUri) return initMongo(mongoUri);

  ensureFileDb();
  memoryDb = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  if (migrateDb(memoryDb)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(memoryDb, null, 2));
  }
  storeMode = 'file';
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
  if (storeMode === 'postgres' || storeMode === 'mongodb') {
    scheduleRemoteFlush();
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
  if (remoteFlushTimer) {
    clearTimeout(remoteFlushTimer);
    remoteFlushTimer = null;
  }
  await flushRemote().catch(() => undefined);
  if (pgPool) {
    await pgPool.end().catch(() => undefined);
    pgPool = null;
  }
  if (mongoClient) {
    await mongoClient.close().catch(() => undefined);
    mongoClient = null;
    mongoCol = null;
  }
  storeMode = null;
}

module.exports = {
  initDb,
  closeDb,
  readDb,
  writeDb,
  updateDb,
  isCloudDbConfigured,
  getPostgresUri,
  DB_PATH,
  DATA_DIR,
  createSeededDb,
};
