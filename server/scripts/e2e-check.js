const API = 'http://localhost:4000';

async function req(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

(async () => {
  const admin = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@teamtask.local', password: 'admin123' },
  });
  const users = await req('/api/users', { token: admin.token });
  const alice = users.users.find((u) => u.email === 'alice@teamtask.local');
  const teams = await req('/api/teams', { token: admin.token });
  const task = await req('/api/tasks', {
    method: 'POST',
    token: admin.token,
    body: {
      title: 'E2E verify',
      description: 'notification isolation',
      status: 'pending',
      assigneeIds: [alice.id],
      teamIds: [teams.teams[0].id],
      checklist: ['A', 'B'],
      reminderAt: new Date(Date.now() + 120000).toISOString(),
    },
  });
  const itemId = task.task.checklist[0].id;
  await req(`/api/checklist/${itemId}/check`, { method: 'PATCH', token: admin.token });
  await req(`/api/checklist/${itemId}/uncheck`, {
    method: 'PATCH',
    token: admin.token,
    body: { reason: 'Need QA' },
  });
  await req(`/api/tasks/${task.task.id}`, {
    method: 'PATCH',
    token: admin.token,
    body: { status: 'ready' },
  });

  const aliceLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'alice@teamtask.local', password: 'alice123' },
  });
  const aliceNotes = await req('/api/notifications', { token: aliceLogin.token });

  let outsider;
  try {
    outsider = await req('/api/auth/register', {
      method: 'POST',
      body: { name: 'Outsider', email: 'outsider@teamtask.local', password: 'out123' },
    });
  } catch {
    outsider = await req('/api/auth/login', {
      method: 'POST',
      body: { email: 'outsider@teamtask.local', password: 'out123' },
    });
  }
  const outNotes = await req('/api/notifications', { token: outsider.token });

  console.log('TASK', task.task.title, task.task.status);
  console.log('ALICE_NOTIFS', aliceNotes.notifications.length);
  console.log(
    'ALICE_TYPES',
    [...new Set(aliceNotes.notifications.map((n) => n.type))].join(',')
  );
  console.log('OUTSIDER_NOTIFS', outNotes.notifications.length);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
