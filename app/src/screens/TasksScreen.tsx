import React, { useCallback, useMemo, useState } from 'react';
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
import { useTheme, ThemeColors, statusColors, spacing } from '../theme';
import { useAuth } from '../auth';
import AppShell from '../components/AppShell';
import LoadingView from '../components/LoadingView';
import { useConfirm } from '../components/ConfirmModal';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function TasksScreen({ navigation }: any) {
  const { can } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { confirm, dialog } = useConfirm();
  const [tasks, setTasks] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      const data = await api.tasks();
      setTasks(data.tasks || []);
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

  const showInitialLoad = (!loaded || refreshing) && tasks.length === 0;

  return (
    <AppShell navigation={navigation} active="Tasks" title="Tasks">
      <View style={styles.root}>
        {showInitialLoad ? (
          <LoadingView label="Loading tasks…" />
        ) : (
          <FlatList
            data={tasks}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />
            }
            contentContainerStyle={styles.grid}
            ListEmptyComponent={
              <Text style={styles.empty}>No tasks yet. Create one to get started.</Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => navigation.navigate('TaskDetail', { id: item.id })}
              >
                <View style={styles.row}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: statusColors[item.status] || colors.textMuted },
                    ]}
                  >
                    <Text style={styles.badgeText}>{statusLabel(item.status)}</Text>
                  </View>
                </View>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.description || 'No description'}
                </Text>
                <Text style={styles.meta}>
                  {(item.checklist || []).filter((c: any) => c.isChecked).length}/
                  {(item.checklist || []).length} checklist · {(item.assignees || []).length} people ·{' '}
                  {(item.teams || []).length} teams
                </Text>
                {can('tasks.delete') && (
                  <TouchableOpacity
                    style={styles.deleteLinkWrap}
                    onPress={async (e) => {
                      e?.stopPropagation?.();
                      const ok = await confirm({
                        title: 'Delete task',
                        message: `Delete task "${item.title}"? This cannot be undone.`,
                        confirmLabel: 'Delete',
                      });
                      if (!ok) return;
                      try {
                        await api.deleteTask(item.id);
                        await load();
                      } catch (err: any) {
                        Alert.alert('Error', err.message);
                      }
                    }}
                  >
                  <View style={styles.deleteLinkRow}>
                    <Ionicons name="trash-outline" size={13} color={colors.danger} />
                    <Text style={styles.deleteLink}>Delete</Text>
                  </View>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            )}
          />
        )}

        {can('tasks.create') ? (
          <View style={styles.fabRow}>
            <TouchableOpacity
              style={styles.fab}
              onPress={() =>
                navigation.navigate({
                  name: 'CreateTask',
                  params: { taskId: undefined },
                  merge: false,
                })
              }
            >
              <View style={styles.fabInner}>
                <Ionicons name="add" size={18} color={colors.onAccent} />
                <Text style={styles.fabText}>Task</Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
      {dialog}
    </AppShell>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.cardGap,
      padding: 16,
      paddingBottom: 100,
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
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
    cardTitle: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 },
    badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    badgeText: {
      color: colors.onAccent,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    meta: { color: colors.textMuted, marginTop: 4, fontSize: 12 },
    empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40, width: '100%' },
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
      paddingHorizontal: 14,
      paddingVertical: spacing.btnPadV,
    },
    fabInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    fabText: { color: colors.onAccent, fontWeight: '800' },
    deleteLinkWrap: { marginTop: 10, alignSelf: 'flex-start' },
    deleteLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    deleteLink: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  });
}
