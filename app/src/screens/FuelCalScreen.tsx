import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Share,
  Modal,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppShell from '../components/AppShell';
import FormField from '../components/FormField';
import { api } from '../api';
import { useAuth } from '../auth';
import { useTheme, ThemeColors, spacing } from '../theme';

type Employee = { name: string; dist: number; mil: number };
type AppUser = { id: string; name?: string; firstName?: string; lastName?: string; email?: string };
type HistoryRow = {
  id: string;
  savedAt: string;
  fuelPrice: number;
  workDays: number;
  name: string;
  dist: number;
  mil: number;
  monthly: number;
  total: number;
};

const STORAGE_KEY = 'fuel_cal_state_v1';
const HISTORY_KEY = 'fuel_cal_history_v1';
const DEFAULT_EMPLOYEES: Employee[] = [{ name: '', dist: 32, mil: 40 }];
const PAGE_SIZE_OPTIONS = [5, 10, 15] as const;

function userLabel(u: AppUser) {
  const full = `${u.firstName || u.name || ''} ${u.lastName || ''}`.trim();
  return full || u.email || u.id;
}

function monthlyImpact(emp: Employee, hike: number, days: number) {
  if (!emp.mil || emp.mil <= 0) return 0;
  return (emp.dist / emp.mil) * hike * days;
}

function formatMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function FuelCalScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user: me } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [priceHike, setPriceHike] = useState('56');
  const [workingDays, setWorkingDays] = useState('22');
  const [employees, setEmployees] = useState<Employee[]>(DEFAULT_EMPLOYEES);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [copyStatus, setCopyStatus] = useState('');
  const [ready, setReady] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailDescription, setEmailDescription] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [emailError, setEmailError] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          if (data.priceHike != null) setPriceHike(String(data.priceHike));
          if (data.workingDays != null) setWorkingDays(String(data.workingDays));
          if (Array.isArray(data.employees) && data.employees.length) {
            setEmployees(data.employees);
          }
        }
      } catch {
        // keep defaults
      }

      try {
        const histRaw = await AsyncStorage.getItem(HISTORY_KEY);
        if (histRaw) {
          const parsed = JSON.parse(histRaw);
          if (Array.isArray(parsed)) setHistory(parsed);
        }
      } catch {
        // ignore
      } finally {
        setReady(true);
      }

      let list: AppUser[] = [];
      try {
        const data = await api.users();
        list = data.users || [];
      } catch {
        list = [];
      }
      // Members without a full user-list permission only get themselves
      const canPickOthers =
        me?.role === 'admin' ||
        (me?.permissions || []).some((p) =>
          ['users.view', 'teams.create', 'tasks.create'].includes(p)
        );
      if (!canPickOthers && me?.id) {
        list = list.filter((u) => u.id === me.id);
        if (!list.length) {
          list = [
            {
              id: me.id,
              name: me.name,
              firstName: me.firstName,
              lastName: me.lastName,
              email: me.email,
            },
          ];
        }
      } else if (me?.id && !list.some((u) => u.id === me.id)) {
        list = [
          {
            id: me.id,
            name: me.name,
            firstName: me.firstName,
            lastName: me.lastName,
            email: me.email,
          },
          ...list,
        ];
      }
      setUsers(list);

      const myLabel = me
        ? userLabel({
            id: me.id,
            name: me.name,
            firstName: me.firstName,
            lastName: me.lastName,
            email: me.email,
          })
        : '';
      if (myLabel) {
        setEmployees((rows) =>
          rows.map((row) => (row.name ? row : { ...row, name: myLabel }))
        );
      }
    })();
  }, [me]);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        priceHike,
        workingDays,
        employees,
      })
    ).catch(() => undefined);
  }, [priceHike, workingDays, employees, ready]);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history)).catch(() => undefined);
  }, [history, ready]);

  const hike = parseFloat(priceHike) || 0;
  const days = parseFloat(workingDays) || 0;
  const impacts = employees.map((e) => monthlyImpact(e, hike, days));
  const total = impacts.reduce((a, b) => a + b, 0);
  const userNames = users.map(userLabel).filter(Boolean);

  const totalPages = Math.max(1, Math.ceil(history.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = history.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(1, Math.ceil(history.length / pageSize) || 1)));
  }, [history.length, pageSize]);

  function saveHistorySnapshot() {
    const savedAt = new Date().toISOString();
    const batchId = `${Date.now()}`;
    const rows: HistoryRow[] = employees.map((emp, i) => ({
      id: `${batchId}-${i}`,
      savedAt,
      fuelPrice: hike,
      workDays: days,
      name: emp.name || '—',
      dist: emp.dist,
      mil: emp.mil,
      monthly: impacts[i] || 0,
      total,
    }));
    setHistory((prev) => [...rows, ...prev].slice(0, 500));
    setPage(1);
  }

  function formatHistoryDate(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  function updateEmp(index: number, field: keyof Employee, value: string) {
    setEmployees((list) =>
      list.map((emp, i) => {
        if (i !== index) return emp;
        if (field === 'name') return { ...emp, name: value };
        return { ...emp, [field]: parseFloat(value) || 0 };
      })
    );
  }

  function buildCalculationText() {
    const lines = [
      'FUEL PRICE IMPACT ANALYSIS',
      `Fuel Price (PKR): ${hike}`,
      `Work Days: ${days}`,
      '',
      'Name | Distance | Mileage | Monthly (PKR)',
      '-'.repeat(48),
    ];
    employees.forEach((emp, i) => {
      lines.push(
        `${emp.name || '—'} | ${emp.dist} KM | ${emp.mil} KM/L | ${formatMoney(impacts[i])}`
      );
    });
    lines.push('-'.repeat(48));
    lines.push(`TOTAL MONTHLY IMPACT: PKR ${formatMoney(total)}`);
    return lines.join('\n');
  }

  function openEmailModal() {
    setEmailTo('');
    setEmailSubject('Fuel Price Impact Analysis');
    setEmailDescription(buildCalculationText());
    setEmailMsg('');
    setEmailError(false);
    setFieldErrors({});
    setEmailOpen(true);
  }

  async function sendCalculationEmail() {
    const next: Record<string, string> = {};
    const to = emailTo.trim();
    if (!to) next.to = 'To address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) next.to = 'Enter a valid email address';
    if (!emailSubject.trim()) next.subject = 'Subject is required';
    if (!emailDescription.trim()) next.description = 'Description is required';
    setFieldErrors(next);
    if (Object.keys(next).length) return;

    setEmailBusy(true);
    setEmailMsg('');
    setEmailError(false);
    try {
      const r = await api.sendEmail({
        to,
        subject: emailSubject.trim(),
        description: emailDescription.trim(),
      });
      setEmailMsg(r.preview ? `Sent. Preview: ${r.preview}` : 'Email sent successfully.');
      setTimeout(() => setEmailOpen(false), 1200);
    } catch (e: any) {
      setEmailError(true);
      setEmailMsg(e.message || 'Failed to send email');
    } finally {
      setEmailBusy(false);
    }
  }

  // function removeRow(index: number) {
  //   setEmployees((list) => list.filter((_, i) => i !== index));
  // }

  // function addRow() {
  //   setEmployees((list) => [...list, { name: 'New', dist: 0, mil: 1 }]);
  // }

  async function copyForWhatsApp() {
    const wName = 10;
    const wDist = 10;
    const wMil = 12;
    const wCost = 15;
    const pad = (s: string, n: number, start = false) =>
      start ? s.padStart(n) : s.padEnd(n);

    let tableText = '```\n';
    tableText += 'FUEL PRICE IMPACT ANALYSIS\n';
    tableText += '-'.repeat(wName + wDist + wMil + wCost) + '\n';
    tableText +=
      pad('Name', wName) +
      pad('Distance', wDist) +
      pad('Mileage', wMil) +
      pad('Impact (PKR)', wCost, true) +
      '\n';
    tableText += '-'.repeat(wName + wDist + wMil + wCost) + '\n';

    employees.forEach((emp, i) => {
      const costStr = formatMoney(impacts[i]);
      tableText += pad((emp.name || '—').substring(0, wName - 1), wName);
      tableText += pad(`${emp.dist} KM`, wDist);
      tableText += pad(`${emp.mil} KM/L`, wMil);
      tableText += pad(costStr, wCost, true) + '\n';
    });

    tableText += '-'.repeat(wName + wDist + wMil + wCost) + '\n';
    tableText +=
      pad('TOTAL MONTHLY IMPACT:', wName + wDist + wMil) +
      pad(formatMoney(total), wCost, true) +
      '\n';
    tableText += '```';

    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(tableText);
      } else {
        await Share.share({ message: tableText });
      }
      saveHistorySnapshot();
      setCopyStatus('Saved to history & ready to paste!');
      setTimeout(() => setCopyStatus(''), 2500);
    } catch {
      setCopyStatus('Copy failed');
      setTimeout(() => setCopyStatus(''), 2500);
    }
  }

  function renderNameCell(emp: Employee, index: number) {
    if (Platform.OS === 'web') {
      return (
        // @ts-expect-error web select
        <select
          value={emp.name}
          onChange={(e: any) => updateEmp(index, 'name', e.target.value)}
          style={{
            width: '100%',
            height: 38,
            padding: '0 10px',
            borderRadius: 8,
            backgroundColor: colors.bgElevated,
            color: colors.text,
            border: `1px solid ${colors.border}`,
            fontSize: 13,
            boxSizing: 'border-box',
          }}
        >
          <option value="">Select user…</option>
          {userNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {emp.name && !userNames.includes(emp.name) ? (
            <option value={emp.name}>{emp.name}</option>
          ) : null}
        </select>
      );
    }

    return (
      <TouchableOpacity style={styles.selectBtn} onPress={() => setPickerIndex(index)}>
        <Text style={styles.selectBtnText} numberOfLines={1}>
          {emp.name || 'Select user…'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    );
  }

  return (
    <AppShell
      navigation={navigation}
      active="FuelCal"
      title="Fuel Cal"
      info="Calculate monthly fuel-price impact per person from distance, mileage, fuel price, and work days. Copy or email the results."
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.wrap}>
          <Text style={styles.h1}>Fuel Consumption Calculator</Text>

          <View style={styles.config}>
            <View style={styles.configItem}>
              <Text style={styles.label}>Fuel Price (PKR)</Text>
              <TextInput
                style={styles.input}
                value={priceHike}
                onChangeText={setPriceHike}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.configItem}>
              <Text style={styles.label}>Work Days</Text>
              <TextInput
                style={styles.input}
                value={workingDays}
                onChangeText={setWorkingDays}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View style={styles.controls}>
            {/* <TouchableOpacity style={styles.btn} onPress={addRow}>
              <Ionicons name="person-add-outline" size={16} color={colors.onAccent} />
              <Text style={styles.btnText}>Add employee</Text>
            </TouchableOpacity> */}
            <TouchableOpacity style={styles.btnSecondary} onPress={copyForWhatsApp}>
              <Ionicons name="copy-outline" size={16} color={colors.accent} />
              <Text style={styles.btnSecondaryText}>Copy Data</Text>
            </TouchableOpacity>
            {!!copyStatus && <Text style={styles.copyStatus}>{copyStatus}</Text>}
          </View>

          <View style={styles.tableCard}>
            <View style={styles.tableHead}>
              <View style={[styles.cell, styles.colName]}>
                <Text style={styles.th}>Name</Text>
              </View>
              <View style={[styles.cell, styles.colNum]}>
                <Text style={styles.th}>Distance (km)</Text>
              </View>
              <View style={[styles.cell, styles.colNum]}>
                <Text style={styles.th}>Mileage (km/l)</Text>
              </View>
              <View style={[styles.cell, styles.colCost, styles.cellLast]}>
                <Text style={[styles.th, styles.thRight]}>Monthly (PKR)</Text>
              </View>
            </View>

            {employees.map((emp, index) => (
              <View
                key={index}
                style={[styles.tableRow, index === employees.length - 1 && styles.tableRowLast]}
              >
                <View style={[styles.cell, styles.colName]}>{renderNameCell(emp, index)}</View>
                <View style={[styles.cell, styles.colNum]}>
                  <TextInput
                    style={styles.cellInput}
                    value={String(emp.dist)}
                    onChangeText={(v) => updateEmp(index, 'dist', v)}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={[styles.cell, styles.colNum]}>
                  <TextInput
                    style={styles.cellInput}
                    value={String(emp.mil)}
                    onChangeText={(v) => updateEmp(index, 'mil', v)}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={[styles.cell, styles.colCost, styles.cellLast]}>
                  <Text style={styles.cost}>{formatMoney(impacts[index])}</Text>
                </View>
                {/* <TouchableOpacity style={styles.delBtn} onPress={() => removeRow(index)}>
                  <Ionicons name="trash-outline" size={14} color="#fff" />
                </TouchableOpacity> */}
              </View>
            ))}

            {!employees.length && <Text style={styles.empty}>No employees yet.</Text>}
          </View>

          <View style={styles.totals}>
            <Text style={styles.totalsLabel}>Total Monthly Impact</Text>
            <Text style={styles.totalsValue}>PKR {formatMoney(total)}</Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.emailBtn} onPress={openEmailModal}>
              <Ionicons name="mail-outline" size={16} color={colors.onAccent} />
              <Text style={styles.emailBtnText}>Send Calculation via Email</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.historyBtn, historyOpen && styles.historyBtnOn]}
              onPress={() => setHistoryOpen((v) => !v)}
            >
              <Ionicons
                name="time-outline"
                size={16}
                color={historyOpen ? colors.onAccent : colors.accent}
              />
              <Text style={[styles.historyBtnText, historyOpen && styles.historyBtnTextOn]}>
                History
              </Text>
            </TouchableOpacity>
          </View>

          {historyOpen ? (
            <View style={styles.historySection}>
              <View style={styles.historyToolbar}>
                <Text style={styles.historyTitle}>Calculation history</Text>
                <View style={styles.pageSizeWrap}>
                  <Text style={styles.label}>Per page</Text>
                  {Platform.OS === 'web' ? (
                    // @ts-expect-error web select
                    <select
                      value={String(pageSize)}
                      onChange={(e: any) => {
                        setPageSize(Number(e.target.value) || 10);
                        setPage(1);
                      }}
                      style={{
                        height: 34,
                        minWidth: 72,
                        padding: '0 8px',
                        borderRadius: 8,
                        backgroundColor: colors.bgElevated,
                        color: colors.text,
                        border: `1px solid ${colors.border}`,
                      }}
                    >
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <View style={styles.pageSizeChips}>
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <TouchableOpacity
                          key={n}
                          style={[styles.pageSizeChip, pageSize === n && styles.pageSizeChipOn]}
                          onPress={() => {
                            setPageSize(n);
                            setPage(1);
                          }}
                        >
                          <Text
                            style={[
                              styles.pageSizeChipText,
                              pageSize === n && styles.pageSizeChipTextOn,
                            ]}
                          >
                            {n}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View style={[styles.tableCard, styles.historyTable]}>
                  <View style={styles.tableHead}>
                    <View style={[styles.cell, styles.colDate]}>
                      <Text style={styles.th}>Date</Text>
                    </View>
                    <View style={[styles.cell, styles.colName]}>
                      <Text style={styles.th}>Name</Text>
                    </View>
                    <View style={[styles.cell, styles.colNum]}>
                      <Text style={styles.th}>Fuel Price</Text>
                    </View>
                    <View style={[styles.cell, styles.colNum]}>
                      <Text style={styles.th}>Work Days</Text>
                    </View>
                    <View style={[styles.cell, styles.colNum]}>
                      <Text style={styles.th}>Distance</Text>
                    </View>
                    <View style={[styles.cell, styles.colNum]}>
                      <Text style={styles.th}>Mileage</Text>
                    </View>
                    <View style={[styles.cell, styles.colCost]}>
                      <Text style={[styles.th, styles.thRight]}>Monthly</Text>
                    </View>
                    <View style={[styles.cell, styles.colCost, styles.cellLast]}>
                      <Text style={[styles.th, styles.thRight]}>Total</Text>
                    </View>
                  </View>

                  {pageRows.map((row, index) => (
                    <View
                      key={row.id}
                      style={[
                        styles.tableRow,
                        index === pageRows.length - 1 && styles.tableRowLast,
                      ]}
                    >
                      <View style={[styles.cell, styles.colDate]}>
                        <Text style={styles.histCell}>{formatHistoryDate(row.savedAt)}</Text>
                      </View>
                      <View style={[styles.cell, styles.colName]}>
                        <Text style={styles.histCell} numberOfLines={1}>
                          {row.name}
                        </Text>
                      </View>
                      <View style={[styles.cell, styles.colNum]}>
                        <Text style={styles.histCell}>{row.fuelPrice}</Text>
                      </View>
                      <View style={[styles.cell, styles.colNum]}>
                        <Text style={styles.histCell}>{row.workDays}</Text>
                      </View>
                      <View style={[styles.cell, styles.colNum]}>
                        <Text style={styles.histCell}>{row.dist}</Text>
                      </View>
                      <View style={[styles.cell, styles.colNum]}>
                        <Text style={styles.histCell}>{row.mil}</Text>
                      </View>
                      <View style={[styles.cell, styles.colCost]}>
                        <Text style={[styles.histCell, styles.thRight]}>
                          {formatMoney(row.monthly)}
                        </Text>
                      </View>
                      <View style={[styles.cell, styles.colCost, styles.cellLast]}>
                        <Text style={[styles.histCell, styles.thRight, styles.histTotal]}>
                          {formatMoney(row.total)}
                        </Text>
                      </View>
                    </View>
                  ))}

                  {!history.length && (
                    <Text style={styles.empty}>No history yet. Use Copy Data to save a record.</Text>
                  )}
                </View>
              </ScrollView>

              {history.length > pageSize ? (
                <View style={styles.pager}>
                  <Text style={styles.pagerInfo}>
                    {(safePage - 1) * pageSize + 1}–
                    {Math.min(safePage * pageSize, history.length)} of {history.length}
                  </Text>
                  <View style={styles.pagerBtns}>
                    <TouchableOpacity
                      style={[styles.pagerBtn, safePage <= 1 && styles.miniDisabled]}
                      disabled={safePage <= 1}
                      onPress={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <Ionicons name="chevron-back" size={18} color={colors.text} />
                    </TouchableOpacity>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((n) => {
                        if (totalPages <= 7) return true;
                        return (
                          n === 1 ||
                          n === totalPages ||
                          Math.abs(n - safePage) <= 1
                        );
                      })
                      .map((n, idx, arr) => {
                        const prev = arr[idx - 1];
                        const showGap = prev != null && n - prev > 1;
                        return (
                          <React.Fragment key={n}>
                            {showGap ? <Text style={styles.pagerGap}>…</Text> : null}
                            <TouchableOpacity
                              style={[styles.pageNum, n === safePage && styles.pageNumOn]}
                              onPress={() => setPage(n)}
                            >
                              <Text
                                style={[styles.pageNumText, n === safePage && styles.pageNumTextOn]}
                              >
                                {n}
                              </Text>
                            </TouchableOpacity>
                          </React.Fragment>
                        );
                      })}
                    <TouchableOpacity
                      style={[styles.pagerBtn, safePage >= totalPages && styles.miniDisabled]}
                      disabled={safePage >= totalPages}
                      onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      <Ionicons name="chevron-forward" size={18} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : history.length > 0 ? (
                <Text style={styles.pagerInfo}>
                  {history.length} record{history.length === 1 ? '' : 's'}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Modal
        visible={emailOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !emailBusy && setEmailOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => !emailBusy && setEmailOpen(false)}
        >
          <Pressable style={styles.emailModalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Compose Email</Text>
            <ScrollView
              style={styles.emailFormScroll}
              contentContainerStyle={styles.emailForm}
              keyboardShouldPersistTaps="handled"
            >
              <FormField
                label="To"
                required
                value={emailTo}
                onChangeText={setEmailTo}
                placeholder="recipient@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                error={fieldErrors.to}
              />
              <FormField
                label="Subject"
                required
                value={emailSubject}
                onChangeText={setEmailSubject}
                error={fieldErrors.subject}
              />
              <FormField
                label="Description"
                required
                value={emailDescription}
                onChangeText={setEmailDescription}
                multiline
                numberOfLines={8}
                style={styles.descInput}
                error={fieldErrors.description}
              />
              {!!emailMsg && (
                <Text style={[styles.copyStatus, emailError && styles.emailErr]}>{emailMsg}</Text>
              )}
              <View style={styles.emailActions}>
                <TouchableOpacity
                  style={styles.btnSecondary}
                  disabled={emailBusy}
                  onPress={() => setEmailOpen(false)}
                >
                  <Text style={styles.btnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, emailBusy && styles.btnDisabled]}
                  disabled={emailBusy}
                  onPress={sendCalculationEmail}
                >
                  <Ionicons name="send-outline" size={16} color={colors.onAccent} />
                  <Text style={styles.btnText}>{emailBusy ? 'Sending…' : 'Send'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={pickerIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerIndex(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerIndex(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Select user</Text>
            <ScrollView style={styles.modalList}>
              {userNames.map((name) => (
                <TouchableOpacity
                  key={name}
                  style={styles.modalItem}
                  onPress={() => {
                    if (pickerIndex !== null) updateEmp(pickerIndex, 'name', name);
                    setPickerIndex(null);
                  }}
                >
                  <Text style={styles.modalItemText}>{name}</Text>
                  {pickerIndex !== null && employees[pickerIndex]?.name === name ? (
                    <Ionicons name="checkmark" size={18} color={colors.accent} />
                  ) : null}
                </TouchableOpacity>
              ))}
              {!userNames.length && (
                <Text style={styles.empty}>No users available.</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setPickerIndex(null)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </AppShell>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    inner: { padding: 16, paddingBottom: 40 },
    wrap: { width: '100%', maxWidth: 860, gap: 12 },
    h1: { color: colors.text, fontSize: 22, fontWeight: '800' },
    config: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 16,
      backgroundColor: colors.bgElevated,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    configItem: { gap: 6, minWidth: 140 },
    label: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
    input: {
      backgroundColor: colors.bgCard,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.inputRadius,
      paddingHorizontal: spacing.inputPadH,
      paddingVertical: spacing.inputPadV,
      color: colors.text,
      fontSize: spacing.inputFont,
      minHeight: 38,
      width: 120,
    },
    controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    btn: {
      backgroundColor: colors.accent,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      paddingHorizontal: spacing.btnPadH,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 38,
    },
    btnText: { color: colors.onAccent, fontWeight: '800', fontSize: spacing.btnFont },
    btnSecondary: {
      backgroundColor: colors.bgCard,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      paddingHorizontal: spacing.btnPadH,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 38,
    },
    btnSecondaryText: { color: colors.accent, fontWeight: '700', fontSize: spacing.btnFont },
    copyStatus: { color: colors.accent, fontWeight: '700', fontSize: 13 },
    tableCard: {
      backgroundColor: colors.bgCard,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    tableHead: {
      flexDirection: 'row',
      alignItems: 'stretch',
      backgroundColor: colors.bgElevated,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    th: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
    thRight: { textAlign: 'right' },
    tableRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      minHeight: 52,
    },
    tableRowLast: { borderBottomWidth: 0 },
    cell: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      justifyContent: 'center',
      borderRightWidth: 1,
      borderRightColor: colors.border,
    },
    cellLast: { borderRightWidth: 0 },
    colName: { flex: 1.6, minWidth: 140 },
    colNum: { flex: 0.9, minWidth: 110 },
    colCost: { flex: 1, minWidth: 120 },
    cellInput: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: colors.text,
      fontSize: 13,
      minHeight: 38,
      width: '100%',
    },
    selectBtn: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
    },
    selectBtnText: { color: colors.text, fontSize: 13, flex: 1 },
    cost: {
      color: colors.text,
      fontWeight: '800',
      fontSize: 13,
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },
    empty: { color: colors.textMuted, padding: 16, textAlign: 'center' },
    totals: {
      backgroundColor: colors.accentDim,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.accent,
      padding: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    totalsLabel: { color: colors.text, fontWeight: '700', fontSize: 15 },
    totalsValue: { color: colors.accent, fontWeight: '800', fontSize: 18 },
    emailBtn: {
      backgroundColor: colors.accent,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      paddingHorizontal: spacing.btnPadH,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 42,
      alignSelf: 'flex-start',
    },
    emailBtnText: { color: colors.onAccent, fontWeight: '800', fontSize: spacing.btnFont },
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
    historyBtn: {
      backgroundColor: colors.bgCard,
      borderRadius: spacing.btnRadius,
      paddingVertical: spacing.btnPadV,
      paddingHorizontal: spacing.btnPadH,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 42,
    },
    historyBtnOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    historyBtnText: { color: colors.accent, fontWeight: '800', fontSize: spacing.btnFont },
    historyBtnTextOn: { color: colors.onAccent },
    historySection: { gap: 10 },
    historyToolbar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    historyTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
    pageSizeWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    pageSizeChips: { flexDirection: 'row', gap: 6 },
    pageSizeChip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: colors.bgElevated,
    },
    pageSizeChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    pageSizeChipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
    pageSizeChipTextOn: { color: colors.onAccent },
    historyTable: { minWidth: 860 },
    colDate: { width: 150, minWidth: 150 },
    histCell: { color: colors.text, fontSize: 12 },
    histTotal: { fontWeight: '800', color: colors.accent },
    miniDisabled: { opacity: 0.35 },
    pager: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    pagerInfo: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
    pagerBtns: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
    pagerBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 6,
      backgroundColor: colors.bgElevated,
    },
    pageNum: {
      minWidth: 32,
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      backgroundColor: colors.bgElevated,
    },
    pageNumOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    pageNumText: { color: colors.text, fontWeight: '700', fontSize: 13 },
    pageNumTextOn: { color: colors.onAccent },
    pagerGap: { color: colors.textMuted, paddingHorizontal: 4 },
    emailModalCard: {
      backgroundColor: colors.bgCard,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      maxHeight: '85%',
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
      overflow: 'hidden',
    },
    emailFormScroll: { maxHeight: 480 },
    emailForm: { padding: 16, gap: 4, paddingBottom: 20 },
    descInput: {
      minHeight: 140,
      textAlignVertical: 'top' as const,
    },
    emailActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    btnDisabled: { opacity: 0.6 },
    emailErr: { color: colors.danger },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: 24,
    },
    modalCard: {
      backgroundColor: colors.bgCard,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      maxHeight: '70%',
      overflow: 'hidden',
    },
    modalTitle: {
      color: colors.text,
      fontWeight: '800',
      fontSize: 16,
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalList: { maxHeight: 320 },
    modalItem: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    modalItemText: { color: colors.text, fontSize: 15, flex: 1 },
    modalClose: { padding: 14, alignItems: 'center' },
    modalCloseText: { color: colors.accent, fontWeight: '700' },
  });
}
