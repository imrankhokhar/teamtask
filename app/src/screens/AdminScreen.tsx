import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../theme';
import { useAuth } from '../auth';

export default function AdminScreen({ navigation }: any) {
  const { user } = useAuth();

  if (user?.role !== 'admin') {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Admin only</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Admin</Text>
      <Text style={styles.sub}>
        Manage tones and free SMTP email. All data stays on this device.
      </Text>
      <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('Sounds')}>
        <Text style={styles.btnText}>Sounds & tones</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('EmailSettings')}>
        <Text style={styles.btnText}>Email / SMTP settings</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  back: { color: colors.info, marginTop: 48 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', marginVertical: 12 },
  sub: { color: colors.textMuted, lineHeight: 20, marginBottom: 16 },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnText: { color: '#062016', fontWeight: '800' },
});
