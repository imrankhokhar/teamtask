import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { getApiBaseUrl, setApiBaseUrl, api, refreshApiUrl } from '../api';
import { colors } from '../theme';

export default function ConnectionScreen({ navigation }: any) {
  const [url, setUrl] = useState('');
  const [lan, setLan] = useState<any>(null);
  const [busy, setBusy] = useState(false);

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
      Alert.alert('Connected', 'Server URL saved.');
      navigation.goBack?.();
    } catch (e: any) {
      Alert.alert(
        'Cannot connect',
        `${e.message}\n\nFor shared cloud: use your https://….onrender.com URL.\nFor old local hub: use the PC LAN URL on the same Wi‑Fi.`
      );
    } finally {
      setBusy(false);
    }
  }

  const cloudMode = Boolean(lan?.cloudMode || (url || '').startsWith('https://'));

  return (
    <View style={styles.root}>
      {navigation?.canGoBack?.() ? (
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={styles.title}>Server connection</Text>
      <Text style={styles.sub}>
        {cloudMode
          ? 'Shared cloud mode: all devices use the same internet server. Install the EXE only — data is shared automatically.'
          : 'Local hub mode uses one PC on Wi‑Fi. For true shared data without a hub PC, deploy cloud (CLOUD-SHARED.md) and put that https URL here / in cloud-config.json.'}
        {Platform.OS === 'web' ? ' Desktop follows the page address automatically.' : ''}
      </Text>

      <Text style={styles.label}>Server URL</Text>
      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        placeholder="https://your-app.onrender.com"
        placeholderTextColor={colors.textMuted}
      />

      <TouchableOpacity style={styles.btn} onPress={save} disabled={busy}>
        <Text style={styles.btnText}>{busy ? 'Testing…' : 'Save & test'}</Text>
      </TouchableOpacity>

      {lan?.publicUrl ? (
        <View style={styles.card}>
          <Text style={styles.label}>Cloud public URL</Text>
          <Text style={styles.link}>{lan.publicUrl}</Text>
        </View>
      ) : null}

      {lan?.addresses?.length ? (
        <View style={styles.card}>
          <Text style={styles.label}>Detected LAN URLs (local hub only)</Text>
          {lan.addresses.map((a: any) => (
            <TouchableOpacity key={a.url} onPress={() => setUrl(a.url)}>
              <Text style={styles.link}>{a.url}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  back: { color: colors.info, marginTop: 48 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', marginVertical: 12 },
  sub: { color: colors.textMuted, lineHeight: 20, marginBottom: 16 },
  label: { color: colors.textMuted, marginBottom: 8, fontWeight: '600' },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
    marginBottom: 12,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#062016', fontWeight: '800' },
  card: {
    marginTop: 20,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  link: { color: colors.accent, marginTop: 4 },
});
