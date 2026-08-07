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
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../auth';
import { api, ApiError, getApiBaseUrlSyncFallback } from '../api';
import { useTheme, ThemeColors, ThemeMode, spacing } from '../theme';
import AppShell from '../components/AppShell';
import FormField from '../components/FormField';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const LINKS: {
  key: string;
  label: string;
  desc: string;
  icon: IconName;
  adminOnly?: boolean;
}[] = [
  {
    key: 'ChangePassword',
    label: 'Change password',
    desc: 'Update your account password',
    icon: 'lock-closed-outline',
  },
  {
    key: 'Sounds',
    label: 'Notification sounds',
    desc: 'Tones for alerts and reminders',
    icon: 'musical-notes-outline',
  },
  {
    key: 'EmailSettings',
    label: 'Email / SMTP',
    desc: 'Configure outbound email',
    icon: 'mail-outline',
  },
  {
    key: 'EmailTemplates',
    label: 'Email templates',
    desc: 'Reply, team, assignment, status & checklist email wording',
    icon: 'document-text-outline',
    adminOnly: true,
  },
  {
    key: 'Admin',
    label: 'Admin & storage',
    desc: 'Storage info and admin tools',
    icon: 'server-outline',
    adminOnly: true,
  },
  {
    key: 'Connection',
    label: 'Server connection',
    desc: 'Shared cloud URL or local hub address',
    icon: 'wifi-outline',
  },
];

const THEME_OPTIONS: { mode: ThemeMode; label: string; desc: string; icon: IconName }[] = [
  { mode: 'light', label: 'Light', desc: 'Bright workspace', icon: 'sunny-outline' },
  { mode: 'dark', label: 'Dark', desc: 'Low-glare hub', icon: 'moon-outline' },
  { mode: 'system', label: 'System', desc: 'Match device setting', icon: 'phone-portrait-outline' },
];

function resolveUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${getApiBaseUrlSyncFallback()}${path}`;
}

export default function SettingsScreen({ navigation }: any) {
  const { user, can, settings, setSettings, refreshMe, isAdmin } = useAuth();
  const { colors, mode, setMode, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const canBrand = isAdmin || can('settings.edit');
  const [appName, setAppName] = useState(settings.appName || 'TeamTask');
  const [tagline, setTagline] = useState(
    settings.tagline || 'Plan work. Share progress. Stay aligned.'
  );
  const [logoPath, setLogoPath] = useState(settings.logoUrl || null);
  const [brandBusy, setBrandBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [brandMsg, setBrandMsg] = useState('');
  const [brandErr, setBrandErr] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const links = LINKS.filter((l) => {
    if (l.adminOnly && user?.role !== 'admin' && !can('settings.edit')) return false;
    return true;
  });

  async function saveBranding() {
    try {
      setBrandBusy(true);
      setBrandMsg('');
      setFieldErrors({});
      if (!appName.trim()) {
        setFieldErrors({ appName: 'App name is required' });
        setBrandErr(true);
        setBrandMsg('Please fix the highlighted fields');
        return;
      }
      const data = await api.updateBranding({
        appName: appName.trim(),
        tagline: tagline.trim(),
      });
      setSettings({ ...settings, ...data.settings });
      setBrandErr(false);
      setBrandMsg('Branding saved');
      await refreshMe();
    } catch (e: any) {
      if (e instanceof ApiError && e.fields) setFieldErrors(e.fields);
      setBrandErr(true);
      setBrandMsg(e.message || 'Failed to save branding');
    } finally {
      setBrandBusy(false);
    }
  }

  async function pickLogo() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const file = result.assets[0];
      setLogoBusy(true);
      setBrandMsg('');
      const data = await api.uploadLogo(
        file.uri,
        file.name || 'logo.png',
        file.mimeType,
        Platform.OS === 'web' ? (file as any).file : undefined
      );
      setLogoPath(data.logoUrl || data.settings?.logoUrl);
      setSettings({ ...settings, ...data.settings });
      setBrandErr(false);
      setBrandMsg('Logo updated');
      await refreshMe();
    } catch (e: any) {
      setBrandErr(true);
      setBrandMsg(e.message || 'Failed to upload logo');
    } finally {
      setLogoBusy(false);
    }
  }

  const logoUri = resolveUrl(logoPath);

  return (
    <AppShell navigation={navigation} active="Settings" title="Settings">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <Text style={styles.sectionHint}>
            Currently using {resolved} theme
            {mode === 'system' ? ' (from system)' : ''}.
          </Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => {
              const on = mode === opt.mode;
              return (
                <TouchableOpacity
                  key={opt.mode}
                  style={[styles.themeCard, on && styles.themeCardOn]}
                  onPress={() => setMode(opt.mode)}
                >
                  <Ionicons
                    name={opt.icon}
                    size={20}
                    color={on ? colors.accent : colors.textMuted}
                  />
                  <Text style={[styles.themeLabel, on && styles.themeLabelOn]}>{opt.label}</Text>
                  <Text style={styles.themeDesc}>{opt.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {canBrand ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>App branding</Text>
            <Text style={styles.sectionHint}>
              Logo and name appear on the login screen and in the sidebar.
            </Text>

            <View style={styles.logoRow}>
              <View style={styles.logoPreview}>
                {logoUri ? (
                  <Image source={{ uri: logoUri }} style={styles.logoImg} resizeMode="contain" />
                ) : (
                  <Ionicons name="image-outline" size={28} color={colors.textMuted} />
                )}
              </View>
              <TouchableOpacity style={styles.secondaryBtn} onPress={pickLogo} disabled={logoBusy}>
                {logoBusy ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <View style={styles.btnInner}>
                    <Ionicons name="cloud-upload-outline" size={16} color={colors.accent} />
                    <Text style={styles.secondaryBtnText}>Upload logo</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <FormField
              label="App name"
              required
              value={appName}
              onChangeText={setAppName}
              error={fieldErrors.appName}
              placeholder="TeamTask"
            />
            <FormField
              label="Tagline"
              value={tagline}
              onChangeText={setTagline}
              placeholder="Plan work. Share progress. Stay aligned."
            />

            {!!brandMsg && (
              <Text style={[styles.banner, brandErr ? styles.bannerErr : styles.bannerOk]}>
                {brandMsg}
              </Text>
            )}

            <TouchableOpacity style={styles.primaryBtn} onPress={saveBranding} disabled={brandBusy}>
              {brandBusy ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.primaryBtnText}>Save branding</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {links.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.card}
            onPress={() => navigation.navigate(item.key)}
          >
            <View style={styles.cardIcon}>
              <Ionicons name={item.icon} size={20} color={colors.accent} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{item.label}</Text>
              <Text style={styles.meta}>{item.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </AppShell>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    section: {
      backgroundColor: colors.bgCard,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 4,
      maxWidth: 560,
      width: '100%',
      gap: 4,
    },
    sectionTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
    sectionHint: { color: colors.textMuted, marginTop: 6, marginBottom: 12, fontSize: 13 },
    themeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    themeCard: {
      flexGrow: 1,
      minWidth: 96,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
      paddingVertical: 12,
      paddingHorizontal: 12,
      gap: 6,
    },
    themeCardOn: {
      borderColor: colors.accent,
      backgroundColor: colors.accentDim,
    },
    themeLabel: { color: colors.text, fontWeight: '800', fontSize: 14 },
    themeLabelOn: { color: colors.text },
    themeDesc: { color: colors.textMuted, fontSize: 11 },
    logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
    logoPreview: {
      width: 64,
      height: 64,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    logoImg: { width: 64, height: 64 },
    secondaryBtn: {
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      paddingHorizontal: spacing.btnPadH,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
      minHeight: 38,
      justifyContent: 'center',
    },
    secondaryBtnText: { color: colors.accent, fontWeight: '700', fontSize: spacing.btnFont },
    btnInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    primaryBtn: {
      backgroundColor: colors.accent,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      paddingHorizontal: spacing.btnPadH,
      alignItems: 'center',
      alignSelf: 'flex-start',
      minHeight: 38,
      justifyContent: 'center',
      marginTop: 6,
    },
    primaryBtnText: { color: colors.onAccent, fontWeight: '800', fontSize: spacing.btnFont },
    banner: {
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 4,
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
    card: {
      backgroundColor: colors.bgCard,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      maxWidth: 560,
      width: '100%',
    },
    cardIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.accentDim,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBody: { flex: 1, minWidth: 0 },
    cardTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
    meta: { color: colors.textMuted, marginTop: 4, fontSize: 12 },
  });
}
