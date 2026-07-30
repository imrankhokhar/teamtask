import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useAuth } from '../auth';
import { colors } from '../theme';
import AppShell from '../components/AppShell';

const LINKS = [
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

export default function SettingsScreen({ navigation }: any) {
  const { user, can } = useAuth();
  const links = LINKS.filter((l) => {
    if (l.adminOnly && user?.role !== 'admin' && !can('settings.edit')) return false;
    return true;
  });

  return (
    <AppShell navigation={navigation} active="Settings" title="Settings">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  meta: { color: colors.textMuted, marginTop: 6 },
});
