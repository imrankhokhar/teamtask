import React, { useCallback, useEffect, useMemo, useState, createElement } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
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

type Series = {
  id: string;
  title: string;
  status: string;
  color: string;
  values: (number | null)[];
};

function TaskLineChart({
  labels,
  series,
  yMax,
  width,
  colors,
}: {
  labels: string[];
  series: Series[];
  yMax: number;
  width: number;
  colors: ThemeColors;
}) {
  const height = 200;
  const padL = 28;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const w = Math.max(280, width);
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;
  const n = Math.max(1, labels.length - 1);
  const maxY = Math.max(1, yMax || 5);

  const xAt = (i: number) => padL + (labels.length <= 1 ? innerW / 2 : (i / n) * innerW);
  const yAt = (v: number) => padT + innerH - (v / maxY) * innerH;

  const grid = [1, 2, 3, 4, 5].map((v) => ({
    v,
    y: yAt(v),
  }));

  const polylines = series.map((s) => {
    const pts: string[] = [];
    s.values.forEach((v, i) => {
      if (v == null) return;
      pts.push(`${xAt(i)},${yAt(v)}`);
    });
    return { ...s, points: pts.join(' ') };
  });

  // Label ticks: first, middle, last
  const tickIdx = Array.from(
    new Set(
      [0, Math.floor(labels.length / 2), labels.length - 1].filter(
        (i) => i >= 0 && i < labels.length
      )
    )
  );

  if (Platform.OS === 'web') {
    return createElement(
      'svg',
      {
        width: w,
        height,
        viewBox: `0 0 ${w} ${height}`,
        style: { maxWidth: '100%', display: 'block' },
      },
      ...grid.map((g) =>
        createElement('line', {
          key: `g${g.v}`,
          x1: padL,
          x2: w - padR,
          y1: g.y,
          y2: g.y,
          stroke: colors.border,
          strokeWidth: 1,
          strokeDasharray: '4 4',
        })
      ),
      createElement('line', {
        x1: padL,
        y1: padT,
        x2: padL,
        y2: height - padB,
        stroke: colors.border,
        strokeWidth: 1,
      }),
      createElement('line', {
        x1: padL,
        y1: height - padB,
        x2: w - padR,
        y2: height - padB,
        stroke: colors.border,
        strokeWidth: 1,
      }),
      ...polylines.map((s) =>
        s.points
          ? createElement('polyline', {
              key: s.id,
              fill: 'none',
              stroke: s.color,
              strokeWidth: 2.5,
              strokeLinejoin: 'round',
              strokeLinecap: 'round',
              points: s.points,
            })
          : null
      ),
      ...series.flatMap((s) =>
        s.values.map((v, i) =>
          v == null
            ? null
            : createElement('circle', {
                key: `${s.id}-${i}`,
                cx: xAt(i),
                cy: yAt(v),
                r: 3.5,
                fill: s.color,
              })
        )
      ),
      ...tickIdx.map((i) =>
        createElement(
          'text',
          {
            key: `t${i}`,
            x: xAt(i),
            y: height - 8,
            fill: colors.textMuted,
            fontSize: 10,
            textAnchor: 'middle',
          },
          labels[i]
        )
      )
    );
  }

  // Native fallback: colored dots in rows
  return (
    <View style={{ gap: 8, paddingVertical: 8 }}>
      {series.map((s) => (
        <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
          <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
            {s.title}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function DashboardScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { width: winW } = useWindowDimensions();
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
  const recentTasks = data?.recentTasks || [];
  const chartLabels: string[] = data?.chart?.labels || [];
  const chartSeries: Series[] = data?.chart?.series || [];
  const announcements = data?.announcements || [];
  const periodLabel = PERIODS.find((p) => p.key === period)?.label || 'This week';
  const chartWidth = Math.min(640, Math.max(280, winW - 64));

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
          ) : recentTasks.length === 0 ? (
            <Text style={styles.empty}>No tasks yet.</Text>
          ) : (
            <>
              <Text style={styles.subLabel}>Activity (last 5 tasks)</Text>
              <View style={styles.chartWrap}>
                <TaskLineChart
                  labels={chartLabels}
                  series={chartSeries}
                  yMax={data?.chart?.yMax || 5}
                  width={chartWidth}
                  colors={colors}
                />
              </View>
              <View style={styles.legend}>
                {chartSeries.map((s) => (
                  <View key={s.id} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                    <Text style={styles.legendText} numberOfLines={1}>
                      {s.title}
                    </Text>
                  </View>
                ))}
              </View>

              <Text style={[styles.subLabel, { marginTop: 8 }]}>Latest tasks</Text>
              <View style={styles.taskList}>
                {recentTasks.map((t: any, idx: number) => {
                  const color = chartSeries[idx]?.color || colors.accent;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={styles.taskRow}
                      onPress={() => navigation.navigate('TaskDetail', { id: t.id })}
                    >
                      <View style={[styles.taskDot, { backgroundColor: color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.taskTitle} numberOfLines={1}>
                          {t.title}
                        </Text>
                        <Text style={styles.taskMeta}>{statusLabel(t.status)}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>News / Announcements</Text>
          <Text style={styles.sectionHint}>Posted by admins for everyone on the hub.</Text>
          {announcements.length === 0 ? (
            <Text style={styles.empty}>No announcements yet.</Text>
          ) : (
            <View style={styles.newsBox}>
              {announcements.map((a: any, i: number) => {
                const img = resolveUrl(a.imageUrl);
                return (
                  <View
                    key={a.id}
                    style={[styles.newsItem, i > 0 && styles.newsItemBorder]}
                  >
                    <View style={styles.newsTextCol}>
                      <Text style={styles.newsTitle}>{a.title}</Text>
                      {!!a.body && <Text style={styles.newsBody}>{a.body}</Text>}
                      <Text style={styles.newsMeta}>
                        {a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}
                      </Text>
                    </View>
                    {img ? (
                      <Image source={{ uri: img }} style={styles.newsImg} resizeMode="cover" />
                    ) : null}
                  </View>
                );
              })}
            </View>
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
    subLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
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
    chartWrap: { overflow: 'hidden', borderRadius: 8 },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '48%' },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { color: colors.textMuted, fontSize: 12, flexShrink: 1 },
    taskList: { gap: 0 },
    taskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    taskDot: { width: 10, height: 10, borderRadius: 5 },
    taskTitle: { color: colors.text, fontWeight: '700', fontSize: 14 },
    taskMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    newsBox: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.bgElevated,
      overflow: 'hidden',
    },
    newsItem: {
      flexDirection: 'row',
      gap: 12,
      padding: 12,
      alignItems: 'flex-start',
    },
    newsItemBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    newsTextCol: { flex: 1, gap: 4, minWidth: 0 },
    newsImg: {
      width: 88,
      height: 66,
      borderRadius: 8,
      backgroundColor: colors.border,
      flexShrink: 0,
    },
    newsTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
    newsBody: { color: colors.text, fontSize: 13, lineHeight: 18 },
    newsMeta: { color: colors.textMuted, fontSize: 11 },
  });
}
