import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useAuth } from '../auth';
import { useTheme, ThemeColors, ThemeMode } from '../theme';
import AppShell from '../components/AppShell';

const LINKS = [
  { key: 'ChangePassword', label: 'Change password', desc: 'Update your account password' },
  { key: 'Sounds', label: 'Notification sounds', desc: 'Tones for alerts and reminders' },
  { key: 'EmailSettings', label: 'Email / SMTP', desc: 'Configure outbound email' },
  {
    key: 'EmailTemplates',
    label: 'Email templates',
    desc: 'Reply, team, assignment, status & checklist email wording',
    adminOnly: true,
  },
  { key: 'Admin', label: 'Admin & storage', desc: 'Storage info and admin tools', adminOnly: true },
  {
    key: 'Connection',
    label: 'Server connection',
    desc: 'Shared cloud URL or local hub address',
  },
];

const THEME_OPTIONS: { mode: ThemeMode; label: string; desc: string }[] = [
  { mode: 'light', label: 'Light', desc: 'Bright workspace' },
  { mode: 'dark', label: 'Dark', desc: 'Low-glare hub' },
  { mode: 'system', label: 'System', desc: 'Match device setting' },
];

export default function SettingsScreen({ navigation }: any) {
  const { user, can } = useAuth();
  const { colors, mode, setMode, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const links = LINKS.filter((l) => {
    if (l.adminOnly && user?.role !== 'admin' && !can('settings.edit')) return false;
    return true;
  });

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
                  <Text style={[styles.themeLabel, on && styles.themeLabelOn]}>{opt.label}</Text>
                  <Text style={styles.themeDesc}>{opt.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {links.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.card}
            onPress={() => navigation.navigate(item.key)}
          >
            <Text style={styles.cardTitle}>{item.label}</Text>
            <Text style={styles.meta}>{item.desc}</Text>
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
    },
    themeCardOn: {
      borderColor: colors.accent,
      backgroundColor: colors.accentDim,
    },
    themeLabel: { color: colors.text, fontWeight: '800', fontSize: 14 },
    themeLabelOn: { color: colors.text },
    themeDesc: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
    card: {
      backgroundColor: colors.bgCard,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
    meta: { color: colors.textMuted, marginTop: 6 },
  });
}
