import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { api, getApiBaseUrl } from '../api';
import { colors } from '../theme';
import { useAuth } from '../auth';

type ToneKind = 'notification' | 'alert' | 'reminder';

const TONES: { kind: ToneKind; title: string; desc: string }[] = [
  { kind: 'notification', title: 'Notification tone', desc: 'Played for general task notifications' },
  { kind: 'alert', title: 'Alert tone', desc: 'Played for checklist / status alerts' },
  { kind: 'reminder', title: 'Reminder tone', desc: 'Played when a scheduled reminder is due' },
];

export default function SoundsScreen({ navigation }: any) {
  const { settings, setSettings, refreshMe } = useAuth();
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [storage, setStorage] = useState<any>(null);

  useEffect(() => {
    api.storageInfo().then(setStorage).catch(() => undefined);
    return () => {
      sound?.unloadAsync().catch(() => undefined);
    };
  }, [sound]);

  function toneName(kind: ToneKind) {
    if (kind === 'notification') return settings.notificationToneName || settings.ringtoneName;
    if (kind === 'alert') return settings.alertToneName || settings.ringtoneName;
    return settings.reminderToneName || settings.ringtoneName;
  }

  function toneUrl(kind: ToneKind) {
    if (kind === 'notification') return settings.notificationToneUrl || settings.ringtoneUrl;
    if (kind === 'alert') return settings.alertToneUrl || settings.ringtoneUrl;
    return settings.reminderToneUrl || settings.ringtoneUrl;
  }

  async function pickAndUpload(kind: ToneKind) {
    try {
      setBusyKind(kind);
      setMsg('');
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      const data = await api.uploadTone(
        kind,
        file.uri,
        file.name || `${kind}.mp3`,
        file.mimeType || 'audio/mpeg',
        (file as any).file
      );
      setSettings(data.settings);
      setMsg(`${kind} tone saved on this device`);
      await refreshMe();
    } catch (e: any) {
      setMsg(e.message || 'Upload failed');
    } finally {
      setBusyKind(null);
    }
  }

  async function preview(kind: ToneKind) {
    const url = toneUrl(kind);
    if (!url) {
      setMsg('No tone uploaded for this type yet');
      return;
    }
    try {
      const base = await getApiBaseUrl();
      const uri = url.startsWith('http') ? url : `${base}${url}`;
      if (sound) await sound.unloadAsync();
      const created = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      setSound(created.sound);
    } catch (e: any) {
      setMsg(e.message || 'Preview failed');
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Sounds & tones</Text>
      <Text style={styles.sub}>
        Upload custom audio for notifications, alerts, and reminders. Files are stored locally on this device.
      </Text>

      {!!msg && <Text style={styles.msg}>{msg}</Text>}

      {TONES.map((t) => (
        <View key={t.kind} style={styles.card}>
          <Text style={styles.label}>{t.title}</Text>
          <Text style={styles.desc}>{t.desc}</Text>
          <Text style={styles.value}>{toneName(t.kind) || 'Default system sound'}</Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => pickAndUpload(t.kind)}
            disabled={!!busyKind}
          >
            <Text style={styles.btnText}>
              {busyKind === t.kind ? 'Uploading…' : 'Choose audio (mp3/wav)'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={() => preview(t.kind)}>
            <Text style={styles.secondaryText}>Preview</Text>
          </TouchableOpacity>
        </View>
      ))}

      {storage && (
        <View style={styles.card}>
          <Text style={styles.label}>Local storage</Text>
          <Text style={styles.desc}>{storage.note}</Text>
          <Text style={styles.path}>{storage.dataDir}</Text>
          <Text style={styles.hint}>Platform: {Platform.OS}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  back: { color: colors.info, marginTop: 48 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', marginVertical: 8 },
  sub: { color: colors.textMuted, lineHeight: 20, marginBottom: 12 },
  msg: {
    color: colors.accent,
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
    marginBottom: 12,
  },
  label: { color: colors.text, fontWeight: '800', fontSize: 16 },
  desc: { color: colors.textMuted, fontSize: 13 },
  value: { color: colors.text, marginVertical: 4 },
  path: { color: colors.info, fontSize: 12, marginTop: 4 },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: '#062016', fontWeight: '800' },
  secondary: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.accent, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
});
