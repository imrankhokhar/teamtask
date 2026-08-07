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
import { api } from '../api';
import { useAuth } from '../auth';
import { useTheme, ThemeColors } from '../theme';
import LoadingView from '../components/LoadingView';
import { useConfirm } from '../components/ConfirmModal';

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
          borderRadius: 12,
          padding: 12,
          color: colors.text,
          marginBottom: 8,
          fontSize: 14,
          outline: 'none',
          fontFamily: 'inherit',
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
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getEmailTemplates();
      setTemplates(data.templates || []);
      setPlaceholders(data.placeholders || []);
      setSelectedKey((prev) => prev || data.templates?.[0]?.key || null);
    } catch (e: any) {
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
      const data = await api.resetEmailTemplates();
      setTemplates(data.templates || []);
      setMsg('Templates reset to defaults');
    } catch (e: any) {
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
    return <LoadingView label="Loading templates…" fullScreen />;
  }

  return (
    <>
      <ScrollView
        style={styles.root}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back to settings</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Email templates</Text>
        <Text style={styles.sub}>
          Customize outbound emails. Admin/HOD replies use a different template from member replies.
          Create a role named HOD (or Manager/Lead) to use the lead reply template.
        </Text>

        {!!msg && <Text style={styles.msg}>{msg}</Text>}

        <Text style={styles.hint}>Placeholders: {placeholders.join(' ')}</Text>

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
            <Text style={styles.formTitle}>{selected.label}</Text>
            <Text style={styles.meta}>{selected.description}</Text>

            <View style={styles.row}>
              <Text style={styles.label}>Enabled</Text>
              <Switch
                value={selected.enabled !== false}
                disabled={!canEdit}
                onValueChange={(v) => patchSelected({ enabled: v })}
                trackColor={{ true: colors.accentDim }}
              />
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
          <>
            <TouchableOpacity style={styles.btn} onPress={save} disabled={busy}>
              {busy ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.btnText}>Save templates</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondary} onPress={resetAll} disabled={busy}>
              <Text style={styles.secondaryText}>Reset all to defaults</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.hint}>Only admins can edit templates.</Text>
        )}
      </ScrollView>
      {dialog}
    </>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    back: { color: colors.info, marginTop: Platform.OS === 'web' ? 12 : 48 },
    title: { color: colors.text, fontSize: 26, fontWeight: '800', marginVertical: 8 },
    sub: { color: colors.textMuted, lineHeight: 20, marginBottom: 12 },
    msg: {
      color: colors.accent,
      backgroundColor: colors.bgCard,
      borderRadius: 10,
      padding: 10,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 12 },
    section: { marginBottom: 10 },
    sectionTitle: { color: colors.text, fontWeight: '700', marginBottom: 8 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.bgElevated,
    },
    chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipOff: { opacity: 0.55 },
    chipText: { color: colors.text, fontSize: 12 },
    chipTextOn: { color: colors.onAccent, fontWeight: '700' },
    form: {
      backgroundColor: colors.bgCard,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 8,
      marginBottom: 12,
    },
    formTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
    meta: { color: colors.textMuted, marginTop: 4, marginBottom: 10, lineHeight: 18 },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    label: { color: colors.textMuted, marginBottom: 6, marginTop: 8, fontWeight: '600' },
    input: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      color: colors.text,
      marginBottom: 8,
    },
    btn: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      minHeight: 50,
      justifyContent: 'center',
    },
    btnText: { color: colors.onAccent, fontWeight: '800' },
    secondary: {
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 10,
    },
    secondaryText: { color: colors.accent, fontWeight: '700' },
  });
}
