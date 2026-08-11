import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getApiBaseUrl, setApiBaseUrl, api, refreshApiUrl } from '../api';
import { useTheme, ThemeColors, spacing } from '../theme';
import { useAuth } from '../auth';
import FormField from '../components/FormField';
import AppShell from '../components/AppShell';

export default function ConnectionScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [url, setUrl] = useState('');
  const [lan, setLan] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState(false);

  useEffect(() => {
    (async () => {
      setUrl(await getApiBaseUrl());
      try {
        const info = await api.lanInfo();
        setLan(info);
      } catch {
        // server may be unreachable until URL is fixed
      }
    })();
  }, []);

  async function save() {
    try {
      setBusy(true);
      setMsg('');
      setErr(false);
      await setApiBaseUrl(url);
      await refreshApiUrl();
      const health = await api.lanInfo().catch(() => null);
      if (!health) {
        const base = await getApiBaseUrl();
        const res = await fetch(`${base}/api/health`);
        if (!res.ok) throw new Error('Cannot reach server');
      } else {
        setLan(health);
      }
      setMsg('Server URL saved and reachable.');
      if (Platform.OS !== 'web') {
        Alert.alert('Connected', 'Server URL saved.');
      }
      if (navigation.canGoBack?.()) navigation.goBack();
    } catch (e: any) {
      const detail = `${e.message}\n\nFor shared cloud: use your https://….onrender.com URL.\nFor local hub: use the PC LAN URL on the same Wi‑Fi.`;
      setErr(true);
      setMsg(detail);
      if (Platform.OS !== 'web') {
        Alert.alert('Cannot connect', detail);
      }
    } finally {
      setBusy(false);
    }
  }

  const cloudMode = Boolean(lan?.cloudMode || (url || '').startsWith('https://'));

  const body = (
    <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        {navigation?.canGoBack?.() ? (
          <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={18} color={colors.info} />
            <Text style={styles.back}>{user ? 'Back to settings' : 'Back'}</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.title}>Server connection</Text>
        <Text style={styles.sub}>
          {cloudMode
            ? 'Shared cloud mode: all devices use the same internet server. Install the EXE only — data is shared automatically.'
            : 'Local hub mode uses one PC on Wi‑Fi. For true shared data without a hub PC, deploy cloud and put that https URL here.'}
          {Platform.OS === 'web' ? ' Desktop follows the page address automatically.' : ''}
        </Text>

        {!!msg && (
          <Text style={[styles.msg, err ? styles.msgErr : styles.msgOk]}>{msg}</Text>
        )}

        <FormField
          label="Server URL"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          placeholder="https://tt.exodevs.com"
          keyboardType="url"
        />

        <TouchableOpacity style={styles.btn} onPress={save} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <View style={styles.btnInner}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.onAccent} />
              <Text style={styles.btnText}>Save & test</Text>
            </View>
          )}
        </TouchableOpacity>

        {lan?.publicUrl ? (
          <View style={styles.listCard}>
            <Text style={styles.listLabel}>Cloud public URL</Text>
            <TouchableOpacity onPress={() => setUrl(lan.publicUrl)}>
              <Text style={styles.link}>{lan.publicUrl}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {lan?.addresses?.length ? (
          <View style={styles.listCard}>
            <Text style={styles.listLabel}>Detected LAN URLs (local hub only)</Text>
            <Text style={styles.listHint}>Tap a URL to use it</Text>
            {lan.addresses.map((a: any) => (
              <TouchableOpacity
                key={a.url}
                style={styles.linkRow}
                onPress={() => setUrl(a.url)}
              >
                <Ionicons name="wifi-outline" size={14} color={colors.accent} />
                <Text style={styles.link}>{a.url}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );

  if (user) {
    return (
      <AppShell
        navigation={navigation}
        active="Settings"
        title="Server connection"
        info="Point the app at your shared cloud URL or local hub address. LAN URLs only work on the same Wi‑Fi as the hub PC."
      >
        {body}
      </AppShell>
    );
  }

  return <View style={styles.root}>{body}</View>;
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    inner: {
      padding: 16,
      paddingBottom: 40,
      alignItems: 'center',
      flexGrow: 1,
      justifyContent: 'center',
    },
    card: {
      width: '100%',
      maxWidth: 480,
      backgroundColor: colors.bgCard,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      gap: 4,
    },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
      alignSelf: 'flex-start',
    },
    back: { color: colors.info, fontWeight: '600', fontSize: 13 },
    title: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 4 },
    sub: { color: colors.textMuted, lineHeight: 18, marginBottom: 12, fontSize: 13 },
    msg: {
      borderRadius: 10,
      padding: 10,
      marginBottom: 8,
      borderWidth: 1,
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 18,
    },
    msgOk: {
      color: colors.accent,
      backgroundColor: colors.successBg,
      borderColor: colors.border,
    },
    msgErr: {
      color: colors.danger,
      backgroundColor: colors.errorBg,
      borderColor: colors.danger,
    },
    btn: {
      backgroundColor: colors.accent,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      paddingHorizontal: spacing.btnPadH,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 38,
      alignSelf: 'flex-start',
      marginTop: 8,
    },
    btnInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    btnText: { color: colors.onAccent, fontWeight: '800', fontSize: spacing.btnFont },
    listCard: {
      marginTop: 14,
      backgroundColor: colors.bgElevated,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    listLabel: { color: colors.text, fontWeight: '700', fontSize: 13 },
    listHint: { color: colors.textMuted, fontSize: 11 },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
    link: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  });
}
