import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View, StyleSheet, Platform } from 'react-native';
import { ThemeColors } from '../theme';

const MAX_WORDS = 300;
const PREVIEW_WORDS = 28;

export function clampWords(text: string, max: number) {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length <= max) return { text: words.join(' '), truncated: false, count: words.length };
  return { text: words.slice(0, max).join(' ') + '…', truncated: true, count: words.length };
}

type Props = {
  text?: string | null;
  colors: ThemeColors;
  previewWords?: number;
  maxWords?: number;
};

/** Truncated description with More / Less — never drives card width. */
export default function CardDescription({
  text,
  colors,
  previewWords = PREVIEW_WORDS,
  maxWords = MAX_WORDS,
}: Props) {
  const [open, setOpen] = useState(false);
  const capped = useMemo(() => clampWords(text || 'No description', maxWords), [text, maxWords]);
  const rawCapped = capped.text.replace(/…$/, '');
  const preview = useMemo(() => clampWords(rawCapped, previewWords), [rawCapped, previewWords]);
  const needsToggle = preview.truncated;
  const shown = open ? capped.text : needsToggle ? preview.text : rawCapped || 'No description';

  return (
    <View style={styles.wrap}>
      <Text style={[styles.body, { color: colors.textMuted }]}>{shown}</Text>
      {needsToggle ? (
        <TouchableOpacity
          onPress={(e) => {
            e?.stopPropagation?.();
            setOpen((v) => !v);
          }}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        >
          <Text style={[styles.more, { color: colors.accent }]}>{open ? 'Less' : 'More'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4, width: '100%', minWidth: 0 },
  body: {
    fontSize: 12,
    lineHeight: 17,
    width: '100%',
    ...(Platform.OS === 'web'
      ? ({ wordBreak: 'break-word', overflowWrap: 'anywhere' } as any)
      : null),
  },
  more: { marginTop: 4, fontSize: 12, fontWeight: '700' },
});
