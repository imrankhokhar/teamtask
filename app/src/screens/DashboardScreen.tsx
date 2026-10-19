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
  LayoutChangeEvent,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, getApiBaseUrlSyncFallback } from '../api';
import { useTheme, ThemeColors } from '../theme';
import AppShell from '../components/AppShell';

type ChartType = 'line' | 'bar' | 'pie' | 'donut' | 'radar';

const PERIODS: { key: string; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This week' },
  { key: 'last_week', label: 'Last week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
];

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'ready', label: 'Ready' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'pending', label: 'Pending' },
  { key: 'completed', label: 'Completed' },
  { key: 'reopen', label: 'Reopen' },
];

const CHART_TYPES: { key: ChartType; label: string }[] = [
  { key: 'line', label: 'Line chart' },
  { key: 'bar', label: 'Bar chart' },
  { key: 'pie', label: 'Pie chart' },
  { key: 'donut', label: 'Donut chart' },
  { key: 'radar', label: 'Radar chart' },
];

type Series = {
  id: string;
  title: string;
  status: string;
  color: string;
  values: (number | null)[];
};

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

function lastValue(s: Series) {
  const vals = (s.values || []).map((v) => (v == null ? 0 : Number(v)));
  if (!vals.length) return 1;
  return Math.max(0.1, vals[vals.length - 1] || 1);
}

function LineSegment({
  x1,
  y1,
  x2,
  y2,
  color,
  thickness = 2.5,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  thickness?: number;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 0.5) return null;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (x1 + x2) / 2 - length / 2,
        top: (y1 + y2) / 2 - thickness / 2,
        width: length,
        height: thickness,
        backgroundColor: color,
        borderRadius: 2,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

function TaskLineChart({
  labels,
  series,
  yMax,
  colors,
}: {
  labels: string[];
  series: Series[];
  yMax: number;
  colors: ThemeColors;
}) {
  const [boxW, setBoxW] = useState(320);
  const height = 220;
  const padL = 32;
  const padR = 14;
  const padT = 16;
  const padB = 32;
  const innerW = Math.max(40, boxW - padL - padR);
  const innerH = height - padT - padB;
  const n = Math.max(1, labels.length - 1);
  const maxY = Math.max(1, yMax || 5);

  const xAt = (i: number) =>
    padL + (labels.length <= 1 ? innerW / 2 : (i / n) * innerW);
  const yAt = (v: number) => padT + innerH - (Math.max(0, v) / maxY) * innerH;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 40 && Math.abs(w - boxW) > 1) setBoxW(w);
  };

  const tickIdx = Array.from(
    new Set(
      [0, Math.floor(labels.length / 2), labels.length - 1].filter(
        (i) => i >= 0 && i < labels.length
      )
    )
  );

  return (
    <View style={{ width: '100%', height }} onLayout={onLayout}>
      {[1, 2, 3, 4, 5].map((v) => (
        <View
          key={`g${v}`}
          style={{
            position: 'absolute',
            left: padL,
            right: padR,
            top: yAt(v),
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.border,
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          left: padL,
          top: padT,
          width: StyleSheet.hairlineWidth,
          height: innerH,
          backgroundColor: colors.border,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: padL,
          top: height - padB,
          width: innerW,
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
        }}
      />

      {series.map((s) => {
        const pts = s.values.map((v, i) => ({
          i,
          x: xAt(i),
          y: yAt(v == null ? 0 : Number(v)),
        }));
        return (
          <View key={s.id} pointerEvents="none" style={StyleSheet.absoluteFill}>
            {pts.slice(0, -1).map((p, i) => (
              <LineSegment
                key={`${s.id}-seg-${i}`}
                x1={p.x}
                y1={p.y}
                x2={pts[i + 1].x}
                y2={pts[i + 1].y}
                color={s.color}
              />
            ))}
            {pts.map((p) => (
              <View
                key={`${s.id}-dot-${p.i}`}
                style={{
                  position: 'absolute',
                  left: p.x - 4,
                  top: p.y - 4,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: s.color,
                  borderWidth: 1.5,
                  borderColor: colors.bgCard,
                }}
              />
            ))}
          </View>
        );
      })}

      {tickIdx.map((i) => (
        <Text
          key={`tick-${i}`}
          style={{
            position: 'absolute',
            left: xAt(i) - 20,
            top: height - 22,
            width: 40,
            textAlign: 'center',
            color: colors.textMuted,
            fontSize: 10,
          }}
        >
          {labels[i]}
        </Text>
      ))}
    </View>
  );
}

function TaskBarChart({ series, yMax, colors }: { series: Series[]; yMax: number; colors: ThemeColors }) {
  const maxY = Math.max(1, yMax || 5);
  return (
    <View style={{ width: '100%', height: 220, justifyContent: 'flex-end', paddingTop: 8 }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 8 }}>
        {series.map((s) => {
          const v = lastValue(s);
          const hPct = Math.max(8, (v / maxY) * 100);
          return (
            <View key={s.id} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>
                {v}
              </Text>
              <View
                style={{
                  width: '70%',
                  maxWidth: 48,
                  height: `${hPct}%`,
                  backgroundColor: s.color,
                  borderTopLeftRadius: 6,
                  borderTopRightRadius: 6,
                  minHeight: 12,
                }}
              />
            </View>
          );
        })}
      </View>
      <View
        style={{
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          marginHorizontal: 8,
        }}
      />
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 8, paddingTop: 6 }}>
        {series.map((s) => (
          <Text
            key={s.id}
            numberOfLines={1}
            style={{ flex: 1, textAlign: 'center', color: colors.textMuted, fontSize: 10 }}
          >
            {s.title}
          </Text>
        ))}
      </View>
    </View>
  );
}

