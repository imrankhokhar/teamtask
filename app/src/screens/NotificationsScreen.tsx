import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { useTheme, ThemeColors, spacing, listLayoutFor } from '../theme';
import { useContentWidth } from '../contentWidth';
import AppShell from '../components/AppShell';
import LoadingView from '../components/LoadingView';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatDateTime } from '../format';
import { onAppNotify } from '../notifyBus';

export default function NotificationsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const contentWidth = useContentWidth();
  const layout = useMemo(() => listLayoutFor(width, contentWidth), [width, contentWidth]);
  const styles = useMemo(() => makeStyles(colors, layout), [colors, layout]);
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      const data = await api.notifications();
      setItems(data.notifications || []);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setRefreshing(false);
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    return onAppNotify((n) => {
      setItems((list) => {
        if (!n?.id || list.some((x) => x.id === n.id)) return list;
        return [n, ...list];
      });
    });
  }, []);

  async function markAll() {
    await api.readAllNotifications();
    await load();
  }

  const showInitialLoad = (!loaded || refreshing) && items.length === 0;

  return (
    <AppShell navigation={navigation} active="Notifications" title="Notifications">
      <View style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.markAll} onPress={markAll}>
            <Ionicons name="checkmark-done-outline" size={16} color={colors.accent} />
            <Text style={styles.link}>Mark all read</Text>
          </TouchableOpacity>
        </View>

        {showInitialLoad ? (
          <LoadingView label="Loading…" compact />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            style={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />
            }
            contentContainerStyle={styles.grid}
            ListEmptyComponent={<Text style={styles.empty}>No notifications yet</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.card, !item.read && !item.isRead && styles.unread]}
                onPress={() => {
                  if (item.taskId) navigation.navigate('TaskDetail', { id: item.taskId });
                }}
              >
                <Text style={styles.cardTitle}>{item.title || item.type}</Text>
                <Text style={styles.meta}>{item.body || item.message}</Text>
                <Text style={styles.time}>{formatDateTime(item.createdAt)}</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </AppShell>
  );
}

function makeStyles(colors: ThemeColors, layout: ReturnType<typeof listLayoutFor>) {
  return StyleSheet.create({
    root: { flex: 1, minWidth: 0, overflow: 'hidden' },
    list: { flex: 1, width: '100%', minWidth: 0 },
    header: {
      paddingHorizontal: layout.pad,
      paddingTop: 12,
      gap: 8,
    },
    markAll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-end',
      marginBottom: 4,
    },
    link: { color: colors.accent, fontWeight: '700' },
    grid: {
      ...layout.grid,
    },
    card: {
      backgroundColor: colors.bgCard,
      borderRadius: spacing.cardRadius,
      padding: spacing.cardPad,
      borderWidth: 1,
      borderColor: colors.border,
      ...layout.card,
    },
    unread: { borderColor: colors.accent },
    cardTitle: { color: colors.text, fontWeight: '700', fontSize: 15, minWidth: 0 },
    meta: { color: colors.textMuted, marginTop: 4, lineHeight: 18, fontSize: 12 },
    time: { color: colors.textMuted, marginTop: 8, fontSize: 11 },
    empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40, width: '100%' },
  });
}
