import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useAuth } from '../auth';
import { api, ApiError, getApiBaseUrlSyncFallback, refreshApiUrl } from '../api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, ThemeColors, spacing } from '../theme';
import { applyBrandingIcons } from '../brandingIcons';
import PasswordField from '../components/PasswordField';
import FormField from '../components/FormField';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

function showError(message: string, setError: (m: string) => void) {
  setError(message);
  if (Platform.OS !== 'web') {
    Alert.alert('Error', message);
  }
}

function resolveUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${getApiBaseUrlSyncFallback()}${path}`;
}

export default function LoginScreen({ navigation }: any) {
  const { login, register } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const safeTop =
    Platform.OS === 'web'
      ? (`max(${Math.max(insets.top || 0, 44)}px, env(safe-area-inset-top, 0px))` as any)
      : Math.max(insets.top || 0, 16);

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [appName, setAppName] = useState('TeamTask');
  const [tagline, setTagline] = useState('Plan work. Share progress. Stay aligned.');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await refreshApiUrl();
      } catch {
        // ignore
      }
      try {
        const data = await api.branding();
        if (data.appName) setAppName(data.appName);
        if (data.tagline) setTagline(data.tagline);
        if (data.logoUrl) {
          setLogoUrl(resolveUrl(data.logoUrl));
          applyBrandingIcons(data.logoUrl);
        }
      } catch {
        // keep defaults when server unreachable
      }
    })();
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setInfo('');
    setFieldErrors({});
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    if (next !== 'reset') setCode('');
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (mode === 'register' && !name.trim()) next.name = 'Full name is required';
    if (!email.trim()) next.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Enter a valid email address';
    }
    if (mode === 'login' || mode === 'register') {
      if (!password) next.password = 'Password is required';
      else if (mode === 'register' && password.length < 6) {
        next.password = 'Password must be at least 6 characters';
      }
    }
    if (mode === 'reset') {
      if (!code.trim()) next.code = 'Reset code is required';
      if (!newPassword) next.newPassword = 'New password is required';
      else if (newPassword.length < 6) next.newPassword = 'Password must be at least 6 characters';
      if (!confirmPassword) next.confirmPassword = 'Please confirm your password';
      else if (newPassword && confirmPassword !== newPassword) {
        next.confirmPassword = 'Passwords do not match';
      }
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    try {
      setBusy(true);
      setError('');
      setInfo('');
      if (!validate()) {
        showError('Please fix the highlighted fields', setError);
        return;
      }

      if (mode === 'login') {
        await login(email.trim(), password);
        return;
      }

      if (mode === 'register') {
        await register(name.trim(), email.trim(), password);
        return;
      }

      if (mode === 'forgot') {
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
      if (e instanceof ApiError && e.fields) {
        setFieldErrors(e.fields);
      }
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

  const heading =
    mode === 'forgot'
      ? 'Reset your password'
      : mode === 'reset'
        ? 'Enter code and new password'
        : tagline;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.inner, { paddingTop: safeTop }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.brandBlock}>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.logo} resizeMode="contain" />
            ) : (
              <View style={styles.logoFallback}>
                <Text style={styles.logoFallbackText}>
                  {appName.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.brand}>{appName}</Text>
            <Text style={styles.sub}>{heading}</Text>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}
          {!!info && <Text style={styles.info}>{info}</Text>}

          {mode === 'register' && (
            <FormField
              label="Full name"
              required
              error={fieldErrors.name}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
            />
          )}

          <FormField
            label="Email"
            required
            error={fieldErrors.email}
            value={email}
            onChangeText={setEmail}
            placeholder="you@company.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          {(mode === 'login' || mode === 'register') && (
            <FormField label="Password" required error={fieldErrors.password}>
              <PasswordField
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                error={Boolean(fieldErrors.password)}
              />
            </FormField>
          )}

          {mode === 'reset' && (
            <>
              <FormField
                label="Reset code"
                required
                error={fieldErrors.code}
                value={code}
                onChangeText={setCode}
                placeholder="6-digit code"
                autoCapitalize="none"
                keyboardType="number-pad"
              />
              <FormField label="New password" required error={fieldErrors.newPassword}>
                <PasswordField
                  placeholder="New password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  error={Boolean(fieldErrors.newPassword)}
                />
              </FormField>
              <FormField label="Confirm password" required error={fieldErrors.confirmPassword}>
                <PasswordField
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  error={Boolean(fieldErrors.confirmPassword)}
                />
              </FormField>
            </>
          )}

          <TouchableOpacity style={styles.btn} onPress={submit} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.btnText}>{primaryLabel}</Text>
            )}
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

          {/* <TouchableOpacity onPress={() => navigation.navigate('Connection')}>
            <Text style={styles.switch}>Server connection (phone setup)</Text>
          </TouchableOpacity> */}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    inner: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16,
    },
    card: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: colors.bgCard,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      gap: 10,
    },
    brandBlock: { alignItems: 'center', marginBottom: 8, gap: 8 },
    logo: { width: 72, height: 72, borderRadius: 16 },
    logoFallback: {
      width: 72,
      height: 72,
      borderRadius: 16,
      backgroundColor: colors.accentDim,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    logoFallbackText: { color: colors.accent, fontSize: 28, fontWeight: '800' },
    brand: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.accent,
      letterSpacing: -0.6,
      textAlign: 'center',
    },
    sub: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    error: {
      color: colors.danger,
      backgroundColor: colors.errorBg,
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: 10,
      padding: 10,
      fontSize: 13,
    },
    info: {
      color: colors.accent,
      backgroundColor: colors.successBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 10,
      lineHeight: 18,
      fontSize: 13,
    },
    btn: {
      backgroundColor: colors.accent,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      alignItems: 'center',
      marginTop: 6,
      minHeight: 38,
      justifyContent: 'center',
    },
    btnText: { color: colors.onAccent, fontWeight: '700', fontSize: spacing.btnFont },
    switch: { color: colors.info, textAlign: 'center', marginTop: 4, fontSize: 13 },
  });
}
