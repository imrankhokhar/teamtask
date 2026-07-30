import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Audio } from 'expo-av';
import { api, getApiBaseUrl, refreshApiUrl } from './api';
import { useAuth, AppSettings } from './auth';

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
    type === 'checklist_checked' ||
    type === 'checklist_unchecked' ||
    type === 'checklist_reply' ||
    type === 'status_changed'
  ) {
    return settings.alertToneUrl || settings.ringtoneUrl;
  }
  return settings.notificationToneUrl || settings.ringtoneUrl;
}

export function useRealtimeNotifications(onNotify?: (n: any) => void) {
  const { token, settings, setSettings } = useAuth();
  const soundRef = useRef<Audio.Sound | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token) return;
      try {
        const pushToken = await registerForPush();
        if (!cancelled && pushToken) await api.setPushToken(pushToken);
      } catch (e) {
        console.warn('Push registration skipped:', e);
      }

      await refreshApiUrl();
      const base = await getApiBaseUrl();
      const wsUrl = base.replace(/^http/, 'ws') + `/ws?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ringtone_updated' && msg.settings) {
            setSettings(msg.settings);
            return;
          }
          if (msg.type === 'notification' && Array.isArray(msg.items)) {
            for (const n of msg.items) {
              onNotify?.(n);
              const tone = toneForNotification(n.type, settingsRef.current);
              await presentLocal(n, tone);
            }
          }
        } catch {
          // ignore
        }
      };
    })();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      soundRef.current?.unloadAsync().catch(() => undefined);
    };
  }, [token]);

  async function presentLocal(
    n: { title: string; body: string; type?: string },
    ringtoneUrl: string | null | undefined
  ) {
    try {
      if (ringtoneUrl) {
        const base = await getApiBaseUrl();
        const uri = ringtoneUrl.startsWith('http')
          ? ringtoneUrl
          : `${base}${ringtoneUrl}`;
        if (soundRef.current) await soundRef.current.unloadAsync();
        const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
        soundRef.current = sound;
      }
    } catch {
      // fall through
    }

    if (Platform.OS === 'web') {
      // Desktop/web: browser Notification API when permitted
      try {
        if (typeof Notification !== 'undefined') {
          if (Notification.permission === 'granted') {
            new Notification(n.title, { body: n.body });
          } else if (Notification.permission !== 'denied') {
            const perm = await Notification.requestPermission();
            if (perm === 'granted') new Notification(n.title, { body: n.body });
          }
        }
      } catch {
        // ignore
      }
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: n.title,
        body: n.body,
        sound: true,
      },
      trigger: null,
    });
  }
}
