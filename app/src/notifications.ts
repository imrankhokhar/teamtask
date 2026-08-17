import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Audio } from 'expo-av';
import { api, getApiBaseUrl, refreshApiUrl } from './api';
import { useAuth, AppSettings } from './auth';
import { emitAppNotify } from './notifyBus';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice || Platform.OS === 'web') {
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  return tokenData.data;
}

function toneForNotification(type: string, settings: AppSettings) {
  if (type === 'reminder_due' || type === 'reminder_set') {
    return settings.reminderToneUrl || settings.ringtoneUrl;
  }
  if (
    type === 'checklist_added' ||
    type === 'checklist_checked' ||
    type === 'checklist_unchecked' ||
    type === 'checklist_reply' ||
    type === 'status_changed'
  ) {
    return settings.alertToneUrl || settings.ringtoneUrl;
  }
  return settings.notificationToneUrl || settings.ringtoneUrl;
}

function askWebPermission() {
  if (Platform.OS !== 'web' || typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => undefined);
  }
}

function showWebBanner(n: { title: string; body: string; taskId?: string }) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const native = (window as any).TeamTaskNative;
  if (native && typeof native.notify === 'function') {
    try {
      native.notify(String(n.title || ''), String(n.body || ''));
    } catch {
      // fall through to browser notification
    }
  }
  const payload = {
    type: 'notify',
    title: n.title,
    body: n.body,
    url: n.taskId ? `/?task=${n.taskId}` : '/',
  };
  const sw = (navigator as any).serviceWorker;
  if (sw?.ready) {
    sw.ready
      .then((reg: ServiceWorkerRegistration) => {
        if (reg.active) reg.active.postMessage(payload);
        else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(n.title, { body: n.body });
        }
      })
      .catch(() => {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(n.title, { body: n.body });
        }
      });
    return;
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(n.title, { body: n.body });
  }
}

export function useRealtimeNotifications(onNotify?: (n: any) => void) {
  const { token, settings, setSettings } = useAuth();
  const soundRef = useRef<Audio.Sound | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const hasPushRef = useRef(false);
  const settingsRef = useRef(settings);
  const seenRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);
  const tokenRef = useRef(token);
  settingsRef.current = settings;
  tokenRef.current = token;

  useEffect(() => {
    let cancelled = false;
    let retryMs = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    async function playTone(type?: string) {
      const ringtoneUrl = toneForNotification(type || '', settingsRef.current);
      if (!ringtoneUrl) return;
      try {
        const base = await getApiBaseUrl();
        const uri = ringtoneUrl.startsWith('http') ? ringtoneUrl : `${base}${ringtoneUrl}`;
        if (soundRef.current) await soundRef.current.unloadAsync();
        const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
        soundRef.current = sound;
      } catch {
        // ignore
      }
    }

    async function presentNative(n: { title: string; body: string }) {
      if (hasPushRef.current) return;
      try {
        await Notifications.scheduleNotificationAsync({
          content: { title: n.title, body: n.body, sound: true },
          trigger: null,
        });
      } catch {
        // ignore
      }
    }

    function deliver(n: any, fromPoll = false) {
      if (!n?.id) return;
      if (seenRef.current.has(n.id)) return;
      seenRef.current.add(n.id);
      if (seenRef.current.size > 300) {
        seenRef.current = new Set([...seenRef.current].slice(-150));
      }
      if (fromPoll && !primedRef.current) return;
      onNotify?.(n);
      emitAppNotify(n);
      playTone(n.type);
      if (Platform.OS === 'web') showWebBanner(n);
      else presentNative(n);
    }

    async function poll() {
      if (!tokenRef.current) return;
      try {
        const data = await api.notifications();
        const items = data.notifications || [];
        if (!primedRef.current) {
          for (const n of items) if (n?.id) seenRef.current.add(n.id);
          primedRef.current = true;
          return;
        }
        for (const n of items) deliver(n, true);
      } catch {
        // ignore
      }
    }

    async function connectWs() {
      if (cancelled || !tokenRef.current) return;
      await refreshApiUrl();
      const base = await getApiBaseUrl();
      const wsUrl = base.replace(/^http/, 'ws') + `/ws?token=${encodeURIComponent(tokenRef.current)}`;
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        retryMs = 1000;
      };
      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ringtone_updated' && msg.settings) {
            setSettings(msg.settings);
            return;
          }
          if (msg.type === 'notification' && Array.isArray(msg.items)) {
            for (const n of msg.items) deliver(n, false);
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        if (cancelled) return;
        retryTimer = setTimeout(connectWs, retryMs);
        retryMs = Math.min(retryMs * 2, 15000);
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      };
    }

    (async () => {
      if (!token) return;
      askWebPermission();
      try {
        const pushToken = await registerForPush();
        hasPushRef.current = Boolean(pushToken);
        if (!cancelled && pushToken) await api.setPushToken(pushToken);
      } catch (e) {
        console.warn('Push registration skipped:', e);
      }
      await connectWs();
      await poll();
      pollTimer = setInterval(poll, 8000);
    })();

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') poll();
    });
    const wake = () => {
      if (cancelled) return;
      poll();
      const open = wsRef.current && wsRef.current.readyState === 1;
      if (!open) {
        retryMs = 1000;
        connectWs();
      }
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('online', wake);
      document.addEventListener('visibilitychange', wake);
    }

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (pollTimer) clearInterval(pollTimer);
      appSub.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('online', wake);
        document.removeEventListener('visibilitychange', wake);
      }
      wsRef.current?.close();
      soundRef.current?.unloadAsync().catch(() => undefined);
    };
  }, [token]);
}
