const jwt = require('jsonwebtoken');
const { readDb } = require('./db');
const { hasPermission, isAdminUser, getUserRole } = require('./permissions');

const JWT_SECRET = process.env.JWT_SECRET || 'teamtask-free-dev-secret';

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      roleId: user.roleId,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const db = readDb();
    const full = db.users.find((u) => u.id === payload.id);
    if (!full) return res.status(401).json({ error: 'User not found' });
    req.user = full;
    req.userRole = getUserRole(db, full);
    req.isAdmin = isAdminUser(db, full);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminRequired(req, res, next) {
  if (!req.isAdmin) {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

function requirePerm(perm) {
  return (req, res, next) => {
    const db = readDb();
    if (hasPermission(db, req.user, perm)) return next();
    return res.status(403).json({ error: `Missing permission: ${perm}` });
  };
}

module.exports = {
  signToken,
  authRequired,
  adminRequired,
  requirePerm,
  JWT_SECRET,
};
