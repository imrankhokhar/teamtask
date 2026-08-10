import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Platform,
  Image,
  Pressable,
  Modal,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../auth';
import { useTheme, ThemeColors } from '../theme';
import { getApiBaseUrlSyncFallback } from '../api';
import InfoTip from './InfoTip';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type NavItem = {
  key: string;
  label: string;
  icon: IconName;
  iconOn: IconName;
  perm?: string;
};

const MENU: NavItem[] = [
  {
    key: 'Tasks',
    label: 'Tasks',
    icon: 'checkbox-outline',
    iconOn: 'checkbox',
    perm: 'tasks.view',
  },
  {
    key: 'Teams',
    label: 'Teams',
    icon: 'people-outline',
    iconOn: 'people',
    perm: 'teams.view',
  },
  {
    key: 'Users',
    label: 'Users',
    icon: 'person-outline',
    iconOn: 'person',
    perm: 'users.view',
  },
  {
    key: 'Roles',
    label: 'Roles & Permissions',
    icon: 'shield-checkmark-outline',
    iconOn: 'shield-checkmark',
    perm: 'roles.view',
  },
  {
    key: 'Notifications',
    label: 'Notifications',
    icon: 'notifications-outline',
    iconOn: 'notifications',
    perm: 'notifications.view',
  },
  {
    key: 'FuelCal',
    label: 'Fuel Cal',
    icon: 'speedometer-outline',
    iconOn: 'speedometer',
    perm: 'fuel.view',
  },
  {
    key: 'Settings',
    label: 'Settings',
    icon: 'settings-outline',
    iconOn: 'settings',
    perm: 'settings.view',
  },
];

const MODULE_INFO: Record<string, string> = {
  Tasks: 'Create and track work. Open a card for details, or use Edit on the card to change it.',
  Teams:
    'Non-admins only see teams they belong to. Admins (or roles with “view all teams”) see every team.',
  Users: 'Create accounts, assign roles, and manage who can access this hub.',
  Roles: 'Define what each role can view and change across modules.',
  Notifications: 'Only tasks you are assigned to (or report) appear here.',
  FuelCal:
    'Calculate monthly fuel-price impact per person from distance, mileage, hike amount, and work days.',
  Settings: 'Theme, password, sounds, email, branding, and connection options.',
};

function resolveUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${getApiBaseUrlSyncFallback()}${path}`;
}

function initials(name?: string) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

export default function AppShell({
  navigation,
  active,
  children,
  title,
  info,
}: {
  navigation: any;
  active: string;
  children: React.ReactNode;
  title?: string;
  info?: string;
}) {
  const { user, logout, can, settings } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const sidebarWide = width >= 900 || Platform.OS === 'web';
  const items = MENU.filter((m) => !m.perm || can(m.perm));
  const [menuOpen, setMenuOpen] = useState(false);
  const photo = resolveUrl(user?.avatarUrl);
  const logo = resolveUrl(settings?.logoUrl);
  const appName = settings?.appName || 'TeamTask';
  const tip = info || MODULE_INFO[active] || '';

  function go(screen: string) {
    setMenuOpen(false);
    navigation.navigate(screen);
  }

  const sidebar = (
    <View style={[styles.sidebar, !sidebarWide && styles.sidebarCompact]}>
      <View style={styles.brandRow}>
        {logo ? (
          <Image source={{ uri: logo }} style={styles.brandLogo} resizeMode="contain" />
        ) : (
          <Ionicons name="layers" size={20} color={colors.accent} />
        )}
        <Text style={styles.brand} numberOfLines={1}>
          {appName}
        </Text>
      </View>
      <ScrollView
        style={{ flex: sidebarWide ? 1 : undefined }}
        horizontal={!sidebarWide}
        contentContainerStyle={
          sidebarWide
            ? { gap: 2, paddingVertical: 8 }
            : { gap: 6, paddingVertical: 4, flexDirection: 'row' }
        }
        showsHorizontalScrollIndicator={false}
      >
        {items.map((item) => {
          const on = active === item.key;
          const color = on ? colors.text : colors.textMuted;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.navItem, on && styles.navItemOn]}
              onPress={() => navigation.navigate(item.key)}
            >
              <Ionicons name={on ? item.iconOn : item.icon} size={18} color={color} />
              <Text style={[styles.navText, on && styles.navTextOn]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {sidebarWide ? (
        <TouchableOpacity onPress={logout} style={styles.logout}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, sidebarWide ? styles.row : styles.col]}>
      {sidebar}
      <View style={styles.content}>
        <View style={styles.contentHeader}>
          <View style={styles.titleRow}>
            <Text style={styles.contentTitle} numberOfLines={1}>
              {title || active}
            </Text>
            {tip ? <InfoTip text={tip} /> : null}
          </View>
          <TouchableOpacity
            style={styles.userChip}
            onPress={() => setMenuOpen(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.userName} numberOfLines={1}>
              {user?.name || 'Account'}
            </Text>
            <View style={styles.avatar}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarText}>{initials(user?.name)}</Text>
              )}
            </View>
            <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.contentBody}>{children}</View>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuCard}>
            <Text style={styles.menuEmail} numberOfLines={1}>
              {user?.email}
            </Text>
            <TouchableOpacity style={styles.menuItem} onPress={() => go('Profile')}>
              <Ionicons name="person-circle-outline" size={18} color={colors.text} />
              <Text style={styles.menuItemText}>Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => go('Settings')}>
              <Ionicons name="settings-outline" size={18} color={colors.text} />
              <Text style={styles.menuItemText}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => go('Notifications')}>
              <Ionicons name="notifications-outline" size={18} color={colors.text} />
              <Text style={styles.menuItemText}>Notifications</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuDanger]}
              onPress={() => {
                setMenuOpen(false);
                logout();
              }}
            >
              <Ionicons name="log-out-outline" size={18} color={colors.danger} />
              <Text style={styles.menuDangerText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    row: { flexDirection: 'row' },
    col: { flexDirection: 'column' },
    sidebar: {
      width: 220,
      backgroundColor: colors.bgElevated,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      paddingTop: Platform.OS === 'web' ? 16 : 44,
      paddingHorizontal: 10,
      paddingBottom: 12,
    },
    sidebarCompact: {
      width: '100%',
      borderRightWidth: 0,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingTop: Platform.OS === 'web' ? 10 : 36,
      maxHeight: 96,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
      paddingHorizontal: 4,
    },
    brandLogo: { width: 28, height: 28, borderRadius: 6 },
    brand: {
      color: colors.accent,
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.3,
      flex: 1,
    },
    navItem: {
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    navItemOn: { backgroundColor: colors.accentDim },
    navText: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
    navTextOn: { color: colors.text, fontWeight: '800' },
    logout: {
      paddingVertical: 8,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    logoutText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
    content: { flex: 1, minWidth: 0 },
    contentHeader: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.bg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      zIndex: 10,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
      minWidth: 0,
    },
    contentTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.2,
      flexShrink: 1,
    },
    userChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      maxWidth: 240,
    },
    userName: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 13,
      maxWidth: 140,
      textAlign: 'right',
    },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.accentDim,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImg: { width: 34, height: 34 },
    avatarText: { color: colors.accent, fontWeight: '800', fontSize: 12 },
    contentBody: { flex: 1 },
    menuBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
      paddingTop: Platform.OS === 'web' ? 56 : 72,
      paddingRight: 12,
    },
    menuCard: {
      width: 220,
      backgroundColor: colors.bgCard,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 6,
      overflow: 'hidden',
    },
    menuEmail: {
      color: colors.textMuted,
      fontSize: 11,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    menuItem: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    menuItemText: { color: colors.text, fontWeight: '700', fontSize: 14 },
    menuDanger: { borderTopWidth: 1, borderTopColor: colors.border },
    menuDangerText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
  });
}
