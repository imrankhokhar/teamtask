import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { useTheme, ThemeColors, spacing } from '../theme';
import AppShell from '../components/AppShell';
import LoadingView from '../components/LoadingView';
import InfoBanner from '../components/InfoBanner';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatDateTime } from '../format';

export default function NotificationsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

  async function markAll() {
    await api.readAllNotifications();
    await load();
  }

  const showInitialLoad = (!loaded || refreshing) && items.length === 0;

  return (
    <AppShell navigation={navigation} active="Notifications" title="Notifications">
      <View style={styles.root}>
        <View style={styles.header}>
          <InfoBanner>Only tasks you are assigned to (or report) appear here.</InfoBanner>
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
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />
            }
            contentContainerStyle={styles.grid}
            ListEmptyComponent={<Text style={styles.empty}>No notifications yet</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.card, !item.isRead && styles.unread]}
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

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1 },
    header: {
      paddingHorizontal: 16,
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
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.cardGap,
      padding: 16,
      paddingBottom: 40,
      alignItems: 'flex-start',
    },
    card: {
      backgroundColor: colors.bgCard,
      borderRadius: spacing.cardRadius,
      padding: spacing.cardPad,
      borderWidth: 1,
      borderColor: colors.border,
      width: spacing.cardWidth,
      maxWidth: '100%',
    },
    unread: { borderColor: colors.accent },
    cardTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
    meta: { color: colors.textMuted, marginTop: 4, lineHeight: 18, fontSize: 12 },
    time: { color: colors.textMuted, marginTop: 8, fontSize: 11 },
    empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40, width: '100%' },
  });
}
