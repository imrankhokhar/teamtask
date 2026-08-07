import React, { useMemo, useState } from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { api, ApiError } from '../api';
import { useTheme, ThemeColors } from '../theme';
import PasswordField from '../components/PasswordField';
import FormField from '../components/FormField';

export default function ChangePasswordScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!currentPassword) next.currentPassword = 'Current password is required';
    if (!newPassword) next.newPassword = 'New password is required';
    else if (newPassword.length < 6) next.newPassword = 'New password must be at least 6 characters';
    if (!confirmPassword) next.confirmPassword = 'Please confirm your new password';
    else if (newPassword && confirmPassword !== newPassword) {
      next.confirmPassword = 'New passwords do not match';
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save() {
    setMsg('');
    setErr(false);
    if (!validate()) {
      setErr(true);
      setMsg('Please fix the highlighted fields');
      return;
    }
    try {
      setBusy(true);
      const data = await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFieldErrors({});
      setMsg(data.message || 'Password changed');
    } catch (e: any) {
      if (e instanceof ApiError && e.fields) {
        setFieldErrors(e.fields);
      }
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

      <FormField label="Current password" required error={fieldErrors.currentPassword}>
        <PasswordField
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder="Current password"
          error={Boolean(fieldErrors.currentPassword)}
        />
      </FormField>

      <FormField label="New password" required error={fieldErrors.newPassword}>
        <PasswordField
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="New password"
          error={Boolean(fieldErrors.newPassword)}
        />
      </FormField>

      <FormField label="Confirm new password" required error={fieldErrors.confirmPassword}>
        <PasswordField
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm new password"
          error={Boolean(fieldErrors.confirmPassword)}
        />
      </FormField>

      <TouchableOpacity style={styles.btn} onPress={save} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.btnText}>Update password</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    back: { color: colors.info, marginTop: Platform.OS === 'web' ? 12 : 48, marginBottom: 8 },
    h1: { color: colors.text, fontSize: 26, fontWeight: '800' },
    sub: { color: colors.textMuted, marginTop: 8, marginBottom: 16 },
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
      backgroundColor: colors.errorBg,
      borderColor: colors.danger,
    },
    btn: {
      marginTop: 24,
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      minHeight: 50,
      justifyContent: 'center',
    },
    btnText: { color: colors.onAccent, fontWeight: '800', fontSize: 16 },
  });
}
