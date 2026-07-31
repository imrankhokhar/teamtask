import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEY = 'api_base_url';

function defaultBaseUrl() {
  // Desktop Electron + web: use the page origin (local hub OR shared cloud host)
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  if (Platform.OS === 'android') return 'http://10.0.2.2:4000';
  return 'http://localhost:4000';
}

let cachedBase: string | null = null;

export async function getApiBaseUrl(): Promise<string> {
  if (cachedBase) return cachedBase;
  // Always prefer live page origin on web (covers localhost hub and https cloud)
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    if (origin.startsWith('http://') || origin.startsWith('https://')) {
      cachedBase = origin;
      return cachedBase;
    }
  }
  const saved = await AsyncStorage.getItem(STORAGE_KEY);
  cachedBase = (saved && saved.trim()) || defaultBaseUrl();
  return cachedBase;
}

export async function setApiBaseUrl(url: string) {
  const cleaned = url.trim().replace(/\/$/, '');
  await AsyncStorage.setItem(STORAGE_KEY, cleaned);
  cachedBase = cleaned;
}

export function getApiBaseUrlSyncFallback() {
  return cachedBase || defaultBaseUrl();
}

/** @deprecated use getApiBaseUrl — kept for screens that need a sync string after init */
export let API_URL = defaultBaseUrl();

export async function refreshApiUrl() {
  API_URL = await getApiBaseUrl();
  return API_URL;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  formData?: FormData;
};

async function request<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const base = await getApiBaseUrl();
  API_URL = base;
  const headers: Record<string, string> = {};
  const token = opts.token ?? (await AsyncStorage.getItem('token'));
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(`${base}${path}`, {
    method: opts.method || 'GET',
    headers,
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  register: (body: { name: string; email: string; password: string }) =>
    request('/api/auth/register', { method: 'POST', body, token: null }),
  login: (body: { email: string; password: string }) =>
    request('/api/auth/login', { method: 'POST', body, token: null }),
  forgotPassword: (email: string) =>
    request('/api/auth/forgot-password', {
      method: 'POST',
      body: { email },
      token: null,
    }),
  resetPassword: (body: { email: string; code: string; newPassword: string }) =>
    request('/api/auth/reset-password', { method: 'POST', body, token: null }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request('/api/me/password', { method: 'POST', body }),
  me: () => request('/api/me'),
  setPushToken: (pushToken: string | null) =>
    request('/api/me/push-token', { method: 'POST', body: { pushToken } }),
  users: () => request('/api/users'),
  createUser: (body: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    roleId?: string;
  }) => request('/api/users', { method: 'POST', body }),
  updateUser: (id: string, body: any) =>
    request(`/api/users/${id}`, { method: 'PATCH', body }),
  deleteUser: (id: string) => request(`/api/users/${id}`, { method: 'DELETE' }),
  roles: () => request('/api/roles'),
  createRole: (body: { name: string; description?: string; permissions?: string[] }) =>
    request('/api/roles', { method: 'POST', body }),
  updateRole: (id: string, body: any) =>
    request(`/api/roles/${id}`, { method: 'PATCH', body }),
  deleteRole: (id: string) => request(`/api/roles/${id}`, { method: 'DELETE' }),
  teams: () => request('/api/teams'),
  createTeam: (body: {
    name: string;
    memberIds?: string[];
    members?: { firstName: string; lastName: string; email: string }[];
  }) => request('/api/teams', { method: 'POST', body }),
  addTeamMember: (
    teamId: string,
    body: { firstName: string; lastName: string; email: string }
  ) => request(`/api/teams/${teamId}/members`, { method: 'POST', body }),
  tasks: () => request('/api/tasks'),
  task: (id: string) => request(`/api/tasks/${id}`),
  createTask: (body: any) => request('/api/tasks', { method: 'POST', body }),
  updateTask: (id: string, body: any) =>
    request(`/api/tasks/${id}`, { method: 'PATCH', body }),
  addChecklist: (taskId: string, text: string) =>
    request(`/api/tasks/${taskId}/checklist`, { method: 'POST', body: { text } }),
  checkItem: (id: string) =>
    request(`/api/checklist/${id}/check`, { method: 'PATCH' }),
  uncheckItem: (id: string, reason: string) =>
    request(`/api/checklist/${id}/uncheck`, { method: 'PATCH', body: { reason } }),
  replyItem: (id: string, message: string) =>
    request(`/api/checklist/${id}/replies`, { method: 'POST', body: { message } }),
  notifications: () => request('/api/notifications'),
  readAllNotifications: () =>
    request('/api/notifications/read-all', { method: 'POST' }),
  settings: () => request('/api/settings'),
  storageInfo: () => request('/api/storage-info'),
  lanInfo: () => request('/api/lan-info'),
  uploadTone: async (kind: string, uri: string, name: string, mimeType?: string, fileObj?: any) => {
    const form = new FormData();
    if (Platform.OS === 'web') {
      // Electron/web needs a real Blob — RN-style {uri} is ignored by browsers/multer
      let blob: Blob;
      if (fileObj instanceof Blob) {
        blob = fileObj;
      } else {
        const res = await fetch(uri);
        blob = await res.blob();
      }
      const filename = name || `${kind}.mp3`;
      try {
        form.append(
          'ringtone',
          new File([blob], filename, { type: mimeType || blob.type || 'audio/mpeg' })
        );
      } catch {
        form.append('ringtone', blob, filename);
      }
    } else {
      form.append('ringtone', {
        uri,
        name: name || `${kind}.mp3`,
        type: mimeType || 'audio/mpeg',
      } as any);
    }
    return request(`/api/tones/${kind}`, { method: 'POST', formData: form });
  },
  uploadRingtone: async (uri: string, name: string, mimeType?: string, fileObj?: any) => {
    return api.uploadTone('notification', uri, name, mimeType, fileObj);
  },
  updateTeam: (id: string, body: any) =>
    request(`/api/teams/${id}`, { method: 'PATCH', body }),
  deleteTeam: (id: string) => request(`/api/teams/${id}`, { method: 'DELETE' }),
  deleteTask: (id: string) => request(`/api/tasks/${id}`, { method: 'DELETE' }),
  getSmtp: () => request('/api/smtp'),
  saveSmtp: (body: any) => request('/api/smtp', { method: 'PUT', body }),
  createEtherealSmtp: () => request('/api/smtp/ethereal', { method: 'POST' }),
  testSmtp: (to?: string) =>
    request('/api/smtp/test', { method: 'POST', body: { to } }),
  getEmailTemplates: () => request('/api/email-templates'),
  saveEmailTemplates: (body: any) =>
    request('/api/email-templates', { method: 'PUT', body }),
  resetEmailTemplates: () =>
    request('/api/email-templates/reset', { method: 'POST' }),
};

export const TASK_STATUSES = [
  'ongoing',
  'ready',
  'in_progress',
  'pending',
  'completed',
  'reopen',
] as const;

export function statusLabel(s: string) {
  return s.replace(/_/g, ' ');
}
