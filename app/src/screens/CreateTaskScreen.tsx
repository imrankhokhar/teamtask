import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { api, TASK_STATUSES, statusLabel } from '../api';
import { colors } from '../theme';

/** Accepts 2026-07-30T7:40 or 2026-07-30T07:40 — browsers reject single-digit hours. */
function parseReminderLocal(raw: string): Date {
  const s = raw.trim();
  if (!s) throw new Error('Empty reminder');
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );
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

export default function CreateTaskScreen({ navigation }: any) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string>('pending');
  const [users, setUsers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [checklistText, setChecklistText] = useState('');
  const [checklist, setChecklist] = useState<string[]>([]);
  const [reminderLocal, setReminderLocal] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgError, setMsgError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [u, t] = await Promise.all([api.users(), api.teams()]);
        setUsers(u.users || []);
        setTeams(t.teams || []);
      } catch (e: any) {
        setMsgError(true);
        setMsg(e.message || 'Failed to load users/teams');
      }
    })();
  }, []);

  function toggle(list: string[], id: string, setter: (v: string[]) => void) {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function showMsg(text: string, isError = false) {
    setMsgError(isError);
    setMsg(text);
  }

  async function save() {
    if (!title.trim()) {
      showMsg('Title is required', true);
      return;
    }
    try {
      setBusy(true);
      showMsg('Saving task…', false);
      let reminderAt: string | null = null;
      if (reminderLocal.trim()) {
        const d = parseReminderLocal(reminderLocal);
        reminderAt = d.toISOString();
      }
      await api.createTask({
        title: title.trim(),
        description,
        status,
        assigneeIds,
        teamIds,
        checklist,
        reminderAt,
      });
      showMsg('Task saved. Returning to list…', false);
      setTimeout(() => {
        if (navigation.canGoBack?.()) navigation.goBack();
        else navigation.navigate('Tasks');
      }, 400);
    } catch (e: any) {
      showMsg(e.message || 'Failed to create task', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity
        onPress={() => {
          if (navigation.canGoBack?.()) navigation.goBack();
          else navigation.navigate('Tasks');
        }}
      >
        <Text style={styles.back}>← Back to tasks</Text>
      </TouchableOpacity>

      <Text style={styles.h1}>Create task</Text>

      {!!msg && (
        <Text style={[styles.banner, msgError ? styles.bannerErr : styles.bannerOk]}>{msg}</Text>
      )}

      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholderTextColor={colors.textMuted}
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
            <Text style={[styles.chipText, status === s && styles.chipTextOn]}>{statusLabel(s)}</Text>
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
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={checklistText}
          onChangeText={setChecklistText}
          placeholder="Add checklist point"
          placeholderTextColor={colors.textMuted}
        />
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            if (!checklistText.trim()) return;
            setChecklist((c) => [...c, checklistText.trim()]);
            setChecklistText('');
          }}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      {checklist.map((c, i) => (
        <Text key={i} style={styles.checkLine}>
          • {c}
        </Text>
      ))}

      <Text style={styles.label}>Reminder (local time on this device)</Text>
      <TextInput
        style={styles.input}
        value={reminderLocal}
        onChangeText={setReminderLocal}
        placeholder="YYYY-MM-DDTHH:mm  e.g. 2026-07-30T07:40"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
      />
      <Text style={styles.hint}>
        Use two-digit hour if needed (07:40). Assignees get an alert when set and when due.
        {Platform.OS === 'web' ? ' Desktop also shows a system notification when allowed.' : ''}
      </Text>

      <TouchableOpacity style={styles.save} onPress={save} disabled={busy}>
        <Text style={styles.saveText}>{busy ? 'Saving…' : 'Create & notify assignees'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  back: { color: colors.info, marginTop: Platform.OS === 'web' ? 12 : 48, marginBottom: 4 },
  h1: { color: colors.text, fontSize: 26, fontWeight: '800', marginBottom: 12 },
  banner: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    fontWeight: '600',
  },
  bannerOk: {
    color: colors.accent,
    backgroundColor: colors.bgCard,
    borderColor: colors.border,
  },
  bannerErr: {
    color: colors.danger,
    backgroundColor: colors.bgCard,
    borderColor: colors.danger,
  },
  label: { color: colors.textMuted, marginTop: 14, marginBottom: 8, fontWeight: '600' },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
  },
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
  chipText: { color: colors.text, textTransform: 'capitalize', fontSize: 13 },
  chipTextOn: { color: '#062016', fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addBtn: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addBtnText: { color: colors.accent, fontWeight: '700' },
  checkLine: { color: colors.text, marginTop: 6 },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: 8, lineHeight: 18 },
  save: {
    marginTop: 24,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#062016', fontWeight: '800', fontSize: 16 },
});
