import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import { api } from '../api';
import { colors } from '../theme';
import { useAuth } from '../auth';
import PasswordField from '../components/PasswordField';

export default function EmailSettingsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    enabled: false,
    host: '',
    port: '587',
    secure: false,
    user: '',
    pass: '',
    from: '',
    note: '',
    provider: '',
    hasPassword: false,
  });

  useEffect(() => {
    api.getSmtp().then((d) => {
      const s = d.smtp || {};
      setForm((f) => ({
        ...f,
        enabled: Boolean(s.enabled),
        host: s.host || '',
        port: String(s.port || 587),
        secure: Boolean(s.secure),
        user: s.user || '',
        from: s.from || '',
        note: s.note || '',
        provider: s.provider || '',
        hasPassword: Boolean(s.hasPassword),
        pass: '',
      }));
    }).catch((e) => setMsg(e.message));
  }, []);

  if (user?.role !== 'admin') {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Admin only</Text>
      </View>
    );
  }

  async function save() {
    try {
      setBusy(true);
      setMsg('');
      await api.saveSmtp({
        enabled: form.enabled,
        host: form.host,
        port: Number(form.port || 587),
        secure: form.secure,
        user: form.user,
        pass: form.pass || undefined,
        from: form.from || form.user,
        provider: form.provider || 'custom',
        note: form.note,
      });
      setMsg('SMTP saved on this device. Emails will send when enabled.');
      setForm((f) => ({ ...f, pass: '', hasPassword: true }));
    } catch (e: any) {
      setMsg(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function useEthereal() {
    try {
      setBusy(true);
      setMsg('');
      const d = await api.createEtherealSmtp();
      const s = d.smtp || {};
      setForm({
        enabled: true,
        host: s.host || '',
        port: String(s.port || 587),
        secure: Boolean(s.secure),
        user: s.user || '',
        pass: s.pass || '',
        from: s.from || s.user || '',
        note: s.note || '',
        provider: 'ethereal',
        hasPassword: true,
      });
      setMsg(
        'Free Ethereal test SMTP created. Emails appear at ethereal.email (not real inboxes). Use Gmail/Outlook SMTP below for real delivery.'
      );
    } catch (e: any) {
      setMsg(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    try {
      setBusy(true);
      setMsg('');
      const r = await api.testSmtp(user?.email);
      setMsg(
        r.preview
          ? `Test sent. Preview: ${r.preview}`
          : `Test email sent to ${user?.email}`
      );
    } catch (e: any) {
      setMsg(e.message || 'Test failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Email (SMTP)</Text>
      <Text style={styles.sub}>
        Yes — free SMTP credentials are required to send real emails. Options:{'\n'}
        1) Ethereal free test inbox (view at ethereal.email){'\n'}
        2) Your free Gmail/Outlook SMTP (app password){'\n'}
        Settings are stored locally on this device.
      </Text>

      {!!msg && <Text style={styles.msg}>{msg}</Text>}

      <TouchableOpacity style={styles.btn} onPress={useEthereal} disabled={busy}>
        <Text style={styles.btnText}>{busy ? 'Please wait…' : 'Create free Ethereal test SMTP'}</Text>
      </TouchableOpacity>

      <View style={styles.row}>
        <Text style={styles.label}>Enable email sending</Text>
        <Switch
          value={form.enabled}
          onValueChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
          trackColor={{ true: colors.accentDim }}
        />
      </View>

      <Text style={styles.label}>SMTP host</Text>
      <TextInput style={styles.input} value={form.host} onChangeText={(v) => setForm((f) => ({ ...f, host: v }))} placeholder="smtp.gmail.com" placeholderTextColor={colors.textMuted} autoCapitalize="none" />

      <Text style={styles.label}>Port</Text>
      <TextInput
        style={styles.input}
        value={form.port}
        onChangeText={(v) =>
          setForm((f) => {
            const port = v;
            const n = Number(port);
            let secure = f.secure;
            if (n === 465) secure = true;
            if (n === 587 || n === 25 || n === 2525) secure = false;
            return { ...f, port, secure };
          })
        }
        placeholder="587"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
      />

      <View style={styles.row}>
        <Text style={styles.label}>Secure (SSL on connect)</Text>
        <Switch
          value={form.secure}
          onValueChange={(v) =>
            setForm((f) => ({
              ...f,
              secure: v,
              port: v && f.port === '587' ? '465' : !v && f.port === '465' ? '587' : f.port,
            }))
          }
        />
      </View>
      <Text style={styles.hintInline}>
        Port 587 → Secure OFF. Port 465 → Secure ON. Wrong combo causes SSL WRONG_VERSION_NUMBER.
      </Text>
      <Text style={styles.label}>Username / email</Text>
      <TextInput style={styles.input} value={form.user} onChangeText={(v) => setForm((f) => ({ ...f, user: v }))} placeholder="you@gmail.com" placeholderTextColor={colors.textMuted} autoCapitalize="none" />

      <Text style={styles.label}>Password / app password {form.hasPassword ? '(saved)' : ''}</Text>
      <PasswordField
        value={form.pass}
        onChangeText={(v) => setForm((f) => ({ ...f, pass: v }))}
        placeholder={form.hasPassword ? 'Leave blank to keep saved' : 'App password'}
      />
      <Text style={styles.label}>From address</Text>
      <TextInput style={styles.input} value={form.from} onChangeText={(v) => setForm((f) => ({ ...f, from: v }))} placeholder="same as username" placeholderTextColor={colors.textMuted} autoCapitalize="none" />

      <TouchableOpacity style={styles.btn} onPress={save} disabled={busy}>
        <Text style={styles.btnText}>Save SMTP</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={test} disabled={busy}>
        <Text style={styles.secondaryText}>Send test email to me</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>
        Gmail free tip: enable 2FA → create an App Password → host smtp.gmail.com port 587.
        Outlook: smtp.office365.com port 587.
      </Text>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 },
  label: { color: colors.textMuted, marginBottom: 6, marginTop: 8, fontWeight: '600' },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  btnText: { color: '#062016', fontWeight: '800' },
  secondary: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 10,
  },
  secondaryText: { color: colors.accent, fontWeight: '700' },
  hint: { color: colors.textMuted, marginTop: 16, fontSize: 12, lineHeight: 18 },
  hintInline: { color: colors.warn, fontSize: 12, lineHeight: 18, marginBottom: 12, marginTop: -4 },
});
