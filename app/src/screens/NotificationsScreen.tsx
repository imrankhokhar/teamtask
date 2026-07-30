import React, { useCallback, useState } from 'react';
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
import { colors } from '../theme';
import AppShell from '../components/AppShell';

export default function NotificationsScreen({ navigation }: any) {
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      const data = await api.notifications();
      setItems(data.notifications || []);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setRefreshing(false);
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

  return (
    <AppShell navigation={navigation} active="Notifications" title="Notifications">
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.sub}>Only tasks you are assigned to (or report) appear here.</Text>
          <TouchableOpacity onPress={markAll}>
            <Text style={styles.link}>Mark all read</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}
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
              <Text style={styles.time}>{item.createdAt}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sub: { color: colors.textMuted, flex: 1, lineHeight: 18 },
  link: { color: colors.accent, fontWeight: '700' },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unread: { borderColor: colors.accent },
  cardTitle: { color: colors.text, fontWeight: '700' },
  meta: { color: colors.textMuted, marginTop: 6, lineHeight: 18 },
  time: { color: colors.textMuted, marginTop: 8, fontSize: 11 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
});
