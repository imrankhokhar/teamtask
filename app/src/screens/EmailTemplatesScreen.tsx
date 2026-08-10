import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../api';
import { useAuth } from '../auth';
import { useTheme, ThemeColors, spacing } from '../theme';
import LoadingView from '../components/LoadingView';
import { useConfirm } from '../components/ConfirmModal';
import AppShell from '../components/AppShell';

function Field({
  value,
  onChangeText,
  placeholder,
  multiline,
  colors,
  styles,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  if (Platform.OS === 'web') {
    const Tag: any = multiline ? 'textarea' : 'input';
    return (
      <Tag
        value={value}
        placeholder={placeholder}
        onChange={(e: any) => onChangeText(e.target.value)}
        rows={multiline ? 8 : undefined}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          backgroundColor: colors.bgElevated,
          border: `1px solid ${colors.border}`,
          borderRadius: spacing.inputRadius,
          padding: `${spacing.inputPadV}px ${spacing.inputPadH}px`,
          color: colors.text,
          marginBottom: 6,
          fontSize: spacing.inputFont,
          outline: 'none',
          fontFamily: 'inherit',
          minHeight: multiline ? 140 : 38,
          resize: multiline ? 'vertical' : undefined,
        }}
      />
    );
  }
  return (
    <TextInput
      style={[styles.input, multiline && { minHeight: 140, textAlignVertical: 'top' }]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      multiline={multiline}
    />
  );
}

