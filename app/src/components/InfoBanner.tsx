import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, ThemeColors } from '../theme';

export default function InfoBanner({ children }: { children: string }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.wrap}>
      <Ionicons name="information-circle-outline" size={18} color={colors.info} />
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
      width: '100%',
    },
    text: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      flex: 1,
    },
  });
}
