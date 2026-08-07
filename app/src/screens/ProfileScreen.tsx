import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../auth';
import { api, ApiError, getApiBaseUrlSyncFallback } from '../api';
import { useTheme, ThemeColors, spacing } from '../theme';
import FormField from '../components/FormField';
import PasswordField from '../components/PasswordField';
import AppShell from '../components/AppShell';

function resolveAvatar(url?: string | null) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${getApiBaseUrlSyncFallback()}${url}`;
}

export default function ProfileScreen({ navigation }: any) {
  const { user, refreshMe } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [avatar, setAvatar] = useState(user?.avatarUrl || null);

  async function pickAvatar() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const file = result.assets[0];
      setUploading(true);
      setMsg('');
      const data = await api.uploadAvatar(
        file.uri,
        file.name || 'avatar.jpg',
        file.mimeType,
        Platform.OS === 'web' ? (file as any).file : undefined
      );
      setAvatar(data.avatarUrl || data.user?.avatarUrl);
      await refreshMe();
      setMsg('Profile picture updated');
      setErr(false);
    } catch (e: any) {
      setErr(true);
      setMsg(e.message || 'Failed to upload picture');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const next: Record<string, string> = {};
    if (!firstName.trim() && !lastName.trim()) next.firstName = 'Name is required';
    if (!email.trim()) next.email = 'Email is required';
    if (newPassword) {
      if (!currentPassword) next.currentPassword = 'Current password is required';
      if (newPassword.length < 6) next.newPassword = 'Password must be at least 6 characters';
      if (newPassword !== confirmPassword) next.confirmPassword = 'Passwords do not match';
    }
    setFieldErrors(next);
    if (Object.keys(next).length) {
      setErr(true);
      setMsg('Please fix the highlighted fields');
      return;
    }

    try {
      setBusy(true);
      setMsg('');
      setErr(false);
      const data = await api.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        email: email.trim().toLowerCase(),
        ...(newPassword
          ? { currentPassword, newPassword }
          : {}),
      });
      await refreshMe();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMsg(data.message || 'Profile updated');
      if (data.user?.avatarUrl) setAvatar(data.user.avatarUrl);
    } catch (e: any) {
      if (e instanceof ApiError && e.fields) setFieldErrors(e.fields);
      setErr(true);
      setMsg(e.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  const photo = resolveAvatar(avatar);

  return (
    <AppShell navigation={navigation} active="Settings" title="Profile">
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.avatarBlock}>
          <View style={styles.avatar}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarPlaceholder}>Photo</Text>
            )}
          </View>
          <TouchableOpacity style={styles.secondaryBtn} onPress={pickAvatar} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={styles.secondaryBtnText}>Change picture</Text>
            )}
          </TouchableOpacity>
        </View>

        {!!msg && (
          <Text style={[styles.banner, err ? styles.bannerErr : styles.bannerOk]}>{msg}</Text>
        )}

        <FormField
          label="First name"
          required
          value={firstName}
          onChangeText={setFirstName}
          error={fieldErrors.firstName}
        />
        <FormField
          label="Last name"
          value={lastName}
          onChangeText={setLastName}
          error={fieldErrors.lastName}
        />
        <FormField
          label="Email"
          required
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          error={fieldErrors.email}
        />

        <Text style={styles.section}>Change password (optional)</Text>
        <FormField label="Current password" error={fieldErrors.currentPassword}>
          <PasswordField
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Current password"
            error={Boolean(fieldErrors.currentPassword)}
          />
        </FormField>
        <FormField label="New password" error={fieldErrors.newPassword}>
          <PasswordField
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="New password"
            error={Boolean(fieldErrors.newPassword)}
          />
        </FormField>
        <FormField label="Confirm new password" error={fieldErrors.confirmPassword}>
          <PasswordField
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm password"
            error={Boolean(fieldErrors.confirmPassword)}
          />
        </FormField>

        <TouchableOpacity style={styles.btn} onPress={save} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.btnText}>Save profile</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </AppShell>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    avatarBlock: { alignItems: 'center', gap: 10, marginBottom: 8 },
    avatar: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.accentDim,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImg: { width: 88, height: 88 },
    avatarPlaceholder: { color: colors.textMuted, fontWeight: '700' },
    secondaryBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      paddingHorizontal: spacing.btnPadH,
      backgroundColor: colors.bgElevated,
      minWidth: 140,
      alignItems: 'center',
    },
    secondaryBtnText: { color: colors.accent, fontWeight: '700', fontSize: spacing.btnFont },
    banner: {
      borderRadius: 10,
      padding: 10,
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
    section: {
      color: colors.text,
      fontWeight: '800',
      marginTop: 8,
      marginBottom: 4,
      fontSize: 14,
    },
    btn: {
      marginTop: 10,
      backgroundColor: colors.accent,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      alignItems: 'center',
      minHeight: 38,
      justifyContent: 'center',
    },
    btnText: { color: colors.onAccent, fontWeight: '800', fontSize: spacing.btnFont },
  });
}
