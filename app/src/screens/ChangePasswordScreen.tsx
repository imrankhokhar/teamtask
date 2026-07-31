import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { api } from '../api';
import { colors } from '../theme';
import PasswordField from '../components/PasswordField';

export default function ChangePasswordScreen({ navigation }: any) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState(false);

  async function save() {
    setMsg('');
    setErr(false);
    if (!currentPassword || !newPassword) {
      setErr(true);
      setMsg('Current and new password are required');
      return;
    }
    if (newPassword.length < 6) {
      setErr(true);
      setMsg('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErr(true);
      setMsg('New passwords do not match');
      return;
    }
    try {
      setBusy(true);
      const data = await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMsg(data.message || 'Password changed');
    } catch (e: any) {
      setErr(true);
      setMsg(e.message || 'Failed to change password');
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
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.h1}>Change password</Text>
      <Text style={styles.sub}>Update the password for your signed-in account.</Text>

      {!!msg && (
        <Text style={[styles.banner, err ? styles.bannerErr : styles.bannerOk]}>{msg}</Text>
      )}

      <Text style={styles.label}>Current password</Text>
      <PasswordField value={currentPassword} onChangeText={setCurrentPassword} placeholder="Current password" />

      <Text style={styles.label}>New password</Text>
      <PasswordField value={newPassword} onChangeText={setNewPassword} placeholder="New password" />

      <Text style={styles.label}>Confirm new password</Text>
      <PasswordField
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Confirm new password"
      />

      <TouchableOpacity style={styles.btn} onPress={save} disabled={busy}>
        <Text style={styles.btnText}>{busy ? 'Saving…' : 'Update password'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  back: { color: colors.info, marginTop: Platform.OS === 'web' ? 12 : 48, marginBottom: 8 },
  h1: { color: colors.text, fontSize: 26, fontWeight: '800' },
  sub: { color: colors.textMuted, marginTop: 8, marginBottom: 16 },
  label: { color: colors.textMuted, marginTop: 14, marginBottom: 8, fontWeight: '600' },
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
  btn: {
    marginTop: 24,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#062016', fontWeight: '800', fontSize: 16 },
});
