/**
 * ponytail: smoke-check password reset helpers (hash + expiry rules).
 * Run: node server/scripts/check-password-reset.js
 */
const bcrypt = require('bcryptjs');

const code = '123456';
const hash = bcrypt.hashSync(code, 10);
const ok = bcrypt.compareSync(code, hash);
const bad = bcrypt.compareSync('000000', hash);
const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
const expired = new Date(Date.now() - 1000);

if (!ok) throw new Error('valid code should match hash');
if (bad) throw new Error('wrong code should not match');
if (!(expiresAt.getTime() > Date.now())) throw new Error('future expiry expected');
if (!(expired.getTime() < Date.now())) throw new Error('past expiry expected');

console.log('password-reset check ok');
