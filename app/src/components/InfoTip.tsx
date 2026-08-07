import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, ThemeColors } from '../theme';

/** Icon-only help; shows detail on hover (web) or press (native). */
export default function InfoTip({ text }: { text: string }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [open, setOpen] = useState(false);

  const hoverProps =
    Platform.OS === 'web'
      ? ({
          onMouseEnter: () => setOpen(true),
          onMouseLeave: () => setOpen(false),
        } as any)
      : {};

  return (
    <View style={styles.wrap} {...hoverProps}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        hitSlop={8}
        accessibilityLabel="More information"
        accessibilityRole="button"
      >
        <Ionicons name="information-circle-outline" size={18} color={colors.info} />
      </Pressable>
      {open ? (
        <View style={styles.tooltip} pointerEvents="none">
          <Text style={styles.tooltipText}>{text}</Text>
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      position: 'relative',
      zIndex: 20,
    },
    tooltip: {
      position: 'absolute',
      top: 24,
      left: 0,
      width: 260,
      maxWidth: 280,
      backgroundColor: colors.bgCard,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
      zIndex: 50,
    },
    tooltipText: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
    },
  });
}
