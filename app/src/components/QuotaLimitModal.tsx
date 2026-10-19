import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../auth';
import { api } from '../api';
import { useTheme, ThemeColors } from '../theme';

type OpsStatus = {
  quotaHit?: boolean;
  opsPaused?: boolean;
  kind?: string | null;
  kindLabel?: string | null;
  message?: string | null;
  at?: string | null;
};

/**
 * Admins: when D1 free-tier limit is hit, show a confirm modal.
 * Confirm pauses all write operations until admin resumes (after daily reset).
 */
export default function QuotaLimitModal() {
  const { user, isAdmin, token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [ops, setOps] = useState<OpsStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token || !isAdmin) return;
    try {
      const data = await api.opsStatus();
      setOps(data.ops || null);
    } catch {
      // ignore
    }
  }, [token, isAdmin]);

  useEffect(() => {
    if (!user || !isAdmin) {
      setOps(null);
      return;
    }
    refresh();
    const t = setInterval(refresh, 20000);
    return () => clearInterval(t);
  }, [user, isAdmin, refresh]);

  async function onConfirmPause() {
    try {
      setBusy(true);
      const data = await api.confirmOpsPause();
      setOps(data.ops || { quotaHit: true, opsPaused: true });
    } catch (e: any) {
      console.warn(e?.message || e);
    } finally {
      setBusy(false);
    }
  }

  async function onResume() {
    try {
      setBusy(true);
      const data = await api.resumeOps();
      setOps(data.ops || { quotaHit: false, opsPaused: false });
    } catch (e: any) {
      console.warn(e?.message || e);
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin || !ops) return null;

  const showConfirmModal = Boolean(ops.quotaHit && !ops.opsPaused);
  const showPausedBanner = Boolean(ops.opsPaused);

  return (
    <>
      <Modal visible={showConfirmModal} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>App data limit reached</Text>
            <Text style={styles.message}>
              {ops.message ||
                'Cloudflare D1 free-tier limit reached (rows read 5M / rows written 100k / storage 5 GB). Please stop today\'s operations.'}
            </Text>
            {ops.kindLabel ? (
              <Text style={styles.meta}>Limit: {ops.kindLabel}</Text>
            ) : null}
            <Text style={styles.meta}>
              Confirm to stop all create/update/delete operations until the daily limit resets
              (midnight UTC), then use Resume in Settings.
            </Text>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={onConfirmPause}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmText}>Confirm — stop operations</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {showPausedBanner ? (
        <View style={styles.banner} pointerEvents="box-none">
          <View style={styles.bannerInner}>
            <Text style={styles.bannerText}>
              Operations paused — data limit. Resume after midnight UTC reset.
            </Text>
            <TouchableOpacity style={styles.resumeBtn} onPress={onResume} disabled={busy}>
              {busy ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <Text style={styles.resumeText}>Resume</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.bgCard,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      gap: 10,
    },
    title: { color: colors.danger, fontSize: 18, fontWeight: '800' },
    message: { color: colors.text, fontSize: 15, lineHeight: 22 },
    meta: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
    confirmBtn: {
      marginTop: 8,
      backgroundColor: colors.danger,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
    },
    confirmText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    banner: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      zIndex: 1000,
      paddingTop: 8,
      paddingHorizontal: 12,
    },
    bannerInner: {
      backgroundColor: colors.danger,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
    },
    bannerText: { color: '#fff', fontWeight: '700', fontSize: 13, flex: 1, minWidth: 160 },
    resumeBtn: {
      backgroundColor: colors.bgCard,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    resumeText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  });
}
