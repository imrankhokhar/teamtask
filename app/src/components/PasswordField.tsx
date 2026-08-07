import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  TextInputProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useTheme, ThemeColors } from '../theme';

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
        <Text style={styles.eyeGlyph}>{visible ? '◉' : '◎'}</Text>
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
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      paddingRight: 48,
      color: colors.text,
      fontSize: 16,
    },
    inputError: {
      borderColor: colors.danger,
    },
    eye: {
      position: 'absolute',
      right: 12,
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    eyeGlyph: {
      color: colors.textMuted,
      fontSize: 20,
      fontWeight: '700',
    },
  });
}
