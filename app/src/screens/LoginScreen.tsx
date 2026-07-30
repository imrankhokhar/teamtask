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
import { colors } from '../theme';

function showError(message: string, setError: (m: string) => void) {
  setError(message);
  if (Platform.OS !== 'web') {
    Alert.alert('Error', message);
  }
}

export default function LoginScreen({ navigation }: any) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('admin@teamtask.local');
  const [password, setPassword] = useState('admin123');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    try {
      setBusy(true);
      setError('');
      if (mode === 'login') await login(email.trim(), password);
      else {
        if (!name.trim()) {
          showError('Name is required to register', setError);
          return;
        }
        await register(name.trim(), email.trim(), password);
      }
    } catch (e: any) {
      showError(e.message || 'Login failed', setError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>TeamTask</Text>
        <Text style={styles.sub}>Free task & checklist collaboration</Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

        {mode === 'register' && (
          <TextInput
            style={styles.input}
            placeholder="Full name"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.btn} onPress={submit} disabled={busy}>
          <Text style={styles.btnText}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          <Text style={styles.switch}>
            {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Connection')}>
          <Text style={styles.switch}>Server connection (phone setup)</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Demo: admin@teamtask.local / admin123{'\n'}
          alice@teamtask.local / alice123
        </Text>
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
  hint: { color: colors.textMuted, fontSize: 12, marginTop: 24, lineHeight: 18 },
});
