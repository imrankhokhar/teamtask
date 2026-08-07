import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, TASK_STATUSES, statusLabel } from '../api';
import { useTheme, ThemeColors, statusColors, spacing } from '../theme';
import { useAuth } from '../auth';
import LoadingView from '../components/LoadingView';
import { useConfirm } from '../components/ConfirmModal';
import ReminderPickerModal from '../components/ReminderPickerModal';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatReminderLabel } from '../format';

export default function TaskDetailScreen({ route, navigation }: any) {
  const { id } = route.params;
  const { user, can } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { confirm, dialog } = useConfirm();
  const [task, setTask] = useState<any>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [newCheck, setNewCheck] = useState('');
  const [remindersLocal, setRemindersLocal] = useState<string[]>(['']);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      const data = await api.task(id);
      setTask(data.task);
      const fromList = (data.task.reminders || [])
        .map((r: any) => {
          const d = new Date(r.at);
          if (Number.isNaN(d.getTime())) return '';
          const pad = (n: number) => String(n).padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        })
        .filter(Boolean);
      if (fromList.length) setRemindersLocal(fromList);
      else if (data.task.reminderAt) {
        const d = new Date(data.task.reminderAt);
        const pad = (n: number) => String(n).padStart(2, '0');
        setRemindersLocal([
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
        ]);
      } else {
        setRemindersLocal(['']);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
      navigation.goBack();
    } finally {
      setRefreshing(false);
    }
  }, [id, navigation]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function changeStatus(status: string) {
    try {
      const data = await api.updateTask(id, { status });
      setTask(data.task);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function toggleCheck(item: any) {
    try {
      if (!item.isChecked) {
        await api.checkItem(item.id);
        await load();
        return;
      }
      Alert.prompt
        ? Alert.prompt(
            'Unmark checklist',
            'Reason is required',
            async (reason) => {
              if (!reason?.trim()) return Alert.alert('Reason required');
              try {
                await api.uncheckItem(item.id, reason.trim());
                await load();
              } catch (e: any) {
                Alert.alert('Error', e.message);
              }
            }
          )
        : (() => {
            Alert.alert(
              'Unmark checklist',
              'Enter reason in the reply box, then tap Unmark with reason below the item.'
            );
          })();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function uncheckWithDraft(item: any) {
    const reason = (replyDrafts[item.id] || '').trim();
    if (!reason) return Alert.alert('Enter a reason in the reply field first');
    try {
      await api.uncheckItem(item.id, reason);
      setReplyDrafts((d) => ({ ...d, [item.id]: '' }));
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function sendReply(itemId: string) {
    const message = (replyDrafts[itemId] || '').trim();
    if (!message) return;
    try {
      await api.replyItem(itemId, message);
      setReplyDrafts((d) => ({ ...d, [itemId]: '' }));
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function addChecklist() {
    if (!newCheck.trim()) return;
    try {
      await api.addChecklist(id, newCheck.trim());
      setNewCheck('');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function saveReminder() {
    try {
      const reminders: string[] = [];
      for (const raw of remindersLocal) {
        if (!raw.trim()) continue;
        const normalized = raw.trim().replace(' ', 'T');
        const d = new Date(normalized);
        if (Number.isNaN(d.getTime())) throw new Error(`Invalid reminder: ${raw}`);
        reminders.push(d.toISOString());
      }
      const data = await api.updateTask(id, { reminders });
      setTask(data.task);
      Alert.alert(
        'Reminders saved',
        reminders.length
          ? `${reminders.length} reminder(s) saved. Assignees are alerted when each one is due.`
          : 'All reminders cleared.'
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function deleteTask() {
    const ok = await confirm({
      title: 'Delete task',
      message: `Delete task "${task.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api.deleteTask(id);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  if (!task) {
    return <LoadingView label="Loading…" fullScreen />;
  }

  return (
    <>
      <ScrollView
        style={styles.root}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />
        }
      >
        <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={18} color={colors.info} />
          <Text style={styles.back}>Back</Text>
        </TouchableOpacity>

        <View style={styles.titleRow}>
          <Text style={[styles.title, { flex: 1 }]}>{task.title}</Text>
        </View>
        <Text style={styles.desc}>{task.description || 'No description'}</Text>

        <View
          style={[
            styles.statusPill,
            { backgroundColor: statusColors[task.status] || colors.textMuted },
          ]}
        >
          <Text style={styles.statusPillText}>{statusLabel(task.status)}</Text>
        </View>

        <Text style={styles.label}>Change status (notifies assignees)</Text>
        <View style={styles.chips}>
          {TASK_STATUSES.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.chip, task.status === s && styles.chipOn]}
              onPress={() => changeStatus(s)}
            >
              <Text style={[styles.chipText, task.status === s && styles.chipTextOn]}>
                {statusLabel(s)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>People</Text>
        <Text style={styles.meta}>
          Reporter: {task.reporter?.name}
          {'\n'}
          Assignees: {(task.assignees || []).map((a: any) => a.name).join(', ') || '—'}
          {'\n'}
          Teams: {(task.teams || []).map((t: any) => t.name).join(', ') || '—'}
        </Text>

        <Text style={styles.label}>Reminders</Text>
        {remindersLocal.map((value, index) => (
          <View key={index} style={styles.row}>
            <TouchableOpacity
              style={[styles.input, styles.reminderBtn, { flex: 1, marginTop: 0 }]}
              onPress={() => setPickerIndex(index)}
            >
              <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
              <Text style={value ? styles.reminderValue : styles.reminderPlaceholder}>
                {value ? formatReminderLabel(value) : 'Tap to pick date & time'}
              </Text>
            </TouchableOpacity>
            {remindersLocal.length > 1 ? (
              <TouchableOpacity
                style={styles.miniBtn}
                onPress={() => setRemindersLocal((list) => list.filter((_, i) => i !== index))}
              >
                <Ionicons name="trash-outline" size={14} color={colors.accent} />
                <Text style={styles.miniBtnText}>Remove</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        <TouchableOpacity
          style={[styles.secondaryBtn, { marginTop: 8 }]}
          onPress={() => setRemindersLocal((list) => [...list, ''])}
        >
          <Ionicons name="add-outline" size={16} color={colors.accent} />
          <Text style={styles.secondaryBtnText}>Add another reminder</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={saveReminder}>
          <Ionicons name="notifications-outline" size={16} color={colors.accent} />
          <Text style={styles.secondaryBtnText}>Save reminders & notify</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Checklist</Text>
        {(task.checklist || []).map((item: any) => (
          <View key={item.id} style={styles.checkCard}>
            <TouchableOpacity style={styles.checkRow} onPress={() => toggleCheck(item)}>
              <View style={[styles.box, item.isChecked && styles.boxOn]}>
                {item.isChecked ? <Text style={styles.tick}>✓</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.checkText, item.isChecked && styles.checkDone]}>
                  {item.text}
                </Text>
                {item.uncheckReason ? (
                  <Text style={styles.reason}>Last unmark reason: {item.uncheckReason}</Text>
                ) : null}
              </View>
            </TouchableOpacity>

            {(item.replies || []).map((r: any) => (
              <View key={r.id} style={styles.reply}>
                <Text style={styles.replyAuthor}>{r.user?.name || 'User'}</Text>
                <Text style={styles.replyBody}>{r.message}</Text>
              </View>
            ))}

            <TextInput
              style={styles.input}
              placeholder={item.isChecked ? 'Reply or reason to unmark…' : 'Reply under this point…'}
              placeholderTextColor={colors.textMuted}
              value={replyDrafts[item.id] || ''}
              onChangeText={(t) => setReplyDrafts((d) => ({ ...d, [item.id]: t }))}
            />
            <View style={styles.rowBtns}>
              <TouchableOpacity style={styles.miniBtn} onPress={() => sendReply(item.id)}>
                <Text style={styles.miniBtnText}>Reply (notify)</Text>
              </TouchableOpacity>
              {item.isChecked && (
                <TouchableOpacity
                  style={[styles.miniBtn, styles.dangerBtn]}
                  onPress={() => uncheckWithDraft(item)}
                >
                  <Text style={styles.miniBtnText}>Unmark + reason</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}

        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={newCheck}
            onChangeText={setNewCheck}
            placeholder="New checklist item"
            placeholderTextColor={colors.textMuted}
          />
          <TouchableOpacity style={styles.miniBtn} onPress={addChecklist}>
            <Ionicons name="add-outline" size={14} color={colors.accent} />
            <Text style={styles.miniBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Signed in as {user?.name}. Only assigned users receive notifications.
        </Text>

        {can('tasks.delete') ? (
          <TouchableOpacity style={styles.deleteBtn} onPress={deleteTask}>
            <Ionicons name="trash-outline" size={16} color="#fff" />
            <Text style={styles.deleteBtnText}>Delete task</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
      <ReminderPickerModal
        visible={pickerIndex != null}
        value={pickerIndex != null ? remindersLocal[pickerIndex] || '' : ''}
        onClose={() => setPickerIndex(null)}
        onSave={(local) => {
          if (pickerIndex == null) return;
          setRemindersLocal((list) => list.map((v, i) => (i === pickerIndex ? local : v)));
        }}
      />
      {dialog}
    </>
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
      marginTop: 48,
      marginBottom: 8,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { color: colors.text, fontSize: 26, fontWeight: '800' },
    editBtn: {
      backgroundColor: colors.accentDim,
      borderRadius: spacing.btnRadius,
      paddingHorizontal: spacing.btnPadH,
      paddingVertical: spacing.btnPadV,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    editBtnText: { color: colors.accent, fontWeight: '700', fontSize: spacing.btnFont },
    desc: { color: colors.textMuted, marginTop: 8, marginBottom: 12 },
    statusPill: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    statusPillText: { color: colors.onAccent, fontWeight: '800', textTransform: 'capitalize' },
    label: { color: colors.textMuted, marginTop: 18, marginBottom: 8, fontWeight: '700' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 7,
      backgroundColor: colors.bgElevated,
    },
    chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { color: colors.text, textTransform: 'capitalize', fontSize: 12 },
    chipTextOn: { color: colors.onAccent, fontWeight: '700' },
    meta: { color: colors.text, lineHeight: 22 },
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
      marginTop: 8,
    },
    reminderBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    reminderValue: { color: colors.text, fontSize: spacing.inputFont, flex: 1 },
    reminderPlaceholder: { color: colors.textMuted, fontSize: spacing.inputFont, flex: 1 },
    secondaryBtn: {
      marginTop: 10,
      backgroundColor: colors.bgCard,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      paddingHorizontal: spacing.btnPadH,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 38,
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
      alignSelf: 'flex-start',
    },
    secondaryBtnText: { color: colors.accent, fontWeight: '700', fontSize: spacing.btnFont },
    checkCard: {
      backgroundColor: colors.bgCard,
      borderRadius: spacing.cardRadius,
      padding: spacing.cardPad,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
    },
    checkRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    box: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxOn: { backgroundColor: colors.accent },
    tick: { color: colors.onAccent, fontWeight: '900' },
    checkText: { color: colors.text, fontSize: 15, fontWeight: '600' },
    checkDone: { textDecorationLine: 'line-through', color: colors.textMuted },
    reason: { color: colors.warn, marginTop: 4, fontSize: 12 },
    reply: {
      marginTop: 8,
      marginLeft: 34,
      backgroundColor: colors.bgElevated,
      borderRadius: 10,
      padding: 8,
    },
    replyAuthor: { color: colors.accent, fontSize: 12, fontWeight: '700' },
    replyBody: { color: colors.text, marginTop: 2 },
    rowBtns: { flexDirection: 'row', gap: 8, marginTop: 8 },
    miniBtn: {
      backgroundColor: colors.accentDim,
      borderRadius: spacing.btnRadius,
      paddingHorizontal: spacing.btnPadH,
      paddingVertical: spacing.btnPadV,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    dangerBtn: { backgroundColor: colors.danger },
    miniBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
    row: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
    hint: { color: colors.textMuted, marginTop: 20, fontSize: 12 },
    deleteBtn: {
      marginTop: 20,
      backgroundColor: colors.danger,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      alignItems: 'center',
      minHeight: 38,
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    deleteBtnText: { color: '#fff', fontWeight: '800', fontSize: spacing.btnFont },
  });
}
