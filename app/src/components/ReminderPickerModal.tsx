import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Pressable,
} from 'react-native';
import { useTheme, ThemeColors, spacing } from '../theme';

type Props = {
  visible: boolean;
  value: string; // YYYY-MM-DDTHH:mm or empty
  onClose: () => void;
  onSave: (local: string) => void;
  title?: string;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function parseParts(value: string) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (m) {
    return {
      date: `${m[1]}-${m[2]}-${m[3]}`,
      time: `${m[4]}:${m[5]}`,
      y: Number(m[1]),
      mo: Number(m[2]),
      d: Number(m[3]),
      h: Number(m[4]),
      mi: Number(m[5]),
    };
  }
  const now = new Date();
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    y: now.getFullYear(),
    mo: now.getMonth() + 1,
    d: now.getDate(),
    h: now.getHours(),
    mi: now.getMinutes(),
  };
}

function daysInMonth(y: number, mo: number) {
  return new Date(y, mo, 0).getDate();
}

export default function ReminderPickerModal({
  visible,
  value,
  onClose,
  onSave,
  title = 'Pick reminder',
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const initial = parseParts(value);
  const [y, setY] = useState(initial.y);
  const [mo, setMo] = useState(initial.mo);
  const [d, setD] = useState(initial.d);
  const [h, setH] = useState(initial.h);
  const [mi, setMi] = useState(initial.mi);
  const [dateStr, setDateStr] = useState(initial.date);
  const [timeStr, setTimeStr] = useState(initial.time);

  React.useEffect(() => {
    if (!visible) return;
    const p = parseParts(value);
    setY(p.y);
    setMo(p.mo);
    setD(p.d);
    setH(p.h);
    setMi(p.mi);
    setDateStr(p.date);
    setTimeStr(p.time);
  }, [visible, value]);

  const dim = daysInMonth(y, mo);
  const firstDow = new Date(y, mo - 1, 1).getDay(); // 0 Sun
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let day = 1; day <= dim; day++) cells.push(day);

  function commit(nextY = y, nextMo = mo, nextD = d, nextH = h, nextMi = mi) {
    onSave(`${nextY}-${pad(nextMo)}-${pad(nextD)}T${pad(nextH)}:${pad(nextMi)}`);
    onClose();
  }

  function applyWebDate(raw: string) {
    setDateStr(raw);
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return;
    setY(Number(m[1]));
    setMo(Number(m[2]));
    setD(Number(m[3]));
  }

  function applyWebTime(raw: string) {
    setTimeStr(raw);
    const m = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return;
    setH(Number(m[1]));
    setMi(Number(m[2]));
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation?.()}>
          <Text style={styles.title}>{title}</Text>

          {Platform.OS === 'web' ? (
            <View style={styles.webRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Date</Text>
                {/* @ts-expect-error web-only */}
                <input
                  type="date"
                  value={dateStr}
                  onChange={(e: any) => applyWebDate(e.target.value)}
                  style={webInput(colors)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Time</Text>
                {/* @ts-expect-error web-only */}
                <input
                  type="time"
                  value={timeStr}
                  onChange={(e: any) => applyWebTime(e.target.value)}
                  style={webInput(colors)}
                />
              </View>
            </View>
          ) : (
            <>
              <View style={styles.monthRow}>
                <TouchableOpacity
                  onPress={() => {
                    const n = new Date(y, mo - 2, 1);
                    setY(n.getFullYear());
                    setMo(n.getMonth() + 1);
                    setD(Math.min(d, daysInMonth(n.getFullYear(), n.getMonth() + 1)));
                  }}
                >
                  <Text style={styles.navBtn}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.monthLabel}>
                  {new Date(y, mo - 1, 1).toLocaleString(undefined, {
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const n = new Date(y, mo, 1);
                    setY(n.getFullYear());
                    setMo(n.getMonth() + 1);
                    setD(Math.min(d, daysInMonth(n.getFullYear(), n.getMonth() + 1)));
                  }}
                >
                  <Text style={styles.navBtn}>›</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.weekHead}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
                  <Text key={i} style={styles.weekCell}>
                    {w}
                  </Text>
                ))}
              </View>
              <View style={styles.grid}>
                {cells.map((day, i) => {
                  const on = day === d;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.dayCell, on && styles.dayOn]}
                      disabled={!day}
                      onPress={() => day && setD(day)}
                    >
                      <Text style={[styles.dayText, on && styles.dayTextOn]}>{day || ''}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.label}>Time</Text>
              <View style={styles.timeRow}>
                <Stepper
                  label="Hour"
                  value={h}
                  min={0}
                  max={23}
                  onChange={setH}
                  colors={colors}
                  styles={styles}
                />
                <Text style={styles.colon}>:</Text>
                <Stepper
                  label="Min"
                  value={mi}
                  min={0}
                  max={59}
                  step={5}
                  onChange={setMi}
                  colors={colors}
                  styles={styles}
                />
              </View>
            </>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancel} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.save}
              onPress={() => {
                if (Platform.OS === 'web') {
                  const dm = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                  const tm = timeStr.match(/^(\d{1,2}):(\d{2})$/);
                  if (!dm || !tm) return;
                  commit(Number(dm[1]), Number(dm[2]), Number(dm[3]), Number(tm[1]), Number(tm[2]));
                } else {
                  commit();
                }
              }}
            >
              <Text style={styles.saveText}>Set reminder</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  colors,
  styles,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  colors: ThemeColors;
  styles: any;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.stepBtn}
        onPress={() => onChange(value + step > max ? min : value + step)}
      >
        <Text style={{ color: colors.accent, fontWeight: '800' }}>▲</Text>
      </TouchableOpacity>
      <Text style={styles.stepValue}>{pad(value)}</Text>
      <TouchableOpacity
        style={styles.stepBtn}
        onPress={() => onChange(value - step < min ? max : value - step)}
      >
        <Text style={{ color: colors.accent, fontWeight: '800' }}>▼</Text>
      </TouchableOpacity>
    </View>
  );
}