function TaskPieDonutChart({
  series,
  colors,
  donut,
}: {
  series: Series[];
  colors: ThemeColors;
  donut?: boolean;
}) {
  const slices = series.map((s) => ({
    id: s.id,
    title: s.title,
    color: s.color,
    value: lastValue(s),
  }));
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  let cursor = 0;
  const stops: string[] = [];
  for (const s of slices) {
    const start = (cursor / total) * 100;
    cursor += s.value;
    const end = (cursor / total) * 100;
    stops.push(`${s.color} ${start}% ${end}%`);
  }
  const size = 180;
  const gradient = `conic-gradient(${stops.join(', ')})`;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', height: 220, gap: 8 }}>
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          },
          Platform.OS === 'web'
            ? ({ backgroundImage: gradient } as any)
            : { backgroundColor: colors.border },
        ]}
      >
        {Platform.OS !== 'web' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: size, height: size }}>
            {slices.map((s) => (
              <View
                key={s.id}
                style={{
                  width: `${Math.max(10, (s.value / total) * 100)}%`,
                  height: '100%',
                  backgroundColor: s.color,
                }}
              />
            ))}
          </View>
        ) : null}
        {donut ? (
          <View
            style={{
              position: 'absolute',
              width: size * 0.52,
              height: size * 0.52,
              borderRadius: (size * 0.52) / 2,
              backgroundColor: colors.bgElevated,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>{slices.length}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>tasks</Text>
          </View>
        ) : null}
      </View>
      {!donut && Platform.OS === 'web' ? null : null}
    </View>
  );
}

