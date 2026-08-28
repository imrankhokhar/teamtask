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

/** @type {'postgres'|'mongodb'|'sqlite'|'d1'|'file'|null} */
let storeMode = null;

/** @type {import('pg').Pool|null} */
let pgPool = null;

/** @type {import('better-sqlite3').Database|null} */
let sqliteDb = null;

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

/**
 * Cloudflare D1 HTTP Configuration.
 * Enabled when CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_D1_API_TOKEN are set.
 */
function getD1Config() {
  const accountId = (
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CF_ACCOUNT_ID ||
    process.env.ACCOUNT_ID ||
    ''
  ).trim();
  const databaseId = (
    process.env.CLOUDFLARE_D1_DATABASE_ID ||
    process.env.CF_D1_DATABASE_ID ||
    process.env.CLOUDFLARE_D1_ID ||
    process.env.CF_D1_ID ||
    process.env.D1_DATABASE_ID ||
    process.env.D1_ID ||
    ''
  ).trim();
  const apiToken = (
    process.env.CLOUDFLARE_D1_API_TOKEN ||
    process.env.CF_D1_API_TOKEN ||
    process.env.CLOUDFLARE_API_TOKEN ||
    process.env.CF_API_TOKEN ||
    process.env.D1_API_TOKEN ||
    ''
  ).trim();

  if (accountId && databaseId && apiToken) {
    return { accountId, databaseId, apiToken };
  }
  return null;
}

/**
 * SQLite path when enabled.
 * TEAMTASK_SQLITE=1 → ./data/teamtask.sqlite
 * TEAMTASK_SQLITE=/abs/or/rel/path.db → that file
 */
function getSqlitePath() {
  // If Cloudflare D1 is configured, ignore TEAMTASK_SQLITE so D1 takes precedence
  if (getD1Config()) return '';
  const raw = (process.env.TEAMTASK_SQLITE || process.env.SQLITE_PATH || '').trim();
  if (!raw || raw === '0' || /^false$/i.test(raw)) return '';
  if (raw === '1' || /^true$/i.test(raw)) {
    return path.join(DATA_DIR, 'teamtask.sqlite');
  }
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

function isCloudDbConfigured() {
  return Boolean(getD1Config() || getPostgresUri() || getMongoUri() || getSqlitePath());
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

async function queryD1(sql, params = []) {
  const config = getD1Config();
  if (!config) throw new Error('Cloudflare D1 is not configured');
  const { accountId, databaseId, apiToken } = config;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed.errors && parsed.errors.length) {
        detail = parsed.errors.map((e) => e.message || JSON.stringify(e)).join('; ');
      }
    } catch {}
    throw new Error(`Cloudflare D1 HTTP ${res.status}: ${detail}`);
  }
  const body = await res.json();
  if (!body.success) {
    const msg = (body.errors || []).map((e) => e.message || JSON.stringify(e)).join('; ');
    throw new Error(`Cloudflare D1 error: ${msg || 'unknown error'}`);
  }
  const first = body.result?.[0];
  return first?.results || [];
}

async function flushD1() {
  if (storeMode !== 'd1' || !memoryDb || !remoteDirty) return;
  remoteDirty = false;
  const data = clone(memoryDb);
  await queryD1(
    `INSERT INTO appstate (id, data, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       data = excluded.data,
       updated_at = datetime('now')`,
    [DOC_ID, JSON.stringify(data)]
  );
}

function flushSqlite() {
  if (!sqliteDb || !memoryDb || !remoteDirty) return;
  remoteDirty = false;
  const data = clone(memoryDb);
  sqliteDb
    .prepare(
      `INSERT INTO appstate (id, data, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         data = excluded.data,
         updated_at = datetime('now')`
    )
    .run(DOC_ID, JSON.stringify(data));
}

