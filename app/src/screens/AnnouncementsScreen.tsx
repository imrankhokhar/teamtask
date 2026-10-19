import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  TextInput,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../auth';
import { api, ApiError, getApiBaseUrlSyncFallback } from '../api';
import { useTheme, ThemeColors } from '../theme';
import AppShell from '../components/AppShell';
import FormField from '../components/FormField';
import { useConfirm } from '../components/ConfirmModal';

function resolveUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${getApiBaseUrlSyncFallback()}${path}`;
}

export default function AnnouncementsScreen({ navigation }: any) {
  const { isAdmin, can } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { confirm, dialog } = useConfirm();
  const canEdit = isAdmin || can('settings.edit');

  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<any>(null);
  const [imageName, setImageName] = useState('announce.png');
  const [imageMime, setImageMime] = useState('image/png');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.announcements();
      setList(data.announcements || []);
    } catch (e: any) {
      setMsg(e.message || 'Failed to load');
      setErr(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function pickImage() {
    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const picked = await new Promise<{ file: File; uri: string } | null>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.style.display = 'none';
          input.onchange = () => {
            const f = input.files?.[0];
            input.remove();
            if (!f) return resolve(null);
            resolve({ file: f, uri: URL.createObjectURL(f) });
          };
          document.body.appendChild(input);
          input.click();
        });
        if (!picked) return;
        setImageFile(picked.file);
        setImageUri(picked.uri);
        setImageName(picked.file.name || 'announce.png');
        setImageMime(picked.file.type || 'image/png');
        return;
      }
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const file = result.assets[0];
      setImageUri(file.uri);
      setImageName(file.name || 'announce.png');
      setImageMime(file.mimeType || 'image/png');
      setImageFile((file as any).file || null);
    } catch (e: any) {
      setErr(true);
      setMsg(e.message || 'Could not pick image');
    }
  }

  async function publish() {
    if (!canEdit) return;
    try {
      setBusy(true);
      setMsg('');
      setFields({});
      setErr(false);
      if (!title.trim()) {
        setFields({ title: 'Title is required' });
        setErr(true);
        setMsg('Please fix the highlighted fields');
        return;
      }
      await api.createAnnouncement({
        title: title.trim(),
        body: body.trim(),
        imageUri,
        imageName,
        imageMime,
        imageFile,
      });
      setTitle('');
      setBody('');
      setImageUri(null);
      setImageFile(null);
      setMsg('Announcement posted — all users notified (if notifications are on)');
      await load();
    } catch (e: any) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setErr(true);
      setMsg(e.message || 'Failed to post');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: 'Delete announcement?',
      message: 'This removes it from everyone’s dashboard.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api.deleteAnnouncement(id);
      await load();
    } catch (e: any) {
      setErr(true);
      setMsg(e.message || 'Delete failed');
    }
  }

  return (
    <AppShell navigation={navigation} active="Settings" title="Announcements / News">
      {dialog}
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back to settings</Text>
        </TouchableOpacity>

        {canEdit ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Post announcement</Text>
            <Text style={styles.hint}>
              Title, description, and optional image. Posted items show on everyone’s Dashboard and
              notify all users when Notifications are enabled.
            </Text>
            <FormField
              label="Title"
              required
              value={title}
              onChangeText={setTitle}
              error={fields.title}
              placeholder="e.g. Office closed Friday"
            />
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={styles.area}
              value={body}
              onChangeText={setBody}
              placeholder="Details for the team…"
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <View style={styles.imgRow}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
              ) : (
                <View style={[styles.preview, styles.previewEmpty]}>
                  <Ionicons name="image-outline" size={28} color={colors.textMuted} />
                </View>
              )}
              <TouchableOpacity style={styles.secondary} onPress={pickImage}>
                <Text style={styles.secondaryText}>Choose image</Text>
              </TouchableOpacity>
            </View>
            {!!msg && (
              <Text style={[styles.banner, err ? styles.bannerErr : styles.bannerOk]}>{msg}</Text>
            )}
            <TouchableOpacity style={styles.primary} onPress={publish} disabled={busy}>
              {busy ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.primaryText}>Publish</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.hint}>Only admins can post announcements.</Text>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Published</Text>
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : list.length === 0 ? (
            <Text style={styles.hint}>No announcements yet.</Text>
          ) : (
            list.map((a) => {
              const img = resolveUrl(a.imageUrl);
              return (
                <View key={a.id} style={styles.card}>
                  <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                    <Text style={styles.cardTitle}>{a.title}</Text>
                    {!!a.body && <Text style={styles.cardBody}>{a.body}</Text>}
                    <Text style={styles.meta}>
                      {a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}
                    </Text>
                    {canEdit ? (
                      <TouchableOpacity onPress={() => remove(a.id)}>
                        <Text style={styles.delete}>Delete</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {img ? (
                    <Image source={{ uri: img }} style={styles.cardImg} resizeMode="cover" />
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </AppShell>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, gap: 12, paddingBottom: 40, maxWidth: 640 },
    back: { color: colors.info, fontWeight: '700', marginBottom: 4 },
    section: {
      backgroundColor: colors.bgCard,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 10,
    },
    sectionTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
    hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
    label: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
    area: {
      minHeight: 100,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      color: colors.text,
      backgroundColor: colors.bgElevated,
      textAlignVertical: 'top',
    },
    imgRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    preview: { width: 72, height: 72, borderRadius: 10 },
    previewEmpty: {
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
    },
    secondary: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.bgElevated,
    },
    secondaryText: { color: colors.accent, fontWeight: '700' },
    primary: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryText: { color: colors.onAccent, fontWeight: '800' },
    banner: { fontSize: 13, fontWeight: '600' },
    bannerOk: { color: colors.accent },
    bannerErr: { color: colors.danger },
    card: {
      flexDirection: 'row',
      gap: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingVertical: 12,
      alignItems: 'flex-start',
    },
    cardImg: { width: 88, height: 66, borderRadius: 8, backgroundColor: colors.border },
    cardTitle: { color: colors.text, fontWeight: '800', fontSize: 15, flex: 1 },
    cardBody: { color: colors.text, fontSize: 14, lineHeight: 20 },
    meta: { color: colors.textMuted, fontSize: 12 },
    delete: { color: colors.danger, fontWeight: '700', marginTop: 4 },
  });
}
