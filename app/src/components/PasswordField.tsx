import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, ThemeColors, spacing } from '../theme';

type Props = TextInputProps & {
  containerStyle?: StyleProp<ViewStyle>;
  error?: boolean;
};

export default function PasswordField({ style, containerStyle, error, ...rest }: Props) {
  const [visible, setVisible] = useState(false);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={[styles.wrap, containerStyle]}>
      <TextInput
        {...rest}
        style={[styles.input, error && styles.inputError, style]}
        secureTextEntry={!visible}
        autoCapitalize={rest.autoCapitalize ?? 'none'}
        placeholderTextColor={rest.placeholderTextColor ?? colors.textMuted}
      />
      <TouchableOpacity
        style={styles.eye}
        onPress={() => setVisible((v) => !v)}
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={18}
          color={colors.textMuted}
        />
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      position: 'relative',
      justifyContent: 'center',
    },
    input: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.inputRadius,
      paddingHorizontal: spacing.inputPadH,
      paddingVertical: spacing.inputPadV,
      paddingRight: 42,
      color: colors.text,
      fontSize: spacing.inputFont,
      minHeight: 38,
    },
    inputError: {
      borderColor: colors.danger,
    },
    eye: {
      position: 'absolute',
      right: 10,
      paddingVertical: 2,
      paddingHorizontal: 2,
    },
  });
}
