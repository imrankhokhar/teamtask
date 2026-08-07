import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme, ThemeColors } from '../theme';

type Props = {
  label?: string;
  fullScreen?: boolean;
  compact?: boolean;
};

export default function LoadingView({
  label = 'Loading…',
  fullScreen = false,
  compact = false,
}: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View
      style={[
        styles.wrap,
        fullScreen && styles.full,
        compact && styles.compact,
      ]}
    >
      <ActivityIndicator size={compact ? 'small' : 'large'} color={colors.accent} />
      {!!label && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: 24,
    },
    full: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    compact: {
      padding: 12,
      gap: 8,
    },
    label: {
      color: colors.textMuted,
      fontSize: 14,
      fontWeight: '600',
    },
  });
}
