import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { api, TASK_STATUSES, statusLabel, ApiError } from '../api';
import { useTheme, ThemeColors, spacing } from '../theme';
import AppShell from '../components/AppShell';
import FormField from '../components/FormField';
import LoadingView from '../components/LoadingView';
import ReminderPickerModal from '../components/ReminderPickerModal';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatReminderLabel } from '../format';

/** Accepts 2026-07-30T7:40 or 2026-07-30T07:40 — browsers reject single-digit hours. */
function parseReminderLocal(raw: string): Date {
  const s = raw.trim();
  if (!s) throw new Error('Empty reminder');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [, y, mo, d, h, mi, sec] = m;
    const dt = new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(sec || 0),
      0
    );
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  const fallback = new Date(s);
  if (Number.isNaN(fallback.getTime())) {
    throw new Error('Reminder must look like 2026-07-30T07:40');
  }
  return fallback;
}

function formatReminderLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CreateTaskScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const taskId: string | undefined = route?.params?.taskId;
  const editing = Boolean(taskId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string>('pending');
  const [users, setUsers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [checklistText, setChecklistText] = useState('');
  const [checklist, setChecklist] = useState<string[]>([]);
  const [existingChecklist, setExistingChecklist] = useState<any[]>([]);
  const [remindersLocal, setRemindersLocal] = useState<string[]>(['']);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgError, setMsgError] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const [u, t] = await Promise.all([api.users(), api.teams()]);
        setUsers(u.users || []);
        setTeams(t.teams || []);

        if (taskId) {
          const data = await api.task(taskId);
          const task = data.task;
          setTitle(task.title || '');
          setDescription(task.description || '');
          setStatus(task.status || 'pending');
          setAssigneeIds((task.assignees || []).map((a: any) => a.id));
          setTeamIds((task.teams || []).map((tm: any) => tm.id));
          setExistingChecklist(task.checklist || []);
          const fromList = (task.reminders || [])
            .map((r: any) => formatReminderLocal(r.at))
            .filter(Boolean);
          if (fromList.length) setRemindersLocal(fromList);
          else if (task.reminderAt) setRemindersLocal([formatReminderLocal(task.reminderAt)]);
          else setRemindersLocal(['']);
        }
      } catch (e: any) {
        setMsgError(true);
        setMsg(e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [taskId]);

  function toggle(list: string[], id: string, setter: (v: string[]) => void) {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function showMsg(text: string, isError = false) {
    setMsgError(isError);
    setMsg(text);
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = 'Title is required';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save() {
    if (!validate()) {
      showMsg('Please fix the highlighted fields', true);
      return;
    }
    try {
      setBusy(true);
      showMsg(editing ? 'Updating task…' : 'Saving task…', false);
      const reminders: string[] = [];
      for (const raw of remindersLocal) {
        if (!raw.trim()) continue;
        reminders.push(parseReminderLocal(raw).toISOString());
      }

      if (editing && taskId) {
        await api.updateTask(taskId, {
          title: title.trim(),
          description,
          status,
          assigneeIds,
          teamIds,
          reminders,
        });
        showMsg('Task updated.', false);
      } else {
        await api.createTask({
          title: title.trim(),
          description,
          status,
          assigneeIds,
          teamIds,
          checklist,
          reminders,
        });
        showMsg('Task saved. Returning to list…', false);
      }
      setTimeout(() => {
        if (navigation.canGoBack?.()) navigation.goBack();
        else navigation.navigate('Tasks');
      }, 400);
    } catch (e: any) {
      if (e instanceof ApiError && e.fields) {
        setFieldErrors(e.fields);
      }
      showMsg(e.message || (editing ? 'Failed to update task' : 'Failed to create task'), true);
    } finally {
      setBusy(false);
    }
  }

  async function addChecklistItem() {
    const text = checklistText.trim();
    if (!text) return;
    if (editing && taskId) {
      try {
        const data = await api.addChecklist(taskId, text);
        if (data?.item) setExistingChecklist((list) => [...list, data.item]);
        else setExistingChecklist((list) => [...list, { id: `tmp-${Date.now()}`, text, isChecked: false }]);
        setChecklistText('');
      } catch (e: any) {
        showMsg(e.message || 'Failed to add checklist item', true);
      }
      return;
    }
    setChecklist((c) => [...c, text]);
    setChecklistText('');
  }

  if (loading) {
    return (
      <AppShell navigation={navigation} active="Tasks" title={editing ? 'Edit task' : 'Create task'}>
        <LoadingView label="Loading…" />
      </AppShell>
    );
  }

  return (
    <AppShell navigation={navigation} active="Tasks" title={editing ? 'Edit task' : 'Create task'}>
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity
        style={styles.backRow}
        onPress={() => {
          if (navigation.canGoBack?.()) navigation.goBack();
          else navigation.navigate('Tasks');
        }}
      >
        <Ionicons name="arrow-back" size={18} color={colors.info} />
        <Text style={styles.back}>Back to tasks</Text>
      </TouchableOpacity>

      {!!msg && (
        <Text style={[styles.banner, msgError ? styles.bannerErr : styles.bannerOk]}>{msg}</Text>
      )}

      <FormField
        label="Title"
        required
        error={fieldErrors.title}
        value={title}
        onChangeText={(t) => {
          setTitle(t);
          if (fieldErrors.title) setFieldErrors((fe) => ({ ...fe, title: '' }));
        }}
        placeholder="Task title"
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
        multiline
        value={description}
        onChangeText={setDescription}
        placeholderTextColor={colors.textMuted}
        placeholder="Details"
      />

      <Text style={styles.label}>Status</Text>
      <View style={styles.chips}>
        {TASK_STATUSES.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.chip, status === s && styles.chipOn]}
            onPress={() => setStatus(s)}
          >
            <Text style={[styles.chipText, status === s && styles.chipTextOn]}>
              {statusLabel(s)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Assign individuals</Text>
      <View style={styles.chips}>
        {users.map((u) => (
          <TouchableOpacity
            key={u.id}
            style={[styles.chip, assigneeIds.includes(u.id) && styles.chipOn]}
            onPress={() => toggle(assigneeIds, u.id, setAssigneeIds)}
          >
            <Text style={[styles.chipText, assigneeIds.includes(u.id) && styles.chipTextOn]}>
              {u.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Assign teams</Text>
      <View style={styles.chips}>
        {teams.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.chip, teamIds.includes(t.id) && styles.chipOn]}
            onPress={() => toggle(teamIds, t.id, setTeamIds)}
          >
            <Text style={[styles.chipText, teamIds.includes(t.id) && styles.chipTextOn]}>
              {t.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Checklist</Text>
      {editing
        ? existingChecklist.map((item) => (
            <View key={item.id} style={styles.checkItem}>
              <View style={[styles.box, item.isChecked && styles.boxOn]}>
                {item.isChecked ? <Text style={styles.tick}>✓</Text> : null}
              </View>
              <Text style={[styles.checkItemText, item.isChecked && styles.checkDone]}>
                {item.text}
              </Text>
              <Text style={styles.checkState}>{item.isChecked ? 'Marked' : 'Unmarked'}</Text>
            </View>
          ))
        : checklist.map((c, i) => (
            <Text key={i} style={styles.checkLine}>
              • {c}
            </Text>
          ))}
      {editing && existingChecklist.length === 0 ? (
        <Text style={styles.hint}>No checklist items yet.</Text>
      ) : null}
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={checklistText}
          onChangeText={setChecklistText}
          placeholder="Add checklist point"
          placeholderTextColor={colors.textMuted}
        />
        <TouchableOpacity style={styles.addBtn} onPress={addChecklistItem}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Reminders (local time on this device)</Text>
      {remindersLocal.map((value, index) => (
        <View key={index} style={styles.row}>
          <TouchableOpacity
            style={[styles.input, styles.reminderBtn, { flex: 1 }]}
            onPress={() => setPickerIndex(index)}
          >
            <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
            <Text style={value ? styles.reminderValue : styles.reminderPlaceholder}>
              {value ? formatReminderLabel(value) : 'Tap to pick date & time'}
            </Text>
          </TouchableOpacity>
          {remindersLocal.length > 1 ? (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setRemindersLocal((list) => list.filter((_, i) => i !== index))}
            >
              <Ionicons name="trash-outline" size={14} color={colors.danger} />
              <Text style={[styles.addBtnText, { color: colors.danger }]}>Remove</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
      <TouchableOpacity
        style={[styles.addBtn, { alignSelf: 'flex-start', marginTop: 8 }]}
        onPress={() => setRemindersLocal((list) => [...list, ''])}
      >
        <Ionicons name="add-outline" size={16} color={colors.accent} />
        <Text style={styles.addBtnText}>Add another reminder</Text>
      </TouchableOpacity>
      <Text style={styles.hint}>
        Assignees are notified when the task is created
        {editing ? ' or updated' : ''} and when each reminder is due.
      </Text>

      <TouchableOpacity style={styles.save} onPress={save} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.saveText}>
            {editing ? 'Save changes' : 'Create & notify assignees'}
          </Text>
        )}
      </TouchableOpacity>

      <ReminderPickerModal
        visible={pickerIndex != null}
        value={pickerIndex != null ? remindersLocal[pickerIndex] || '' : ''}
        onClose={() => setPickerIndex(null)}
        onSave={(local) => {
          if (pickerIndex == null) return;
          setRemindersLocal((list) => list.map((v, i) => (i === pickerIndex ? local : v)));
        }}
      />
    </ScrollView>
    </AppShell>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    back: { color: colors.info, fontWeight: '600' },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    banner: {
      borderRadius: 10,
      padding: 10,
      marginBottom: 10,
      borderWidth: 1,
      fontWeight: '600',
      fontSize: 13,
    },
    bannerOk: {
      color: colors.accent,
      backgroundColor: colors.bgCard,
      borderColor: colors.border,
    },
    bannerErr: {
      color: colors.danger,
      backgroundColor: colors.errorBg,
      borderColor: colors.danger,
    },
    label: {
      color: colors.textMuted,
      marginTop: 12,
      marginBottom: 6,
      fontWeight: '600',
      fontSize: 12,
    },
    input: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.inputRadius,
      paddingHorizontal: spacing.inputPadH,
      paddingVertical: spacing.inputPadV,
      color: colors.text,
      fontSize: spacing.inputFont,
      minHeight: 38,
    },
    reminderBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    reminderValue: { color: colors.text, fontSize: spacing.inputFont, flex: 1 },
    reminderPlaceholder: { color: colors.textMuted, fontSize: spacing.inputFont, flex: 1 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: colors.bgElevated,
    },
    chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { color: colors.text, textTransform: 'capitalize', fontSize: 12 },
    chipTextOn: { color: colors.onAccent, fontWeight: '700' },
    row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    addBtn: {
      backgroundColor: colors.bgCard,
      borderRadius: spacing.btnRadius,
      paddingHorizontal: spacing.btnPadH,
      paddingVertical: spacing.btnPadV,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    addBtnText: { color: colors.accent, fontWeight: '700', fontSize: spacing.btnFont },
    checkLine: { color: colors.text, marginTop: 4, fontSize: 13 },
    checkItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
      paddingVertical: 8,
      paddingHorizontal: 10,
      backgroundColor: colors.bgCard,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.cardRadius,
    },
    checkItemText: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1, minWidth: 0 },
    checkDone: { textDecorationLine: 'line-through', color: colors.textMuted },
    checkState: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
    box: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 2,
      borderColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxOn: { backgroundColor: colors.accent },
    tick: { color: colors.onAccent, fontWeight: '900', fontSize: 11, lineHeight: 12 },
    hint: { color: colors.textMuted, fontSize: 11, marginTop: 6, lineHeight: 16 },
    save: {
      marginTop: 18,
      backgroundColor: colors.accent,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      alignItems: 'center',
      minHeight: 38,
      justifyContent: 'center',
    },
    saveText: { color: colors.onAccent, fontWeight: '800', fontSize: spacing.btnFont },
  });
}
