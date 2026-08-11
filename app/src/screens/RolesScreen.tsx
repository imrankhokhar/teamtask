import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Platform,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { useAuth } from '../auth';
import { useTheme, ThemeColors, spacing, listCardLayout } from '../theme';
import AppShell from '../components/AppShell';
import LoadingView from '../components/LoadingView';
import { useConfirm } from '../components/ConfirmModal';
import Ionicons from '@expo/vector-icons/Ionicons';

function Field({
  value,
  onChangeText,
  placeholder,
  editable = true,
  colors,
  styles,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  editable?: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  if (Platform.OS === 'web') {
    return (
      // Native input — RN TextInput often does not receive clicks in Electron
      <input
        value={value}
        disabled={!editable}
        placeholder={placeholder}
        onChange={(e) => onChangeText(e.target.value)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          backgroundColor: colors.bgElevated,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: '12px',
          color: colors.text,
          marginBottom: 8,
          fontSize: 14,
          outline: 'none',
          opacity: editable ? 1 : 0.6,
          cursor: editable ? 'text' : 'not-allowed',
        }}
      />
    );
  }
  return (
    <TextInput
      style={[styles.input, !editable && styles.inputDisabled]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      editable={editable}
    />
  );
}

export default function RolesScreen({ navigation }: any) {
  const { can } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { confirm, dialog } = useConfirm();
  const [roles, setRoles] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const editingRole = useMemo(
    () => (editingId ? roles.find((r) => r.id === editingId) : null),
    [roles, editingId]
  );
  const nameLocked = Boolean(editingRole?.isSystem);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      const data = await api.roles();
      setRoles(data.roles || []);
      setModules(data.modules || []);
      setActions(data.actions || []);
      setCatalog(data.permissionCatalog || []);
    } catch (e: any) {
      setMsg(e.message || 'Failed to load roles');
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
    setShowForm(false);
    setEditingId(null);
    setName('');
    setDescription('');
    setPermissions([]);
  }

  function startCreate() {
    setEditingId(null);
    setName('');
    setDescription('');
    setPermissions([]);
    setMsg('');
    setShowForm(true);
  }

  function startEdit(role: any) {
    setEditingId(role.id);
    setShowForm(true);
    setName(role.name || '');
    setDescription(role.description || '');
    setPermissions([...(role.permissions || [])]);
    setMsg(`Editing role "${role.name}"`);
  }

  function togglePerm(key: string) {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }

  async function save() {
    if (!name.trim()) {
      setMsg('Role name required');
      return;
    }
    try {
      setMsg('');
      if (editingId) {
        await api.updateRole(editingId, {
          name: name.trim(),
          description: description.trim(),
          permissions,
        });
        setMsg('Role updated');
      } else {
        await api.createRole({
          name: name.trim(),
          description: description.trim(),
          permissions,
        });
        setMsg('Role created');
      }
      resetForm();
      await load();
    } catch (e: any) {
      setMsg(e.message || 'Save failed');
    }
  }

  async function removeRole(role: any) {
    const ok = await confirm({
      title: 'Delete role',
      message: `Delete role "${role.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api.deleteRole(role.id);
      setMsg('Role deleted');
      await load();
    } catch (e: any) {
      setMsg(e.message || 'Delete failed');
    }
  }

  const showInitialLoad = (!loaded || refreshing) && roles.length === 0 && !showForm;

  return (
    <AppShell navigation={navigation} active="Roles" title="Roles & Permissions">
      {showInitialLoad ? (
        <LoadingView label="Loading roles…" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />
          }
        >
          {!!msg && <Text style={styles.msg}>{msg}</Text>}
          {can('roles.create') && !showForm ? (
            <TouchableOpacity style={styles.btn} onPress={startCreate}>
              <View style={styles.btnInner}>
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.onAccent} />
                <Text style={styles.btnText}>Create role</Text>
              </View>
            </TouchableOpacity>
          ) : null}

          {showForm ? (
            <View style={styles.form} pointerEvents="box-none">
              <Text style={styles.formTitle}>{editingId ? 'Edit role' : 'New role'}</Text>
              <Field
                value={name}
                onChangeText={setName}
                placeholder="Role name"
                editable={!nameLocked}
                colors={colors}
                styles={styles}
              />
              {nameLocked ? (
                <Text style={styles.hint}>System role names cannot be changed.</Text>
              ) : null}
              <Field
                value={description}
                onChangeText={setDescription}
                placeholder="Description"
                colors={colors}
                styles={styles}
              />
              <Text style={styles.label}>Permissions</Text>
              {modules.map((mod) => (
                <View key={mod.key} style={styles.moduleBlock}>
                  <Text style={styles.moduleTitle}>{mod.label}</Text>
                  <View style={styles.chips}>
                    {actions.map((act) => {
                      const key = `${mod.key}.${act.key}`;
                      if (!catalog.includes(key) && key !== 'teams.view_all') return null;
                      const on = permissions.includes(key);
                      return (
                        <TouchableOpacity
                          key={key}
                          style={[styles.chip, on && styles.chipOn]}
                          onPress={() => togglePerm(key)}
                        >
                          <Text style={[styles.chipText, on && styles.chipTextOn]}>
                            {act.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    {mod.key === 'teams' ? (
                      <TouchableOpacity
                        style={[
                          styles.chip,
                          permissions.includes('teams.view_all') && styles.chipOn,
                        ]}
                        onPress={() => togglePerm('teams.view_all')}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            permissions.includes('teams.view_all') && styles.chipTextOn,
                          ]}
                        >
                          View all teams
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ))}
              <TouchableOpacity style={styles.btn} onPress={save}>
                <Text style={styles.btnText}>{editingId ? 'Save role' : 'Create role'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondary} onPress={resetForm}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.cardGrid}>
            {roles.map((item) => (
              <View key={item.id} style={styles.card}>
                <Text style={styles.cardTitle}>
                  {item.name}
                  {item.isSystem ? ' (system)' : ''}
                </Text>
                <Text style={styles.meta}>{item.description || '—'}</Text>
                <Text style={styles.meta}>{(item.permissions || []).length} permissions</Text>
                <View style={styles.actions}>
                  {can('roles.edit') ? (
                    <TouchableOpacity style={styles.mini} onPress={() => startEdit(item)}>
                      <Ionicons name="create-outline" size={14} color={colors.accent} />
                      <Text style={styles.miniText}>Edit</Text>
                    </TouchableOpacity>
                  ) : null}
                  {can('roles.delete') && !item.isSystem ? (
                    <TouchableOpacity
                      style={[styles.mini, styles.danger]}
                      onPress={() => removeRole(item)}
                    >
                      <Ionicons name="trash-outline" size={14} color="#fff" />
                      <Text style={styles.dangerText}>Delete</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
      {dialog}
    </AppShell>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    msg: {
      color: colors.accent,
      backgroundColor: colors.bgCard,
      borderRadius: 10,
      padding: 10,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    btn: {
      backgroundColor: colors.accent,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      paddingHorizontal: spacing.btnPadH,
      alignItems: 'center',
      marginBottom: 8,
      minHeight: 38,
      justifyContent: 'center',
      alignSelf: 'flex-start',
    },
    btnText: { color: colors.onAccent, fontWeight: '800', fontSize: spacing.btnFont },
    btnInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    secondary: {
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      paddingHorizontal: spacing.btnPadH,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      alignSelf: 'flex-start',
    },
    secondaryText: { color: colors.accent, fontWeight: '700', fontSize: spacing.btnFont },
    form: {
      backgroundColor: colors.bgCard,
      borderRadius: spacing.cardRadius,
      padding: spacing.cardPad,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
      maxWidth: 520,
      width: '100%',
    },
    formTitle: { color: colors.text, fontWeight: '700', marginBottom: 10, fontSize: 16 },
    label: { color: colors.textMuted, marginBottom: 8, marginTop: 4, fontWeight: '600' },
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
    inputDisabled: { opacity: 0.6 },
    hint: { color: colors.textMuted, fontSize: 12, marginBottom: 8, marginTop: -4 },
    moduleBlock: { marginBottom: 12 },
    moduleTitle: { color: colors.text, fontWeight: '700', marginBottom: 6 },
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
    chipText: { color: colors.text, fontSize: 12 },
    chipTextOn: { color: colors.onAccent, fontWeight: '700' },
    cardGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.cardGap,
      marginTop: 8,
    },
    card: {
      backgroundColor: colors.bgCard,
      borderRadius: spacing.cardRadius,
      padding: spacing.cardPad,
      borderWidth: 1,
      borderColor: colors.border,
      ...listCardLayout,
    },
    cardTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
    meta: { color: colors.textMuted, marginTop: 4, fontSize: 12 },
    actions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
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
    miniText: { color: colors.accent, fontWeight: '700', fontSize: 12 },
    dangerText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  });
}
