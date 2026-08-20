import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

function syncNativeAuthToken(token: string | null) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    if (token) {
      window.localStorage.setItem('teamtask_token', token);
      window.localStorage.setItem('token', token);
    } else {
      window.localStorage.removeItem('teamtask_token');
      window.localStorage.removeItem('token');
    }
  } catch {
    // ignore
  }
  const native = (window as any).TeamTaskNative;
  if (native && typeof native.setAuthToken === 'function') {
    try {
      native.setAuthToken(token || '');
    } catch {
      // ignore
    }
  }
}

export type User = {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  avatarUrl?: string | null;
  role: 'admin' | 'user';
  roleId?: string | null;
  roleName?: string;
  permissions?: string[];
};

export type AppSettings = {
  ringtoneUrl: string | null;
  ringtoneName: string | null;
  notificationToneUrl?: string | null;
  notificationToneName?: string | null;
  alertToneUrl?: string | null;
  alertToneName?: string | null;
  reminderToneUrl?: string | null;
  reminderToneName?: string | null;
  appName?: string;
  logoUrl?: string | null;
  tagline?: string;
};

const emptySettings: AppSettings = {
  ringtoneUrl: null,
  ringtoneName: null,
  notificationToneUrl: null,
  notificationToneName: null,
  alertToneUrl: null,
  alertToneName: null,
  reminderToneUrl: null,
  reminderToneName: null,
  appName: 'TeamTask',
  logoUrl: null,
  tagline: 'Plan work. Share progress. Stay aligned.',
};

type AuthCtx = {
  user: User | null;
  token: string | null;
  loading: boolean;
  settings: AppSettings;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  setSettings: (s: AppSettings) => void;
  can: (perm: string) => boolean;
  isAdmin: boolean;
};

const Ctx = createContext<AuthCtx | null>(null);

function applyUser(raw: any): User {
  return {
    id: raw.id,
    name: raw.name,
    firstName: raw.firstName,
    lastName: raw.lastName,
    email: raw.email,
    avatarUrl: raw.avatarUrl || null,
    role: raw.role === 'admin' ? 'admin' : 'user',
    roleId: raw.roleId,
    roleName: raw.roleName || raw.role,
    permissions: raw.permissions || [],
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(emptySettings);

  useEffect(() => {
    (async () => {
      try {
        const t = await AsyncStorage.getItem('token');
        if (!t) return;
        syncNativeAuthToken(t);
        setToken(t);
        const data = await api.me();
        setUser(applyUser(data.user));
        setSettings({ ...emptySettings, ...(data.settings || {}) });
      } catch {
        await AsyncStorage.removeItem('token');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isAdmin = Boolean(
    user && (user.role === 'admin' || user.roleName === 'Admin' || user.roleId === 'role-admin')
  );

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      token,
      loading,
      settings,
      setSettings,
      isAdmin,
      can(perm: string) {
        if (!user) return false;
        if (isAdmin) return true;
        return (user.permissions || []).includes(perm);
      },
      async login(email, password) {
        const data = await api.login({ email, password });
        await AsyncStorage.setItem('token', data.token);
        syncNativeAuthToken(data.token);
        setToken(data.token);
        setUser(applyUser(data.user));
        const me = await api.me();
        setUser(applyUser(me.user));
        setSettings({ ...emptySettings, ...(me.settings || {}) });
      },
      async register(name, email, password) {
        const data = await api.register({ name, email, password });
        await AsyncStorage.setItem('token', data.token);
        syncNativeAuthToken(data.token);
        setToken(data.token);
        setUser(applyUser(data.user));
        const me = await api.me();
        setUser(applyUser(me.user));
        setSettings({ ...emptySettings, ...(me.settings || {}) });
      },
      async logout() {
        await AsyncStorage.removeItem('token');
        syncNativeAuthToken(null);
        setToken(null);
        setUser(null);
      },
      async refreshMe() {
        const me = await api.me();
        setUser(applyUser(me.user));
        setSettings({ ...emptySettings, ...(me.settings || {}) });
      },
    }),
    [user, token, loading, settings, isAdmin]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