async function flushRemote() {
  if (storeMode === 'postgres') return flushPostgres();
  if (storeMode === 'mongodb') return flushMongo();
  if (storeMode === 'sqlite') return flushSqlite();
  if (storeMode === 'd1') return flushD1();
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
  // Avoid pg sslmode warning: set SSL in Pool options, strip sslmode from URI.
  let connectionString = uri;
  try {
    const u = new URL(uri);
    u.searchParams.delete('sslmode');
    u.searchParams.set('uselibpqcompat', 'true');
    connectionString = u.toString();
  } catch {
    // keep original uri
  }
  pgPool = new Pool({
    connectionString,
    connectionTimeoutMillis: 12_000,
    ssl:
      /sslmode=require|neon\.tech|supabase|amazonaws\.com/i.test(uri) ||
      process.env.PGSSLMODE === 'require'
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

function loadSeedOrJsonFile() {
  if (fs.existsSync(DB_PATH)) {
    try {
      const current = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      if (current && Array.isArray(current.users) && current.users.length) {
        return current;
      }
    } catch {
      // fall through to seed
    }
  }
  return createSeededDb();
}

async function initD1(config) {
  // Ensure table exists in Cloudflare D1
  await queryD1(`
    CREATE TABLE IF NOT EXISTS appstate (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const rows = await queryD1('SELECT data FROM appstate WHERE id = ?', [DOC_ID]);
  const row = rows[0];
  if (row?.data) {
    const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    if (parsed && Array.isArray(parsed.users) && parsed.users.length) {
      memoryDb = parsed;
    } else {
      memoryDb = loadSeedOrJsonFile();
      remoteDirty = true;
      await flushD1();
    }
  } else {
    memoryDb = loadSeedOrJsonFile();
    remoteDirty = true;
    await flushD1();
  }
  if (migrateDb(memoryDb)) {
    remoteDirty = true;
    await flushD1();
  }
  storeMode = 'd1';
  console.log('TeamTask data store: Cloudflare D1 (database:', config.databaseId.slice(0, 8) + '...)');
  return { mode: 'd1' };
}

async function initSqlite(dbPath) {
  const Database = require('better-sqlite3');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS appstate (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const row = sqliteDb.prepare('SELECT data FROM appstate WHERE id = ?').get(DOC_ID);
  if (row?.data) {
    const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    if (parsed && Array.isArray(parsed.users) && parsed.users.length) {
      memoryDb = parsed;
    } else {
      memoryDb = loadSeedOrJsonFile();
      remoteDirty = true;
      flushSqlite();
    }
  } else {
    memoryDb = loadSeedOrJsonFile();
    remoteDirty = true;
    flushSqlite();
  }
  if (migrateDb(memoryDb)) {
    remoteDirty = true;
    flushSqlite();
  }
  storeMode = 'sqlite';
  console.log('TeamTask data store: SQLite', dbPath);
  return { mode: 'sqlite' };
}

function allowFileFallback() {
  const flag = String(process.env.TEAMTASK_DB_FALLBACK || '').trim().toLowerCase();
  if (flag === 'file' || flag === 'local') return true;
  if (flag === 'none' || flag === 'off') return false;
  // Local `npm run server` (development) should not die if Neon is unreachable.
  return process.env.NODE_ENV !== 'production';
}

function formatDbError(err) {
  if (!err) return 'unknown error';
  const parts = [err.code, err.message].filter(Boolean);
  if (err.errors && err.errors.length) {
    const nested = err.errors
      .map((e) => e.code || e.message)
      .filter(Boolean)
      .slice(0, 3);
    if (nested.length) parts.push(`(${nested.join(', ')})`);
  }
  return parts.join(' ') || String(err);
}

async function initFileStore() {
  ensureFileDb();
  memoryDb = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  if (migrateDb(memoryDb)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(memoryDb, null, 2));
  }
  storeMode = 'file';
  console.log('TeamTask data store: local file', DB_PATH);
  return { mode: 'file' };
}

/**
 * Call once before accepting traffic.
 * Priority: Cloudflare D1 → TEAMTASK_SQLITE → DATABASE_URL (Postgres) → MONGODB_URI → local JSON file.
 * In development, unreachable cloud DB falls back to local file unless
 * TEAMTASK_DB_FALLBACK=none.
 */
async function initDb() {
  const d1Config = getD1Config();
  if (d1Config) {
    try {
      return await initD1(d1Config);
    } catch (err) {
      console.error(
        'Cloudflare D1 initialization failed:',
        formatDbError(err)
      );
      throw err;
    }
  }

  const sqlitePath = getSqlitePath();
  if (sqlitePath) return initSqlite(sqlitePath);

  const pgUri = getPostgresUri();
  if (pgUri) {
    try {
      return await initPostgres(pgUri);
    } catch (err) {
      if (pgPool) {
        await pgPool.end().catch(() => undefined);
        pgPool = null;
      }
      if (!allowFileFallback()) throw err;
      console.warn(
        'Postgres unreachable:',
        formatDbError(err),
        '— falling back to local file DB. Set TEAMTASK_DB_FALLBACK=none to disable.'
      );
      return initFileStore();
    }
  }

  const mongoUri = getMongoUri();
  if (mongoUri) {
    try {
      return await initMongo(mongoUri);
    } catch (err) {
      if (mongoClient) {
        await mongoClient.close().catch(() => undefined);
        mongoClient = null;
        mongoCol = null;
      }
      if (!allowFileFallback()) throw err;
      console.warn(
        'MongoDB unreachable:',
        formatDbError(err),
        '— falling back to local file DB. Set TEAMTASK_DB_FALLBACK=none to disable.'
      );
      return initFileStore();
    }
  }

  return initFileStore();
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
  if (storeMode === 'postgres' || storeMode === 'mongodb' || storeMode === 'sqlite' || storeMode === 'd1') {
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
  if (sqliteDb) {
    try {
      sqliteDb.close();
    } catch {
      // ignore
    }
    sqliteDb = null;
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
  getSqlitePath,
  getD1Config,
  DB_PATH,
  DATA_DIR,
  createSeededDb,
};
