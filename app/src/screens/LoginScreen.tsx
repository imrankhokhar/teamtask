import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '../auth';
import { api } from '../api';
import { colors } from '../theme';
import PasswordField from '../components/PasswordField';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

function showError(message: string, setError: (m: string) => void) {
  setError(message);
  if (Platform.OS !== 'web') {
    Alert.alert('Error', message);
  }
}

export default function LoginScreen({ navigation }: any) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setInfo('');
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    if (next !== 'reset') setCode('');
  }

  async function submit() {
    try {
      setBusy(true);
      setError('');
      setInfo('');

      if (mode === 'login') {
        await login(email.trim(), password);
        return;
      }

      if (mode === 'register') {
        if (!name.trim()) {
          showError('Name is required to register', setError);
          return;
        }
        await register(name.trim(), email.trim(), password);
        return;
      }

      if (mode === 'forgot') {
        if (!email.trim()) {
          showError('Enter your email', setError);
          return;
        }
        const data = await api.forgotPassword(email.trim().toLowerCase());
        if (data.code) {
          setCode(String(data.code));
          setInfo(`${data.message}\nCode: ${data.code}`);
        } else {
          setInfo(data.message || 'Check your email for a reset code.');
        }
        setMode('reset');
        return;
      }

      if (mode === 'reset') {
        if (!email.trim() || !code.trim()) {
          showError('Email and reset code are required', setError);
          return;
        }
        if (newPassword.length < 6) {
          showError('Password must be at least 6 characters', setError);
          return;
        }
        if (newPassword !== confirmPassword) {
          showError('Passwords do not match', setError);
          return;
        }
        const data = await api.resetPassword({
          email: email.trim().toLowerCase(),
          code: code.trim(),
          newPassword,
        });
        setInfo(data.message || 'Password updated. Sign in with your new password.');
        setPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setCode('');
        setMode('login');
      }
    } catch (e: any) {
      showError(e.message || 'Request failed', setError);
    } finally {
      setBusy(false);
    }
  }

  const primaryLabel =
    busy
      ? 'Please wait…'
      : mode === 'login'
        ? 'Sign in'
        : mode === 'register'
          ? 'Create account'
          : mode === 'forgot'
            ? 'Send reset code'
            : 'Set new password';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>TeamTask</Text>
        <Text style={styles.sub}>
          {mode === 'forgot'
            ? 'Reset your password'
            : mode === 'reset'
              ? 'Enter code and new password'
              : 'Free task & checklist collaboration'}
        </Text>

        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!info && <Text style={styles.info}>{info}</Text>}

        {mode === 'register' && (
          <TextInput
            style={styles.input}
            placeholder="Full name"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
          />
        )}

        {(mode === 'login' || mode === 'register' || mode === 'forgot' || mode === 'reset') && (
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        )}

        {(mode === 'login' || mode === 'register') && (
          <PasswordField
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
          />
        )}

        {mode === 'reset' && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Reset code"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
            />
            <PasswordField
              placeholder="New password"
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <PasswordField
              placeholder="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          </>
        )}

        <TouchableOpacity style={styles.btn} onPress={submit} disabled={busy}>
          <Text style={styles.btnText}>{primaryLabel}</Text>
        </TouchableOpacity>

        {mode === 'login' && (
          <TouchableOpacity onPress={() => switchMode('forgot')}>
            <Text style={styles.switch}>Forgot password?</Text>
          </TouchableOpacity>
        )}

        {(mode === 'forgot' || mode === 'reset') && (
          <TouchableOpacity onPress={() => switchMode('login')}>
            <Text style={styles.switch}>Back to sign in</Text>
          </TouchableOpacity>
        )}

        {(mode === 'login' || mode === 'register') && (
          <TouchableOpacity
            onPress={() => switchMode(mode === 'login' ? 'register' : 'login')}
          >
            <Text style={styles.switch}>
              {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => navigation.navigate('Connection')}>
          <Text style={styles.switch}>Server connection (phone setup)</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 },
  brand: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: -1,
  },
  sub: { color: colors.textMuted, marginBottom: 20, fontSize: 15 },
  error: {
    color: colors.danger,
    backgroundColor: '#3a1a1a',
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
  },
  info: {
    color: colors.accent,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
    lineHeight: 20,
  },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { color: '#062016', fontWeight: '700', fontSize: 16 },
  switch: { color: colors.info, textAlign: 'center', marginTop: 8 },
});
