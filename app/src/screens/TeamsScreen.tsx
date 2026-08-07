import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { useAuth } from '../auth';
import { useTheme, ThemeColors, spacing } from '../theme';
import AppShell from '../components/AppShell';
import LoadingView from '../components/LoadingView';
import { useConfirm } from '../components/ConfirmModal';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function TeamsScreen({ navigation }: any) {
  const { can } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { confirm, dialog } = useConfirm();
  const [teams, setTeams] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [pickerValue, setPickerValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      const t = await api.teams();
      setTeams(t.teams || []);
      try {
        const u = await api.users();
        setUsers(u.users || []);
      } catch {
        setUsers([]);
      }
    } catch (e: any) {
      const text = e.message || 'Failed';
      setMsg(text);
      if (Platform.OS !== 'web') Alert.alert('Error', text);
    } finally {
      setRefreshing(false);
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function resetForm() {
    setEditingId(null);
    setShowForm(false);
    setName('');
    setMemberIds([]);
    setPickerValue('');
  }

  function startEdit(team: any) {
    setEditingId(team.id);
    setShowForm(true);
    setName(team.name || '');
    setMemberIds((team.members || []).map((m: any) => m.id));
    setMsg(`Editing "${team.name}"`);
  }

  function addFromPicker(userId: string) {
    if (!userId) return;
    setMemberIds((ids) => (ids.includes(userId) ? ids : [...ids, userId]));
    setPickerValue('');
  }

  async function create() {
    if (!name.trim()) {
      setMsg('Team name required');
      return;
    }
    if (!memberIds.length) {
      setMsg('Select at least one team member from the dropdown');
      return;
    }
    try {
      setMsg('');
      if (editingId) {
        await api.updateTeam(editingId, {
          name: name.trim(),
          memberIds,
        });
        setMsg('Team updated');
      } else {
        await api.createTeam({
          name: name.trim(),
          memberIds,
        });
        setMsg('Team created');
      }
      resetForm();
      await load();
    } catch (e: any) {
      setMsg(e.message || 'Failed');
    }
  }

  async function removeTeam(team: any) {
    const ok = await confirm({
      title: 'Delete team',
      message: `Delete team "${team.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api.deleteTeam(team.id);
      if (editingId === team.id) resetForm();
      setMsg('Team deleted');
      await load();
    } catch (e: any) {
      setMsg(e.message || 'Delete failed');
    }
  }

  const availableUsers = users.filter((u) => !memberIds.includes(u.id));
  const showInitialLoad = (!loaded || refreshing) && teams.length === 0 && !showForm;

  return (
    <AppShell navigation={navigation} active="Teams" title="Teams">
      {showInitialLoad ? (
        <LoadingView label="Loading teams…" />
      ) : (
        <FlatList
          data={teams}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />
          }
          contentContainerStyle={styles.grid}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={styles.sub}>
                Non-admins only see teams they belong to. Admins (or roles with “view all teams”) see
                every team.
              </Text>
              {!!msg && <Text style={styles.msg}>{msg}</Text>}
              {can('teams.create') && !showForm ? (
                <TouchableOpacity style={styles.btn} onPress={() => setShowForm(true)}>
                  <View style={styles.btnInner}>
                    <Ionicons name="people-outline" size={16} color={colors.onAccent} />
                    <Text style={styles.btnText}>Create team</Text>
                  </View>
                </TouchableOpacity>
              ) : null}
              {showForm ? (
                <View style={styles.form}>
                  <Text style={styles.formTitle}>{editingId ? 'Edit team' : 'New team'}</Text>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Team name"
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={styles.label}>Select users for this team</Text>
                  {Platform.OS === 'web' ? (
                    <select
                      value={pickerValue}
                      onChange={(e: any) => {
                        const id = e.target.value;
                        setPickerValue(id);
                        if (id) addFromPicker(id);
                      }}
                      style={{
                        width: '100%',
                        marginBottom: 10,
                        padding: 10,
                        borderRadius: 10,
                        backgroundColor: colors.bgElevated,
                        color: colors.text,
                        border: `1px solid ${colors.border}`,
                      }}
                    >
                      <option value="">Choose a user…</option>
                      {availableUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {(u.firstName || u.name) + ' ' + (u.lastName || '')} ({u.email})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <View style={styles.chips}>
                      {availableUsers.map((u) => (
                        <TouchableOpacity
                          key={u.id}
                          style={styles.chip}
                          onPress={() => addFromPicker(u.id)}
                        >
                          <Text style={styles.chipText}>
                            + {u.firstName || u.name} {u.lastName || ''}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <Text style={styles.label}>Selected members</Text>
                  <View style={styles.chips}>
                    {memberIds.map((id) => {
                      const u = users.find((x) => x.id === id);
                      return (
                        <TouchableOpacity
                          key={id}
                          style={[styles.chip, styles.chipOn]}
                          onPress={() => setMemberIds((ids) => ids.filter((x) => x !== id))}
                        >
                          <Text style={[styles.chipText, styles.chipTextOn]}>
                            {u ? `${u.firstName || u.name} ${u.lastName || ''}`.trim() : id} ×
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TouchableOpacity style={styles.btn} onPress={create}>
                    <Text style={styles.btnText}>{editingId ? 'Save team' : 'Create team'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondary} onPress={resetForm}>
                    <Text style={styles.secondaryText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No teams visible for your account.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.meta}>
                Members:{'\n'}
                {(item.members || [])
                  .map((m: any) => `${m.firstName || m.name} ${m.lastName || ''} <${m.email}>`)
                  .join('\n') || '—'}
              </Text>
              <View style={styles.actions}>
                {can('teams.edit') ? (
                  <TouchableOpacity style={styles.mini} onPress={() => startEdit(item)}>
                    <Ionicons name="create-outline" size={14} color="#fff" />
                    <Text style={styles.miniText}>Edit</Text>
                  </TouchableOpacity>
                ) : null}
                {can('teams.delete') ? (
                  <TouchableOpacity
                    style={[styles.mini, styles.danger]}
                    onPress={() => removeTeam(item)}
                  >
                    <Ionicons name="trash-outline" size={14} color="#fff" />
                    <Text style={styles.miniText}>Delete</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )}
        />
      )}
      {dialog}
    </AppShell>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.cardGap,
      padding: 16,
      paddingBottom: 40,
      alignItems: 'flex-start',
    },
    listHeader: {
      width: '100%',
      flexBasis: '100%',
      marginBottom: 4,
    },
    sub: { color: colors.textMuted, marginBottom: 12, lineHeight: 20 },
    msg: {
      color: colors.accent,
      backgroundColor: colors.bgCard,
      borderRadius: 10,
      padding: 10,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    form: {
      backgroundColor: colors.bgCard,
      borderRadius: spacing.cardRadius,
      padding: spacing.cardPad,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
      maxWidth: 480,
      width: '100%',
    },
    formTitle: { color: colors.text, fontWeight: '700', marginBottom: 10, fontSize: 16 },
    label: { color: colors.textMuted, marginBottom: 8, marginTop: 8, fontWeight: '600' },
    input: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.inputRadius,
      paddingHorizontal: spacing.inputPadH,
      paddingVertical: spacing.inputPadV,
      color: colors.text,
      marginBottom: 8,
      fontSize: spacing.inputFont,
      minHeight: 38,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.bgElevated,
    },
    chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { color: colors.text, fontSize: 12 },
    chipTextOn: { color: colors.onAccent, fontWeight: '700' },
    btn: {
      backgroundColor: colors.accent,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      alignItems: 'center',
      marginBottom: 8,
      minHeight: 38,
      justifyContent: 'center',
      maxWidth: spacing.cardWidth,
    },
    btnText: { color: colors.onAccent, fontWeight: '800', fontSize: spacing.btnFont },
    btnInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    secondary: {
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      maxWidth: spacing.cardWidth,
    },
    secondaryText: { color: colors.accent, fontWeight: '700', fontSize: spacing.btnFont },
    card: {
      backgroundColor: colors.bgCard,
      borderRadius: spacing.cardRadius,
      padding: spacing.cardPad,
      borderWidth: 1,
      borderColor: colors.border,
      width: spacing.cardWidth,
      maxWidth: '100%',
    },
    cardTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
    meta: { color: colors.textMuted, marginTop: 4, fontSize: 12, lineHeight: 18 },
    actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
    mini: {
      backgroundColor: colors.accentDim,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    danger: { backgroundColor: colors.danger },
    miniText: { color: '#fff', fontWeight: '700', fontSize: 12 },
    empty: { color: colors.textMuted, textAlign: 'center', marginTop: 24, width: '100%' },
  });
}