function webInput(colors: ThemeColors): any {
  return {
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: colors.bgElevated,
    border: `1px solid ${colors.border}`,
    borderRadius: spacing.inputRadius,
    padding: '8px 10px',
    color: colors.text,
    fontSize: 14,
    outline: 'none',
  };
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      padding: 20,
    },
    card: {
      backgroundColor: colors.bgCard,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      maxWidth: 420,
      width: '100%',
      alignSelf: 'center',
    },
    title: { color: colors.text, fontWeight: '800', fontSize: 17, marginBottom: 12 },
    label: { color: colors.textMuted, fontWeight: '700', fontSize: 12, marginBottom: 6 },
    webRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    monthRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    monthLabel: { color: colors.text, fontWeight: '800' },
    navBtn: { color: colors.accent, fontSize: 24, fontWeight: '800', paddingHorizontal: 8 },
    weekHead: { flexDirection: 'row', marginBottom: 4 },
    weekCell: { width: `${100 / 7}%` as any, textAlign: 'center', color: colors.textMuted, fontSize: 11 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
    dayCell: {
      width: `${100 / 7}%` as any,
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    dayOn: { backgroundColor: colors.accent },
    dayText: { color: colors.text, fontWeight: '600', fontSize: 13 },
    dayTextOn: { color: colors.onAccent, fontWeight: '800' },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    colon: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 16 },
    stepper: { alignItems: 'center', flex: 1 },
    stepLabel: { color: colors.textMuted, fontSize: 11, marginBottom: 4 },
    stepBtn: { padding: 4 },
    stepValue: { color: colors.text, fontSize: 20, fontWeight: '800', marginVertical: 2 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
    cancel: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      paddingHorizontal: spacing.btnPadH,
      backgroundColor: colors.bgElevated,
    },
    cancelText: { color: colors.text, fontWeight: '700', fontSize: spacing.btnFont },
    save: {
      backgroundColor: colors.accent,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      paddingHorizontal: spacing.btnPadH,
    },
    saveText: { color: colors.onAccent, fontWeight: '800', fontSize: spacing.btnFont },
  });
}
