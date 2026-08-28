import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, getApiBaseUrl } from '../api';
import { useTheme, ThemeColors, spacing } from '../theme';
import { useAuth } from '../auth';
import AppShell from '../components/AppShell';
import { playSoundWithFallback, stopCurrentSound, ToneType } from '../soundPlayer';

type ToneKind = 'notification' | 'alert' | 'reminder';

const TONES: { kind: ToneKind; title: string; desc: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  {
    kind: 'notification',
    title: 'Notification tone',
    desc: 'Played for general task notifications',
    icon: 'notifications-outline',
  },
  {
    kind: 'alert',
    title: 'Alert tone',
    desc: 'Played for checklist / status alerts',
    icon: 'alert-circle-outline',
  },
  {
    kind: 'reminder',
    title: 'Reminder tone',
    desc: 'Played when a scheduled reminder is due',
    icon: 'alarm-outline',
  },
];

export default function SoundsScreen({ navigation }: any) {
  const { settings, setSettings, refreshMe } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [storage, setStorage] = useState<any>(null);

  useEffect(() => {
    api.storageInfo().then(setStorage).catch(() => undefined);
    return () => {
      stopCurrentSound().catch(() => undefined);
    };
  }, []);

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
    try {
      const res = await playSoundWithFallback(url, kind);
      if (res.note) {
        setMsg(res.note);
      } else {
        setMsg(`Playing ${kind} tone`);
      }
    } catch (e: any) {
      setMsg(e.message || 'Preview failed');
    }
  }

  return (
    <AppShell navigation={navigation} active="Settings" title="Sounds & tones">
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.wrap}>
          <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={18} color={colors.info} />
            <Text style={styles.back}>Back to settings</Text>
          </TouchableOpacity>

          <Text style={styles.sub}>
            Upload custom audio for notifications, alerts, and reminders. Files are stored locally
            on this device.
          </Text>

          {!!msg && <Text style={styles.msg}>{msg}</Text>}

          {TONES.map((t) => (
            <View key={t.kind} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.iconBox}>
                  <Ionicons name={t.icon} size={18} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t.title}</Text>
                  <Text style={styles.desc}>{t.desc}</Text>
                </View>
              </View>
              <Text style={styles.value} numberOfLines={1}>
                {toneName(t.kind) || 'Default system sound'}
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.btn}
                  onPress={() => pickAndUpload(t.kind)}
                  disabled={!!busyKind}
                >
                  {busyKind === t.kind ? (
                    <ActivityIndicator color={colors.onAccent} />
                  ) : (
                    <View style={styles.btnInner}>
                      <Ionicons name="cloud-upload-outline" size={16} color={colors.onAccent} />
                      <Text style={styles.btnText}>Choose audio</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondary} onPress={() => preview(t.kind)}>
                  <View style={styles.btnInner}>
                    <Ionicons name="play-outline" size={16} color={colors.accent} />
                    <Text style={styles.secondaryText}>Preview</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {storage && (
            <View style={styles.card}>
              <Text style={styles.label}>Local storage</Text>
              <Text style={styles.desc}>{storage.note}</Text>
              <Text style={styles.path} numberOfLines={2}>
                {storage.dataDir}
              </Text>
              <Text style={styles.hint}>Platform: {Platform.OS}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </AppShell>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    inner: { padding: 16, paddingBottom: 40 },
    wrap: { width: '100%', maxWidth: 480, gap: 10 },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
      alignSelf: 'flex-start',
    },
    back: { color: colors.info, fontWeight: '600', fontSize: 13 },
    sub: { color: colors.textMuted, lineHeight: 18, fontSize: 13, marginBottom: 4 },
    msg: {
      color: colors.accent,
      backgroundColor: colors.successBg,
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border,
      fontSize: 13,
      fontWeight: '600',
    },
    card: {
      backgroundColor: colors.bgCard,
      borderRadius: spacing.cardRadius,
      padding: spacing.cardPad,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    iconBox: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: colors.accentDim,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: { color: colors.text, fontWeight: '800', fontSize: 15 },
    desc: { color: colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 16 },
    value: { color: colors.text, fontSize: 13, fontWeight: '600' },
    path: { color: colors.info, fontSize: 12 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
    btn: {
      backgroundColor: colors.accent,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      paddingHorizontal: spacing.btnPadH,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 38,
      alignSelf: 'flex-start',
    },
    btnInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    btnText: { color: colors.onAccent, fontWeight: '800', fontSize: spacing.btnFont },
    secondary: {
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      paddingHorizontal: spacing.btnPadH,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
      minHeight: 38,
      alignSelf: 'flex-start',
    },
    secondaryText: { color: colors.accent, fontWeight: '700', fontSize: spacing.btnFont },
    hint: { color: colors.textMuted, fontSize: 12 },
  });
}