function TaskRadarChart({ series, yMax, colors }: { series: Series[]; yMax: number; colors: ThemeColors }) {
  const [boxW, setBoxW] = useState(280);
  const size = Math.min(260, Math.max(200, boxW - 16));
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.38;
  const maxY = Math.max(1, yMax || 5);
  const count = Math.max(3, series.length);
  // Pad to at least 3 axes for a polygon
  const axes = series.length
    ? series
    : Array.from({ length: 3 }, (_, i) => ({
        id: `p${i}`,
        title: '',
        color: colors.border,
        values: [1],
        status: '',
      }));

  const pointAt = (i: number, value: number) => {
    const angle = -Math.PI / 2 + (i / count) * Math.PI * 2;
    const r = (Math.max(0, value) / maxY) * maxR;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const ringPts = (level: number) =>
    Array.from({ length: count }, (_, i) => pointAt(i, level));

  const dataPts = axes.map((s, i) => pointAt(i, lastValue(s as Series)));

  return (
    <View
      style={{ width: '100%', height: 240, alignItems: 'center', justifyContent: 'center' }}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 40) setBoxW(w);
      }}
    >
      <View style={{ width: size, height: size }}>
        {[1, 2, 3, 4, 5].map((lvl) => {
          const pts = ringPts(lvl);
          return pts.map((p, i) => {
            const n = pts[(i + 1) % pts.length];
            return (
              <LineSegment
                key={`ring-${lvl}-${i}`}
                x1={p.x}
                y1={p.y}
                x2={n.x}
                y2={n.y}
                color={colors.border}
                thickness={1}
              />
            );
          });
        })}
        {axes.map((_, i) => {
          const tip = pointAt(i, maxY);
          return (
            <LineSegment
              key={`axis-${i}`}
              x1={cx}
              y1={cy}
              x2={tip.x}
              y2={tip.y}
              color={colors.border}
              thickness={1}
            />
          );
        })}
        {dataPts.map((p, i) => {
          const n = dataPts[(i + 1) % dataPts.length];
          return (
            <LineSegment
              key={`data-${i}`}
              x1={p.x}
              y1={p.y}
              x2={n.x}
              y2={n.y}
              color={axes[i]?.color || colors.accent}
              thickness={2.5}
            />
          );
        })}
        {dataPts.map((p, i) => (
          <View
            key={`rdot-${i}`}
            style={{
              position: 'absolute',
              left: p.x - 4,
              top: p.y - 4,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: axes[i]?.color || colors.accent,
            }}
          />
        ))}
      </View>
    </View>
  );
}

function FilterDropdown({
  label,
  open,
  onToggle,
  colors,
  styles,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  options?: { key: string; label: string }[];
  value?: string;
  onSelect?: (key: string) => void;
  colors: ThemeColors;
  styles: any;
}) {
  return (
    <TouchableOpacity style={styles.filterBtn} onPress={onToggle}>
      <Text style={styles.filterText}>{label}</Text>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.text} />
    </TouchableOpacity>
  );
}

