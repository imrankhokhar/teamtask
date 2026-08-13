import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAppNotify } from '../notifyBus';
import { useTheme, ThemeColors } from '../theme';

type Toast = { key: string; title: string; body: string };

export default function NotifyToasts() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const top =
    Platform.OS === 'web'
      ? (`max(${Math.max(insets.top || 0, 12)}px, env(safe-area-inset-top, 0px))` as any)
      : Math.max(insets.top || 0, 12);

  useEffect(() => {
    return onAppNotify((n) => {
      const key = String(n.id || `${Date.now()}-${Math.random()}`);
      const toast = { key, title: n.title || 'Notification', body: n.body || '' };
      setToasts((list) => [toast, ...list].slice(0, 3));
      setTimeout(() => {
        setToasts((list) => list.filter((t) => t.key !== key));
      }, 7000);
    });
  }, []);

  if (!toasts.length) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingTop: top }]}>
      {toasts.map((t) => (
        <Pressable
          key={t.key}
          style={styles.card}
          onPress={() => setToasts((list) => list.filter((x) => x.key !== t.key))}
        >
          <Text style={styles.title} numberOfLines={1}>
            {t.title}
          </Text>
          {t.body ? (
            <Text style={styles.body} numberOfLines={3}>
              {t.body}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 12,
      right: 12,
      top: 0,
      zIndex: 80,
      gap: 8,
    },
    card: {
      backgroundColor: colors.bgCard,
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    title: { color: colors.text, fontWeight: '800', fontSize: 14 },
    body: { color: colors.textMuted, marginTop: 4, fontSize: 13, lineHeight: 18 },
  });
}
