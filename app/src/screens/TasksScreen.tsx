import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, statusLabel } from '../api';
import { useTheme, ThemeColors, statusColors, spacing, listLayoutFor } from '../theme';
import { useAuth } from '../auth';
import { useContentWidth } from '../contentWidth';
import AppShell from '../components/AppShell';
import CardDescription from '../components/CardDescription';
import LoadingView from '../components/LoadingView';
import { useConfirm } from '../components/ConfirmModal';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function TasksScreen({ navigation }: any) {
  const { can } = useAuth();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const contentWidth = useContentWidth();
  const layout = useMemo(() => listLayoutFor(width, contentWidth), [width, contentWidth]);
  const styles = useMemo(() => makeStyles(colors, layout), [colors, layout]);
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
            style={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />
            }
            contentContainerStyle={styles.grid}
            ListEmptyComponent={
              <Text style={styles.empty}>No tasks yet. Create one to get started.</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.cardShell}>
              <TouchableOpacity
                style={styles.card}
                onPress={() => navigation.navigate('TaskDetail', { id: item.id })}
                activeOpacity={0.85}
              >
                <View style={styles.row}>
                  <Text style={styles.cardTitle} numberOfLines={1} ellipsizeMode="tail">
                    {item.title}
                  </Text>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: statusColors[item.status] || colors.textMuted },
                    ]}
                  >
                    <Text style={styles.badgeText} numberOfLines={1}>
                      {statusLabel(item.status)}
                    </Text>
                  </View>
                </View>
                <CardDescription text={item.description} colors={colors} />
                <Text style={styles.meta} numberOfLines={1}>
                  {(item.checklist || []).filter((c: any) => c.isChecked).length}/
                  {(item.checklist || []).length} checklist · {(item.assignees || []).length}{' '}
                  people · {(item.teams || []).length} teams
                </Text>
                {(can('tasks.edit') || can('tasks.delete')) && (
                  <View style={styles.actions}>
                    {can('tasks.edit') ? (
                      <TouchableOpacity
                        style={styles.mini}
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          navigation.navigate('CreateTask', { taskId: item.id });
                        }}
                      >
                        <Ionicons name="create-outline" size={14} color={colors.accent} />
                        <Text style={styles.miniText}>Edit</Text>
                      </TouchableOpacity>
                    ) : null}
                    {can('tasks.delete') ? (
                      <TouchableOpacity
                        style={[styles.mini, styles.danger]}
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
                        <Ionicons name="trash-outline" size={14} color="#fff" />
                        <Text style={styles.dangerText}>Delete</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
              </TouchableOpacity>
              </View>
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

function makeStyles(colors: ThemeColors, layout: ReturnType<typeof listLayoutFor>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg, minWidth: 0, overflow: 'hidden' },
    list: { flex: 1, width: '100%', minWidth: 0 },
    grid: {
      ...layout.grid,
    },
    cardShell: {
      width: layout.cardWidth,
      maxWidth: layout.cardWidth,
      alignSelf: 'flex-start',
      flexGrow: 0,
      flexShrink: 0,
    },
    card: {
      backgroundColor: colors.bgCard,
      borderRadius: spacing.cardRadius,
      padding: spacing.cardPad,
      borderWidth: 1,
      borderColor: colors.border,
      width: '100%',
      alignSelf: 'flex-start',
      flexGrow: 0,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
      alignItems: 'center',
      width: '100%',
      minWidth: 0,
    },
    cardTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
      flex: 1,
      minWidth: 0,
      ...(Platform.OS === 'web'
        ? ({
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          } as any)
        : null),
    },
    badge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      flexShrink: 0,
      maxWidth: '42%',
    },
    badgeText: {
      color: colors.onAccent,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    meta: {
      color: colors.textMuted,
      marginTop: 6,
      fontSize: 12,
      width: '100%',
      flexShrink: 1,
      minWidth: 0,
    },
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
    actions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
    mini: {
      backgroundColor: colors.accentDim,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    danger: { backgroundColor: colors.danger },
    miniText: { color: colors.accent, fontWeight: '700', fontSize: 12 },
    dangerText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  });
}
