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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isPhone = width < 768;
  const [expanded, setExpanded] = useState(true);
  const collapsed = !expanded;
  const overlay = isPhone && expanded;
  // Phone WebView/PWA often reports inset 0 while drawing under the status bar.
  const minTop = isPhone ? 44 : 8;
  const safeTop =
    Platform.OS === 'web'
      ? (`max(${Math.max(insets.top || 0, minTop)}px, env(safe-area-inset-top, 0px))` as any)
      : Math.max(insets.top || 0, 12);
  const styles = useMemo(
    () => makeStyles(colors, { isPhone, expanded, width }),
    [colors, isPhone, expanded, width]
  );
  const items = MENU.filter((m) => !m.perm || can(m.perm));
  const [menuOpen, setMenuOpen] = useState(false);
  const photo = resolveUrl(user?.avatarUrl);
  const logo = resolveUrl(settings?.logoUrl);
  const appName = settings?.appName || 'TeamTask';
  const tip = info || MODULE_INFO[active] || '';

  function go(screen: string) {
    setMenuOpen(false);
    if (isPhone) setExpanded(false);
    navigation.navigate(screen);
  }

  const sidebar = (
    <View style={[styles.sidebar, overlay && styles.sidebarOverlay, { paddingTop: safeTop }]}>
      <View style={styles.brandRow}>
        {logo ? (
          <Image source={{ uri: logo }} style={styles.brandLogo} resizeMode="contain" />
        ) : (
          <Ionicons name="layers" size={20} color={colors.accent} />
        )}
        {expanded ? (
          <Text style={styles.brand} numberOfLines={1}>
            {appName}
          </Text>
        ) : null}
        <TouchableOpacity
          style={styles.radioHit}
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="radio"
          accessibilityState={{ checked: collapsed }}
          accessibilityLabel={collapsed ? 'Show menu names' : 'Hide menu names'}
        >
          <View style={[styles.radioOuter, collapsed && styles.radioOuterOn]}>
            {collapsed ? <View style={styles.radioInner} /> : null}
          </View>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.navScroll}
        contentContainerStyle={styles.navScrollInner}
        showsVerticalScrollIndicator={false}
      >
        {items.map((item) => {
          const on = active === item.key;
          const color = on ? colors.text : colors.textMuted;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.navItem, on && styles.navItemOn, !expanded && styles.navItemIcon]}
              onPress={() => go(item.key)}
              accessibilityLabel={item.label}
            >
              <Ionicons name={on ? item.iconOn : item.icon} size={20} color={color} />
              {expanded ? (
                <Text style={[styles.navText, on && styles.navTextOn]} numberOfLines={1}>
                  {item.label}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <TouchableOpacity onPress={logout} style={[styles.logout, !expanded && styles.navItemIcon]}>
        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        {expanded ? <Text style={styles.logoutText}>Logout</Text> : null}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.root}>
      {overlay ? (
        <Pressable style={styles.dim} onPress={() => setExpanded(false)} />
      ) : null}
      {sidebar}
      <View style={styles.content}>
        <View style={[styles.contentHeader, { paddingTop: safeTop }]}>
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
            {!isPhone ? (
              <Text style={styles.userName} numberOfLines={1}>
                {user?.name || 'Account'}
              </Text>
            ) : null}
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

function makeStyles(
  colors: ThemeColors,
  opts: { isPhone: boolean; expanded: boolean; width: number }
) {
  const { isPhone, expanded, width } = opts;
  const openW = isPhone ? Math.min(240, Math.max(200, width * 0.78)) : 232;
  const railW = 56;
  const sidebarW = expanded ? openW : railW;
  const overlay = isPhone && expanded;

  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
      flexDirection: 'row',
      width: '100%',
      maxWidth: '100%',
      overflow: 'hidden',
    },
    dim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay,
      zIndex: 20,
    },
    sidebar: {
      width: overlay ? railW : sidebarW,
      backgroundColor: colors.bgElevated,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      paddingHorizontal: expanded ? 10 : 6,
      paddingBottom: 12,
      zIndex: 30,
    },
    sidebarOverlay: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: openW,
      height: '100%',
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 8,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
      minHeight: 36,
    },
    brandLogo: { width: 28, height: 28, borderRadius: 6 },
    brand: {
      color: colors.accent,
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: -0.3,
      flex: 1,
      minWidth: 0,
    },
    radioHit: {
      marginLeft: 'auto',
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOuter: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.text,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    radioOuterOn: { borderColor: colors.accent },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.accent,
    },
    navScroll: { flex: 1 },
    navScrollInner: { gap: 2, paddingVertical: 6 },
    navItem: {
      borderRadius: 8,
      paddingVertical: 9,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    navItemIcon: { justifyContent: 'center', paddingHorizontal: 0 },
    navItemOn: { backgroundColor: colors.accentDim },
    navText: { color: colors.textMuted, fontWeight: '600', fontSize: 13, flex: 1 },
    navTextOn: { color: colors.text, fontWeight: '800' },
    logout: {
      paddingVertical: 9,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    logoutText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
    content: { flex: 1, minWidth: 0, overflow: 'hidden', flexDirection: 'column' },
    contentHeader: {
      paddingHorizontal: isPhone ? 10 : 16,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.bg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      zIndex: 10,
      flexShrink: 0,
      ...(Platform.OS === 'web' ? { position: 'sticky' as any, top: 0 } : {}),
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
      fontSize: isPhone ? 16 : 18,
      fontWeight: '800',
      letterSpacing: -0.2,
      flexShrink: 1,
    },
    userChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      maxWidth: isPhone ? 72 : 240,
      flexShrink: 0,
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
    contentBody: { flex: 1, minWidth: 0, overflow: 'hidden' },
    menuBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
      paddingTop: 72,
      paddingRight: 12,
    },
    menuCard: {
      width: Math.min(220, width - 24),
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
