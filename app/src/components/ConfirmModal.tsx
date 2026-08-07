import React, { useCallback, useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { useTheme, ThemeColors } from '../theme';

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type Pending = ConfirmOptions & {
  resolve: (ok: boolean) => void;
};

export function ConfirmModal({
  visible,
  title = 'Confirm',
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, destructive ? styles.dangerBtn : styles.primaryBtn]}
              onPress={onConfirm}
            >
              <Text style={[styles.confirmText, !destructive && { color: colors.onAccent }]}>
                {confirmLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback((opts: ConfirmOptions | string) => {
    const options: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts;
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const dialog = (
    <ConfirmModal
      visible={Boolean(pending)}
      title={pending?.title || 'Confirm'}
      message={pending?.message || ''}
      confirmLabel={pending?.confirmLabel}
      cancelLabel={pending?.cancelLabel}
      destructive={pending?.destructive !== false}
      onCancel={() => {
        pending?.resolve(false);
        setPending(null);
      }}
      onConfirm={() => {
        pending?.resolve(true);
        setPending(null);
      }}
    />
  );

  return { confirm, dialog };
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
      maxWidth: 400,
      backgroundColor: colors.bgCard,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
    },
    title: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '800',
      marginBottom: 8,
    },
    message: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 20,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
    },
    cancelBtn: {
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
    },
    cancelText: { color: colors.text, fontWeight: '700' },
    confirmBtn: {
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    dangerBtn: { backgroundColor: colors.danger },
    primaryBtn: { backgroundColor: colors.accent },
    confirmText: { color: '#fff', fontWeight: '800' },
  });
}
