import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, ApiError } from '../api';
import { useTheme, ThemeColors, spacing } from '../theme';
import PasswordField from '../components/PasswordField';
import FormField from '../components/FormField';
import AppShell from '../components/AppShell';

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
    <AppShell navigation={navigation} active="Settings" title="Change password">
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={18} color={colors.info} />
            <Text style={styles.back}>Back to settings</Text>
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
        </View>
      </ScrollView>
    </AppShell>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    inner: {
      padding: 16,
      paddingBottom: 40,
      alignItems: 'flex-start',
    },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.bgCard,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      gap: 4,
    },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 10,
      alignSelf: 'flex-start',
    },
    back: { color: colors.info, fontWeight: '600', fontSize: 13 },
    h1: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 4 },
    sub: { color: colors.textMuted, marginBottom: 12, fontSize: 13, lineHeight: 18 },
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
      backgroundColor: colors.successBg,
      borderColor: colors.border,
    },
    bannerErr: {
      color: colors.danger,
      backgroundColor: colors.errorBg,
      borderColor: colors.danger,
    },
    btn: {
      marginTop: 12,
      backgroundColor: colors.accent,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      paddingHorizontal: spacing.btnPadH,
      alignItems: 'center',
      alignSelf: 'flex-start',
      minHeight: 38,
      justifyContent: 'center',
    },
    btnText: { color: colors.onAccent, fontWeight: '800', fontSize: spacing.btnFont },
  });
}
