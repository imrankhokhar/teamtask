/**
 * One-shot: wipe/trim D1 notifications table (spam recovery).
 * Uses same CLOUDFLARE_* env as the server.
 *
 *   node server/scripts/prune-d1-notifications.js
 */
const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createD1Adapter, pruneNotificationsTable } = require('../src/db-relational');

async function queryD1(sql, params = []) {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || '').trim();
  const databaseId = (
    process.env.CLOUDFLARE_D1_DATABASE_ID ||
    process.env.CF_D1_DATABASE_ID ||
    process.env.D1_DATABASE_ID ||
    ''
  ).trim();
  const apiToken = (
    process.env.CLOUDFLARE_D1_API_TOKEN ||
    process.env.CF_D1_API_TOKEN ||
    process.env.CLOUDFLARE_API_TOKEN ||
    ''
  ).trim();
  if (!accountId || !databaseId || !apiToken) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_D1_DATABASE_ID / CLOUDFLARE_D1_API_TOKEN');
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) {
    const msg = (body.errors || []).map((e) => e.message).join('; ') || res.statusText;
    throw new Error(`D1 error: ${msg}`);
  }
  return body.result?.[0]?.results || [];
}

async function main() {
  const adapter = createD1Adapter(queryD1);
  const before = await adapter.query('SELECT COUNT(*) AS c FROM notifications');
  console.log('notifications before:', before[0]);
  const result = await pruneNotificationsTable(adapter);
  console.log('prune result:', result);
  const after = await adapter.query('SELECT COUNT(*) AS c FROM notifications');
  console.log('notifications after:', after[0]);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
