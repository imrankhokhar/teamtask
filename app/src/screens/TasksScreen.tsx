import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, statusLabel } from '../api';
import { colors, statusColors } from '../theme';
import { useAuth } from '../auth';
import AppShell from '../components/AppShell';

export default function TasksScreen({ navigation }: any) {
  const { can } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      const data = await api.tasks();
      setTasks(data.tasks || []);
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

  return (
    <AppShell navigation={navigation} active="Tasks" title="Tasks">
      <View style={styles.root}>
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }}
          ListEmptyComponent={
            <Text style={styles.empty}>No tasks yet. Create one to get started.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('TaskDetail', { id: item.id })}
            >
              <View style={styles.row}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                <View style={[styles.badge, { backgroundColor: statusColors[item.status] || colors.textMuted }]}>
                  <Text style={styles.badgeText}>{statusLabel(item.status)}</Text>
                </View>
              </View>
              <Text style={styles.meta} numberOfLines={2}>
                {item.description || 'No description'}
              </Text>
              <Text style={styles.meta}>
                {(item.checklist || []).filter((c: any) => c.isChecked).length}/
                {(item.checklist || []).length} checklist ·{' '}
                {(item.assignees || []).length} people · {(item.teams || []).length} teams
              </Text>
              {item.status === 'completed' && can('tasks.delete') && (
                <TouchableOpacity
                  style={styles.deleteLinkWrap}
                  onPress={async (e) => {
                    e?.stopPropagation?.();
                    const ok =
                      typeof window !== 'undefined' && window.confirm
                        ? window.confirm(`Delete completed task "${item.title}"?`)
                        : true;
                    if (!ok) return;
                    try {
                      await api.deleteTask(item.id);
                      await load();
                    } catch (err: any) {
                      Alert.alert('Error', err.message);
                    }
                  }}
                >
                  <Text style={styles.deleteLink}>Delete completed</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
        />

        {can('tasks.create') ? (
          <View style={styles.fabRow}>
            <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('CreateTask')}>
              <Text style={styles.fabText}>+ Task</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '700', flex: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#062016', fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  meta: { color: colors.textMuted, marginTop: 8, fontSize: 13 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  fabRow: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    gap: 8,
  },
  fab: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  fabText: { color: '#062016', fontWeight: '800' },
  deleteLinkWrap: { marginTop: 10, alignSelf: 'flex-start' },
  deleteLink: { color: colors.danger, fontWeight: '700', fontSize: 12 },
});
