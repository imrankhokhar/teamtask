const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { writeDb } = require('./db');

const now = new Date().toISOString();

const admin = {
  id: uuid(),
  name: 'Admin',
  email: 'admin@teamtask.local',
  passwordHash: bcrypt.hashSync('admin123', 10),
  role: 'admin',
  pushToken: null,
  createdAt: now,
};

const alice = {
  id: uuid(),
  name: 'Alice',
  email: 'alice@teamtask.local',
  passwordHash: bcrypt.hashSync('alice123', 10),
  role: 'user',
  pushToken: null,
  createdAt: now,
};

const bob = {
  id: uuid(),
  name: 'Bob',
  email: 'bob@teamtask.local',
  passwordHash: bcrypt.hashSync('bob123', 10),
  role: 'user',
  pushToken: null,
  createdAt: now,
};

const teamId = uuid();

writeDb({
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
  },
});

console.log('Seeded free demo users:');
console.log('  admin@teamtask.local / admin123 (admin)');
console.log('  alice@teamtask.local / alice123');
console.log('  bob@teamtask.local / bob123');
