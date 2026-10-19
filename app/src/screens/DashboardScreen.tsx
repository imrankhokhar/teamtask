import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, getApiBaseUrlSyncFallback } from '../api';
import { useTheme, ThemeColors } from '../theme';
import AppShell from '../components/AppShell';

const PERIODS: { key: string; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This week' },
  { key: 'last_week', label: 'Last week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
];

function resolveUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${getApiBaseUrlSyncFallback()}${path}`;
}

function statusLabel(s: string) {
  return String(s || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DashboardScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [period, setPeriod] = useState('this_week');
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr('');
      const res = await api.dashboard(period);
      setData(res);
    } catch (e: any) {
      setErr(e.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = data?.counts || { tasks: 0, teams: 0, users: 0 };
  const chart = data?.chart?.byStatus || [];
  const maxBar = Math.max(1, ...chart.map((c: any) => c.count || 0));
  const announcements = data?.announcements || [];
  const periodLabel = PERIODS.find((p) => p.key === period)?.label || 'This week';

  return (
    <AppShell navigation={navigation} active="Dashboard" title="Dashboard">
      <ScrollView contentContainerStyle={styles.scroll}>
        {err ? <Text style={styles.err}>{err}</Text> : null}

        <View style={styles.statRow}>
          <StatCard
            styles={styles}
            colors={colors}
            icon="checkbox-outline"
            label="Total tasks"
            value={counts.tasks}
          />
          <StatCard
            styles={styles}
            colors={colors}
            icon="people-outline"
            label="Total teams"
            value={counts.teams}
          />
          <StatCard
            styles={styles}
            colors={colors}
            icon="person-outline"
            label="Total users"
            value={counts.users}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Tasks</Text>
            <TouchableOpacity
              style={styles.filterBtn}
              onPress={() => setFilterOpen((v) => !v)}
            >
              <Text style={styles.filterText}>{periodLabel}</Text>
              <Ionicons
                name={filterOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.text}
              />
            </TouchableOpacity>
          </View>
          {filterOpen ? (
            <View style={styles.filterMenu}>
              {PERIODS.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.filterItem, period === p.key && styles.filterItemOn]}
                  onPress={() => {
                    setPeriod(p.key);
                    setFilterOpen(false);
                  }}
                >
                  <Text
                    style={[styles.filterItemText, period === p.key && styles.filterItemTextOn]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
          ) : chart.length === 0 ? (
            <Text style={styles.empty}>No tasks in this period.</Text>
          ) : (
            <View style={styles.chart}>
              {chart.map((row: any) => (
                <View key={row.status} style={styles.barRow}>
                  <Text style={styles.barLabel} numberOfLines={1}>
                    {statusLabel(row.status)}
                  </Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${Math.round((row.count / maxBar) * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.barCount}>{row.count}</Text>
                </View>
              ))}
              <Text style={styles.chartFoot}>
                {data?.chart?.total || 0} task{(data?.chart?.total || 0) === 1 ? '' : 's'} in period
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>News / Announcements</Text>
          <Text style={styles.sectionHint}>Posted by admins for everyone on the hub.</Text>
          {announcements.length === 0 ? (
            <Text style={styles.empty}>No announcements yet.</Text>
          ) : (
            announcements.map((a: any) => {
              const img = resolveUrl(a.imageUrl);
              return (
                <View key={a.id} style={styles.newsCard}>
                  {img ? (
                    <Image source={{ uri: img }} style={styles.newsImg} resizeMode="cover" />
                  ) : null}
                  <Text style={styles.newsTitle}>{a.title}</Text>
                  {!!a.body && <Text style={styles.newsBody}>{a.body}</Text>}
                  <Text style={styles.newsMeta}>
                    {a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </AppShell>
  );
}

function StatCard({
  styles,
  colors,
  icon,
  label,
  value,
}: {
  styles: any;
  colors: ThemeColors;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: number;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={22} color={colors.accent} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, gap: 14, paddingBottom: 40 },
    err: { color: colors.danger, marginBottom: 4 },
    statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statCard: {
      flexGrow: 1,
      minWidth: Platform.OS === 'web' ? 160 : 140,
      backgroundColor: colors.bgCard,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 6,
    },
    statValue: { color: colors.text, fontSize: 28, fontWeight: '800' },
    statLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
    section: {
      backgroundColor: colors.bgCard,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 10,
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
    sectionHint: { color: colors.textMuted, fontSize: 13, marginTop: -4 },
    filterBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    filterText: { color: colors.text, fontWeight: '700', fontSize: 13 },
    filterMenu: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: colors.bgElevated,
    },
    filterItem: { paddingHorizontal: 12, paddingVertical: 10 },
    filterItemOn: { backgroundColor: colors.accent + '22' },
    filterItemText: { color: colors.text, fontWeight: '600' },
    filterItemTextOn: { color: colors.accent, fontWeight: '800' },
    empty: { color: colors.textMuted, fontSize: 14, paddingVertical: 8 },
    chart: { gap: 10, marginTop: 4 },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    barLabel: { width: 100, color: colors.textMuted, fontSize: 12, fontWeight: '600' },
    barTrack: {
      flex: 1,
      height: 14,
      borderRadius: 7,
      backgroundColor: colors.bgElevated,
      overflow: 'hidden',
    },
    barFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 7 },
    barCount: { width: 28, textAlign: 'right', color: colors.text, fontWeight: '700', fontSize: 12 },
    chartFoot: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
    newsCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
      backgroundColor: colors.bgElevated,
      gap: 6,
      marginTop: 4,
    },
    newsImg: { width: '100%', height: 160, borderRadius: 10, marginBottom: 4 },
    newsTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
    newsBody: { color: colors.text, fontSize: 14, lineHeight: 20 },
    newsMeta: { color: colors.textMuted, fontSize: 12 },
  });
}
