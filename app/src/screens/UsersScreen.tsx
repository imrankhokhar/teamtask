import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { useAuth } from '../auth';
import { colors } from '../theme';
import AppShell from '../components/AppShell';
import PasswordField from '../components/PasswordField';
import { useConfirm } from '../components/ConfirmModal';

export default function UsersScreen({ navigation }: any) {
  const { can } = useAuth();
  const { confirm, dialog } = useConfirm();
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('role-member');
  const [msg, setMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      const [u, r] = await Promise.all([
        api.users(),
        api.roles().catch(() => ({ roles: [] })),
      ]);
      setUsers(u.users || []);
      setRoles(r.roles || []);
      if ((r.roles || []).length) {
        setRoleId((prev) =>
          prev && (r.roles || []).some((x: any) => x.id === prev)
            ? prev
            : r.roles.find((x: any) => x.id === 'role-member')?.id || r.roles[0].id
        );
      }
    } catch (e: any) {
      setMsg(e.message || 'Failed to load users');
    } finally {
      setRefreshing(false);
    }
  }, [can]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function resetForm() {
    setEditingId(null);
    setShowForm(false);
    setFirstName('');
    setLastName('');
    setEmail('');
    setPassword('');
    setRoleId(roles.find((r) => r.id === 'role-member')?.id || roles[0]?.id || 'role-member');
  }

  function startEdit(u: any) {
    setEditingId(u.id);
    setShowForm(true);
    setFirstName(u.firstName || '');
    setLastName(u.lastName || '');
    setEmail(u.email || '');
    setPassword('');
    setRoleId(u.roleId || 'role-member');
    setMsg(`Editing ${u.name}`);
  }

  async function save() {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setMsg('First name, last name, and email are required');
      return;
    }
    if (!editingId && !password.trim()) {
      setMsg('Password required for new users');
      return;
    }
    try {
      setMsg('');
      if (editingId) {
        await api.updateUser(editingId, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          roleId,
          ...(password.trim() ? { password: password.trim() } : {}),
        });
        setMsg('User updated');
      } else {
        await api.createUser({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          password: password.trim(),
          roleId,
        });
        setMsg('User created');
      }
      resetForm();
      await load();
    } catch (e: any) {
      setMsg(e.message || 'Save failed');
    }
  }

  async function removeUser(u: any) {
    const ok = await confirm({
      title: 'Delete user',
      message: `Delete user ${u.email}? This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api.deleteUser(u.id);
      setMsg('User deleted');
      await load();
    } catch (e: any) {
      setMsg(e.message || 'Delete failed');
    }
  }

  return (
    <AppShell navigation={navigation} active="Users" title="Users">
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            {!!msg && <Text style={styles.msg}>{msg}</Text>}
            {can('users.create') && !showForm ? (
              <TouchableOpacity style={styles.btn} onPress={() => setShowForm(true)}>
                <Text style={styles.btnText}>+ Create user</Text>
              </TouchableOpacity>
            ) : null}
            {showForm ? (
              <View style={styles.form}>
                <Text style={styles.formTitle}>{editingId ? 'Edit user' : 'New user'}</Text>
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First name"
                  placeholderTextColor={colors.textMuted}
                />
                <TextInput
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last name"
                  placeholderTextColor={colors.textMuted}
                />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholderTextColor={colors.textMuted}
                />
                <PasswordField
                  containerStyle={{ marginBottom: 8 }}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={editingId ? 'New password (optional)' : 'Password'}
                />
                <Text style={styles.label}>Role</Text>
                <View style={styles.chips}>
                  {roles.map((r) => {
                    const on = roleId === r.id;
                    return (
                      <TouchableOpacity
                        key={r.id}
                        style={[styles.chip, on && styles.chipOn]}
                        onPress={() => setRoleId(r.id)}
                      >
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity style={styles.btn} onPress={save}>
                  <Text style={styles.btnText}>{editingId ? 'Save changes' : 'Create user'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondary} onPress={resetForm}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>No users yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {item.firstName || item.name} {item.lastName || ''}
            </Text>
            <Text style={styles.meta}>{item.email}</Text>
            <Text style={styles.meta}>Role: {item.roleName || item.role}</Text>
            <View style={styles.actions}>
              {can('users.edit') ? (
                <TouchableOpacity style={styles.mini} onPress={() => startEdit(item)}>
                  <Text style={styles.miniText}>Edit</Text>
                </TouchableOpacity>
              ) : null}
              {can('users.delete') ? (
                <TouchableOpacity style={[styles.mini, styles.danger]} onPress={() => removeUser(item)}>
                  <Text style={styles.miniText}>Delete</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}
      />
      {dialog}
    </AppShell>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  btnText: { color: '#062016', fontWeight: '800' },
  secondary: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.accent, fontWeight: '700' },
  form: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
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
  chipTextOn: { color: '#062016', fontWeight: '700' },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  meta: { color: colors.textMuted, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  mini: {
    backgroundColor: colors.accentDim,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  danger: { backgroundColor: colors.danger },
  miniText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 24 },
});
