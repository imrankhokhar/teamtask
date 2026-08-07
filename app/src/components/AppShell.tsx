import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useAuth } from '../auth';
import { useTheme, ThemeColors } from '../theme';

type NavItem = {
  key: string;
  label: string;
  perm?: string;
};

const MENU: NavItem[] = [
  { key: 'Tasks', label: 'Tasks', perm: 'tasks.view' },
  { key: 'Teams', label: 'Teams', perm: 'teams.view' },
  { key: 'Users', label: 'Users', perm: 'users.view' },
  { key: 'Roles', label: 'Roles & Permissions', perm: 'roles.view' },
  { key: 'Notifications', label: 'Notifications', perm: 'notifications.view' },
  { key: 'Settings', label: 'Settings', perm: 'settings.view' },
];

export default function AppShell({
  navigation,
  active,
  children,
  title,
}: {
  navigation: any;
  active: string;
  children: React.ReactNode;
  title?: string;
}) {
  const { user, logout, can } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const sidebarWide = width >= 900 || Platform.OS === 'web';
  const items = MENU.filter((m) => !m.perm || can(m.perm));

  const sidebar = (
    <View style={[styles.sidebar, !sidebarWide && styles.sidebarCompact]}>
      <Text style={styles.brand}>TeamTask</Text>
      <Text style={styles.userLine} numberOfLines={2}>
        {user?.name}
        {'\n'}
        <Text style={styles.roleLine}>{user?.roleName || user?.role}</Text>
      </Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 4, paddingVertical: 8 }}>
        {items.map((item) => {
          const on = active === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.navItem, on && styles.navItemOn]}
              onPress={() => navigation.navigate(item.key)}
            >
              <Text style={[styles.navText, on && styles.navTextOn]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <TouchableOpacity onPress={logout} style={styles.logout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.root, sidebarWide ? styles.row : styles.col]}>
      {sidebar}
      <View style={styles.content}>
        {title ? (
          <View style={styles.contentHeader}>
            <Text style={styles.contentTitle}>{title}</Text>
          </View>
        ) : null}
        <View style={styles.contentBody}>{children}</View>
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    row: { flexDirection: 'row' },
    col: { flexDirection: 'column' },
    sidebar: {
      width: 232,
      backgroundColor: colors.bgElevated,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      paddingTop: Platform.OS === 'web' ? 20 : 48,
      paddingHorizontal: 12,
      paddingBottom: 16,
    },
    sidebarCompact: {
      width: '100%',
      borderRightWidth: 0,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingTop: Platform.OS === 'web' ? 12 : 40,
      maxHeight: 168,
    },
    brand: { color: colors.accent, fontSize: 22, fontWeight: '800', marginBottom: 8, letterSpacing: -0.4 },
    userLine: { color: colors.text, fontSize: 13, marginBottom: 8, lineHeight: 18 },
    roleLine: { color: colors.textMuted, fontSize: 12 },
    navItem: {
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    navItemOn: { backgroundColor: colors.accentDim },
    navText: { color: colors.textMuted, fontWeight: '600' },
    navTextOn: { color: colors.text, fontWeight: '800' },
    logout: { paddingVertical: 10, paddingHorizontal: 12 },
    logoutText: { color: colors.danger, fontWeight: '700' },
    content: { flex: 1, minWidth: 0 },
    contentHeader: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.bg,
    },
    contentTitle: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
    contentBody: { flex: 1 },
  });
}
