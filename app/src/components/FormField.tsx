import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useTheme, ThemeColors } from '../theme';

type Props = TextInputProps & {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
  /** Custom control instead of TextInput (e.g. PasswordField) */
  children?: React.ReactNode;
};

export default function FormField({
  label,
  required,
  error,
  hint,
  containerStyle,
  children,
  style,
  ...inputProps
}: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const showInput = !children;

  return (
    <View style={[styles.wrap, containerStyle]}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      {children}
      {showInput ? (
        <TextInput
          {...inputProps}
          style={[styles.input, error ? styles.inputError : null, style]}
          placeholderTextColor={colors.textMuted}
        />
      ) : null}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!error && !!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { marginBottom: 4 },
    label: {
      color: colors.textMuted,
      marginBottom: 8,
      fontWeight: '700',
      fontSize: 13,
    },
    req: { color: colors.danger, fontWeight: '800' },
    input: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 16,
    },
    inputError: {
      borderColor: colors.danger,
    },
    error: {
      color: colors.danger,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 6,
    },
    hint: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 6,
      lineHeight: 17,
    },
  });
}