export default function EmailTemplatesScreen({ navigation }: any) {
  const { can, isAdmin } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { confirm, dialog } = useConfirm();
  const [templates, setTemplates] = useState<any[]>([]);
  const [placeholders, setPlaceholders] = useState<string[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getEmailTemplates();
      setTemplates(data.templates || []);
      setPlaceholders(data.placeholders || []);
      setSelectedKey((prev) => prev || data.templates?.[0]?.key || null);
    } catch (e: any) {
      setErr(true);
      setMsg(e.message || 'Failed to load templates');
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const selected = templates.find((t) => t.key === selectedKey) || null;
  const canEdit = isAdmin || can('settings.edit');

  function patchSelected(patch: Record<string, any>) {
    setTemplates((rows) =>
      rows.map((t) => (t.key === selectedKey ? { ...t, ...patch } : t))
    );
  }

  async function save() {
    if (!canEdit) return;
    try {
      setBusy(true);
      setMsg('');
      setErr(false);
      const data = await api.saveEmailTemplates({
        templates: templates.map((t) => ({
          key: t.key,
          subject: t.subject,
          body: t.body,
          enabled: t.enabled,
        })),
      });
      setTemplates(data.templates || templates);
      setMsg('Templates saved. Emails will use these texts when SMTP is enabled.');
    } catch (e: any) {
      setErr(true);
      setMsg(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function resetAll() {
    if (!canEdit) return;
    const ok = await confirm({
      title: 'Reset templates',
      message: 'Reset all email templates to defaults? Your custom wording will be lost.',
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    try {
      setBusy(true);
      setErr(false);
      const data = await api.resetEmailTemplates();
      setTemplates(data.templates || []);
      setMsg('Templates reset to defaults');
    } catch (e: any) {
      setErr(true);
      setMsg(e.message || 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  const categories = [
    { key: 'replies', label: 'Replies (Admin/HOD vs Member)' },
    { key: 'teams', label: 'Teams' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'checklist', label: 'Checklist' },
    { key: 'reminders', label: 'Reminders' },
  ];

  if (!loaded) {
    return (
      <AppShell navigation={navigation} active="Settings" title="Email templates">
        <LoadingView label="Loading templates…" />
      </AppShell>
    );
  }

  return (
    <AppShell
      navigation={navigation}
      active="Settings"
      title="Email templates"
      info="Customize outbound emails. Admin/HOD replies use a different template from member replies. Create a role named HOD (or Manager/Lead) for the lead reply template."
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.wrap}>
          <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={18} color={colors.info} />
            <Text style={styles.back}>Back to settings</Text>
          </TouchableOpacity>

          {!!msg && (
            <Text style={[styles.msg, err ? styles.msgErr : styles.msgOk]}>{msg}</Text>
          )}

          <View style={styles.placeholderBox}>
            <Text style={styles.placeholderTitle}>Placeholders</Text>
            <Text style={styles.hint}>{placeholders.join('  ')}</Text>
          </View>

          {categories.map((cat) => {
            const items = templates.filter((t) => t.category === cat.key);
            if (!items.length) return null;
            return (
              <View key={cat.key} style={styles.section}>
                <Text style={styles.sectionTitle}>{cat.label}</Text>
                <View style={styles.chips}>
                  {items.map((t) => {
                    const on = selectedKey === t.key;
                    return (
                      <TouchableOpacity
                        key={t.key}
                        style={[styles.chip, on && styles.chipOn, !t.enabled && styles.chipOff]}
                        onPress={() => setSelectedKey(t.key)}
                      >
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>{t.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {selected ? (
            <View style={styles.form}>
              <View style={styles.formHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formTitle}>{selected.label}</Text>
                  <Text style={styles.meta}>{selected.description}</Text>
                </View>
                <View style={styles.enabledRow}>
                  <Text style={styles.labelInline}>Enabled</Text>
                  <Switch
                    value={selected.enabled !== false}
                    disabled={!canEdit}
                    onValueChange={(v) => patchSelected({ enabled: v })}
                    trackColor={{ true: colors.accentDim, false: colors.border }}
                    thumbColor={selected.enabled !== false ? colors.accent : colors.textMuted}
                  />
                </View>
              </View>

              <Text style={styles.label}>Subject</Text>
              <Field
                value={selected.subject || ''}
                onChangeText={(v) => patchSelected({ subject: v })}
                placeholder="Email subject"
                colors={colors}
                styles={styles}
              />

              <Text style={styles.label}>Body</Text>
              <Field
                value={selected.body || ''}
                onChangeText={(v) => patchSelected({ body: v })}
                placeholder="Email body"
                multiline
                colors={colors}
                styles={styles}
              />
            </View>
          ) : null}

          {canEdit ? (
            <View style={styles.actions}>
              <TouchableOpacity style={styles.btn} onPress={save} disabled={busy}>
                {busy ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <View style={styles.btnInner}>
                    <Ionicons name="save-outline" size={16} color={colors.onAccent} />
                    <Text style={styles.btnText}>Save templates</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondary} onPress={resetAll} disabled={busy}>
                <View style={styles.btnInner}>
                  <Ionicons name="refresh-outline" size={16} color={colors.accent} />
                  <Text style={styles.secondaryText}>Reset defaults</Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.hint}>Only admins can edit templates.</Text>
          )}
        </View>
      </ScrollView>
      {dialog}
    </AppShell>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    inner: { padding: 16, paddingBottom: 48 },
    wrap: { width: '100%', maxWidth: 640, gap: 8 },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
      alignSelf: 'flex-start',
    },
    back: { color: colors.info, fontWeight: '600', fontSize: 13 },
    msg: {
      borderRadius: 10,
      padding: 10,
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
    placeholderBox: {
      backgroundColor: colors.bgElevated,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 10,
      marginBottom: 4,
    },
    placeholderTitle: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 12,
      marginBottom: 4,
    },
    hint: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
    section: { marginBottom: 4 },
    sectionTitle: {
      color: colors.textMuted,
      fontWeight: '700',
      marginBottom: 6,
      fontSize: 12,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: colors.bgCard,
    },
    chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipOff: { opacity: 0.55 },
    chipText: { color: colors.text, fontSize: 12 },
    chipTextOn: { color: colors.onAccent, fontWeight: '700' },
    form: {
      backgroundColor: colors.bgCard,
      borderRadius: spacing.cardRadius,
      padding: spacing.cardPad,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 4,
    },
    formHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 8,
    },
    formTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
    meta: { color: colors.textMuted, marginTop: 4, lineHeight: 17, fontSize: 12 },
    enabledRow: { alignItems: 'center', gap: 4 },
    labelInline: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
    label: {
      color: colors.textMuted,
      marginBottom: 5,
      marginTop: 8,
      fontWeight: '700',
      fontSize: spacing.labelFont,
    },
    input: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.inputRadius,
      paddingHorizontal: spacing.inputPadH,
      paddingVertical: spacing.inputPadV,
      color: colors.text,
      marginBottom: 6,
      fontSize: spacing.inputFont,
      minHeight: 38,
    },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
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
  });
}