export default function DashboardScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [period, setPeriod] = useState('this_week');
  const [statusFilter, setStatusFilter] = useState('all');
  const [chartType, setChartType] = useState<ChartType>('line');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr('');
      const res = await api.dashboard(period, statusFilter);
      setData(res);
    } catch (e: any) {
      setErr(e.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [period, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = data?.counts || { tasks: 0, teams: 0, users: 0 };
  const recentTasks = data?.recentTasks || [];
  const chartLabels: string[] = data?.chart?.labels || [];
  const chartSeries: Series[] = data?.chart?.series || [];
  const announcements = data?.announcements || [];
  const periodLabel = PERIODS.find((p) => p.key === period)?.label || 'This week';
  const statusLabelUi =
    STATUS_FILTERS.find((s) => s.key === statusFilter)?.label || 'All';
  const chartLabel = CHART_TYPES.find((c) => c.key === chartType)?.label || 'Line chart';
  const hasChart = chartSeries.length > 0;
  const yMax = data?.chart?.yMax || 5;

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

        <View style={[styles.section, styles.sectionTasks]}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Tasks</Text>
            <View style={styles.filtersRow}>
              <FilterDropdown
                label={periodLabel}
                open={periodOpen}
                onToggle={() => {
                  setPeriodOpen((v) => !v);
                  setStatusOpen(false);
                  setChartOpen(false);
                }}
                colors={colors}
                styles={styles}
              />
              <FilterDropdown
                label={statusLabelUi}
                open={statusOpen}
                onToggle={() => {
                  setStatusOpen((v) => !v);
                  setPeriodOpen(false);
                  setChartOpen(false);
                }}
                colors={colors}
                styles={styles}
              />
              <FilterDropdown
                label={chartLabel}
                open={chartOpen}
                onToggle={() => {
                  setChartOpen((v) => !v);
                  setPeriodOpen(false);
                  setStatusOpen(false);
                }}
                colors={colors}
                styles={styles}
              />
            </View>
          </View>

          {/* In-flow menus so they always sit above the chart (never under it). */}
          {periodOpen ? (
            <View style={styles.filterMenu}>
              {PERIODS.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.filterItem, period === p.key && styles.filterItemOn]}
                  onPress={() => {
                    setPeriod(p.key);
                    setPeriodOpen(false);
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
          {statusOpen ? (
            <View style={styles.filterMenu}>
              {STATUS_FILTERS.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.filterItem, statusFilter === p.key && styles.filterItemOn]}
                  onPress={() => {
                    setStatusFilter(p.key);
                    setStatusOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.filterItemText,
                      statusFilter === p.key && styles.filterItemTextOn,
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          {chartOpen ? (
            <View style={styles.filterMenu}>
              {CHART_TYPES.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.filterItem, chartType === p.key && styles.filterItemOn]}
                  onPress={() => {
                    setChartType(p.key);
                    setChartOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.filterItemText,
                      chartType === p.key && styles.filterItemTextOn,
                    ]}
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
            <Text style={styles.empty}>
              {statusFilter === 'all'
                ? 'No tasks yet.'
                : `No ${statusLabelUi.toLowerCase()} tasks.`}
            </Text>
          ) : (
            <>
              <Text style={styles.subLabel}>Activity (last 5 tasks)</Text>
              {hasChart ? (
                <View style={styles.chartWrap}>
                  {chartType === 'line' ? (
                    <TaskLineChart
                      labels={chartLabels.length ? chartLabels : ['1', '2', '3', '4', '5', '6', '7']}
                      series={chartSeries}
                      yMax={yMax}
                      colors={colors}
                    />
                  ) : null}
                  {chartType === 'bar' ? (
                    <TaskBarChart series={chartSeries} yMax={yMax} colors={colors} />
                  ) : null}
                  {chartType === 'pie' ? (
                    <TaskPieDonutChart series={chartSeries} colors={colors} />
                  ) : null}
                  {chartType === 'donut' ? (
                    <TaskPieDonutChart series={chartSeries} colors={colors} donut />
                  ) : null}
                  {chartType === 'radar' ? (
                    <TaskRadarChart series={chartSeries} yMax={yMax} colors={colors} />
                  ) : null}
                </View>
              ) : (
                <Text style={styles.empty}>Chart data unavailable.</Text>
              )}
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
                  <View key={a.id} style={[styles.newsItem, i > 0 && styles.newsItemBorder]}>
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
    sectionTasks: {
      overflow: 'visible',
      zIndex: 20,
      elevation: 20,
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexWrap: 'wrap',
      zIndex: 100,
      elevation: 100,
      position: 'relative',
    },
    filtersRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      alignItems: 'flex-start',
      zIndex: 100,
      elevation: 100,
      position: 'relative',
    },
    sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
    sectionHint: { color: colors.textMuted, fontSize: 13, marginTop: -4 },
    subLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
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
      width: '100%',
      maxWidth: 320,
      alignSelf: 'flex-end',
    },
    filterItem: { paddingHorizontal: 12, paddingVertical: 10 },
    filterItemOn: { backgroundColor: colors.accent + '22' },
    filterItemText: { color: colors.text, fontWeight: '600' },
    filterItemTextOn: { color: colors.accent, fontWeight: '800' },
    empty: { color: colors.textMuted, fontSize: 14, paddingVertical: 8 },
    chartWrap: {
      width: '100%',
      minHeight: 220,
      borderRadius: 8,
      backgroundColor: colors.bgElevated,
      overflow: 'hidden',
      paddingHorizontal: 4,
      zIndex: 0,
      elevation: 0,
      position: 'relative',
    },
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
