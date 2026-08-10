import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../api';
import { useTheme, ThemeColors, spacing } from '../theme';
import { useAuth } from '../auth';
import PasswordField from '../components/PasswordField';
import FormField from '../components/FormField';
import LoadingView from '../components/LoadingView';
import AppShell from '../components/AppShell';

export default function EmailSettingsScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
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
    api
      .getSmtp()
      .then((d) => {
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
      })
      .catch((e) => {
        setErr(true);
        setMsg(e.message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (user?.role !== 'admin') {
    return (
      <AppShell navigation={navigation} active="Settings" title="Email / SMTP">
        <View style={styles.inner}>
          <Text style={styles.title}>Admin only</Text>
        </View>
      </AppShell>
    );
  }

  async function save() {
    try {
      setBusy(true);
      setMsg('');
      setErr(false);
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
      setErr(true);
      setMsg(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function useEthereal() {
    try {
      setBusy(true);
      setMsg('');
      setErr(false);
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
      setErr(true);
      setMsg(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    try {
      setBusy(true);
      setMsg('');
      setErr(false);
      const r = await api.testSmtp(user?.email);
      setMsg(
        r.preview ? `Test sent. Preview: ${r.preview}` : `Test email sent to ${user?.email}`
      );
    } catch (e: any) {
      setErr(true);
      setMsg(e.message || 'Test failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <AppShell navigation={navigation} active="Settings" title="Email / SMTP">
        <LoadingView label="Loading SMTP…" />
      </AppShell>
    );
  }

  return (
    <AppShell
      navigation={navigation}
      active="Settings"
      title="Email / SMTP"
      info="Free SMTP credentials are required for real email. Use Ethereal for testing, or Gmail/Outlook app passwords for delivery. Settings stay on this device."
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={18} color={colors.info} />
            <Text style={styles.back}>Back to settings</Text>
          </TouchableOpacity>

          <Text style={styles.sub}>
            1) Ethereal free test inbox (ethereal.email){'\n'}
            2) Gmail/Outlook SMTP with an app password
          </Text>

          {!!msg && (
            <Text style={[styles.msg, err ? styles.msgErr : styles.msgOk]}>{msg}</Text>
          )}

          <TouchableOpacity style={styles.btn} onPress={useEthereal} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <View style={styles.btnInner}>
                <Ionicons name="flask-outline" size={16} color={colors.onAccent} />
                <Text style={styles.btnText}>Create Ethereal test SMTP</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.row}>
            <Text style={styles.toggleLabel}>Enable email sending</Text>
            <Switch
              value={form.enabled}
              onValueChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              trackColor={{ true: colors.accentDim, false: colors.border }}
              thumbColor={form.enabled ? colors.accent : colors.textMuted}
            />
          </View>

          <FormField
            label="SMTP host"
            value={form.host}
            onChangeText={(v) => setForm((f) => ({ ...f, host: v }))}
            placeholder="smtp.gmail.com"
            autoCapitalize="none"
          />

          <FormField
            label="Port"
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
            keyboardType="number-pad"
          />

          <View style={styles.row}>
            <Text style={styles.toggleLabel}>Secure (SSL on connect)</Text>
            <Switch
              value={form.secure}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  secure: v,
                  port: v && f.port === '587' ? '465' : !v && f.port === '465' ? '587' : f.port,
                }))
              }
              trackColor={{ true: colors.accentDim, false: colors.border }}
              thumbColor={form.secure ? colors.accent : colors.textMuted}
            />
          </View>
          <Text style={styles.hintInline}>
            Port 587 → Secure OFF. Port 465 → Secure ON. Wrong combo causes SSL WRONG_VERSION_NUMBER.
          </Text>

          <FormField
            label="Username / email"
            value={form.user}
            onChangeText={(v) => setForm((f) => ({ ...f, user: v }))}
            placeholder="you@gmail.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <FormField
            label={`Password / app password${form.hasPassword ? ' (saved)' : ''}`}
          >
            <PasswordField
              value={form.pass}
              onChangeText={(v) => setForm((f) => ({ ...f, pass: v }))}
              placeholder={form.hasPassword ? 'Leave blank to keep saved' : 'App password'}
            />
          </FormField>

          <FormField
            label="From address"
            value={form.from}
            onChangeText={(v) => setForm((f) => ({ ...f, from: v }))}
            placeholder="same as username"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <View style={styles.actions}>
            <TouchableOpacity style={styles.btn} onPress={save} disabled={busy}>
              {busy ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <View style={styles.btnInner}>
                  <Ionicons name="save-outline" size={16} color={colors.onAccent} />
                  <Text style={styles.btnText}>Save SMTP</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondary} onPress={test} disabled={busy}>
              <View style={styles.btnInner}>
                <Ionicons name="send-outline" size={16} color={colors.accent} />
                <Text style={styles.secondaryText}>Send test email</Text>
              </View>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            Gmail: enable 2FA → App Password → smtp.gmail.com:587. Outlook: smtp.office365.com:587.
          </Text>
        </View>
      </ScrollView>
    </AppShell>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    inner: { padding: 16, paddingBottom: 40, alignItems: 'flex-start' },
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
    title: { color: colors.text, fontSize: 22, fontWeight: '800' },
    sub: { color: colors.textMuted, lineHeight: 18, marginBottom: 10, fontSize: 13 },
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
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginVertical: 8,
      gap: 12,
    },
    toggleLabel: { color: colors.text, fontWeight: '600', fontSize: 13, flex: 1 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    btn: {
      backgroundColor: colors.accent,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      paddingHorizontal: spacing.btnPadH,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 38,
      alignSelf: 'flex-start',
      marginTop: 4,
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
      marginTop: 4,
    },
    secondaryText: { color: colors.accent, fontWeight: '700', fontSize: spacing.btnFont },
    hint: { color: colors.textMuted, marginTop: 12, fontSize: 12, lineHeight: 17 },
    hintInline: {
      color: colors.warn,
      fontSize: 11,
      lineHeight: 16,
      marginBottom: 8,
      marginTop: -2,
    },
  });
}
