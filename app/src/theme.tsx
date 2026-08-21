import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Appearance, ColorSchemeName, StyleSheet, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

export type ThemeColors = {
  bg: string;
  bgElevated: string;
  bgCard: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentDim: string;
  danger: string;
  warn: string;
  info: string;
  onAccent: string;
  errorBg: string;
  successBg: string;
  overlay: string;
  shadow: string;
};

/** Refined dark — calm forest hub */
export const darkColors: ThemeColors = {
  bg: '#0C1612',
  bgElevated: '#15241E',
  bgCard: '#1B2C25',
  border: '#2A3F36',
  text: '#F1F6F3',
  textMuted: '#8FA89B',
  accent: '#2FDB9A',
  accentDim: '#1A4A38',
  danger: '#FF6B6B',
  warn: '#F0C14D',
  info: '#5EB8F0',
  onAccent: '#062016',
  errorBg: '#3A1A1A',
  successBg: '#143528',
  overlay: 'rgba(0,0,0,0.55)',
  shadow: 'transparent',
};

/**
 * Light — clean mint workspace (not purple/cream).
 * Soft surfaces, deep text, vivid but calm green accent.
 */
export const lightColors: ThemeColors = {
  bg: '#EEF4F1',
  bgElevated: '#FFFFFF',
  bgCard: '#FFFFFF',
  border: '#D0E0D8',
  text: '#12201A',
  textMuted: '#5C7268',
  accent: '#0B9B6B',
  accentDim: '#D8F3E8',
  danger: '#D93838',
  warn: '#B87A00',
  info: '#1B7AB8',
  onAccent: '#FFFFFF',
  errorBg: '#FCEBEB',
  successBg: '#E5F7EF',
  overlay: 'rgba(15, 30, 24, 0.45)',
  shadow: 'rgba(18, 40, 30, 0.08)',
};

export const statusColors: Record<string, string> = {
  ongoing: '#1B7AB8',
  ready: '#0B9B6B',
  in_progress: '#B87A00',
  pending: '#5C7268',
  completed: '#1F7A55',
  reopen: '#D93838',
};

/** Standard control sizes — keep buttons/fields/cards compact */
export const spacing = {
  inputPadV: 8,
  inputPadH: 12,
  inputFont: 14,
  inputRadius: 10,
  btnPadV: 9,
  btnPadH: 14,
  btnFont: 14,
  btnRadius: 10,
  cardPad: 12,
  cardRadius: 12,
  cardGap: 12,
  /** Standard list card width — cards wrap instead of stretching full row */
  cardWidth: 340,
  labelFont: 12,
};

/** Phone breakpoint — match AppShell collapsed rail beside content */
export const PHONE_MAX = 700;
export const SIDEBAR_RAIL = 56;

/**
 * List grids: phones = single full-width column (no row-wrap — that breaks
 * height/overflow in Android WebView). Wider screens = wrapping cards.
 */
export function listLayoutFor(width: number) {
  const phone = width < PHONE_MAX;
  const pad = phone ? 10 : 12;
  const gap = spacing.cardGap;
  // Content column sits next to the 56px icon rail on phones
  const cardWidth = Math.max(200, width - SIDEBAR_RAIL - pad * 2);

  return {
    phone,
    pad,
    gap,
    cardWidth,
    grid: phone
      ? ({
          flexDirection: 'column',
          flexWrap: 'nowrap',
          alignItems: 'stretch',
          alignContent: 'flex-start',
          paddingHorizontal: pad,
          paddingTop: pad,
          paddingBottom: 100,
          gap,
          width: '100%',
          maxWidth: '100%',
        } as const)
      : ({
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          alignContent: 'flex-start',
          paddingHorizontal: pad,
          paddingTop: pad,
          paddingBottom: 40,
          gap,
          width: '100%',
          maxWidth: '100%',
        } as const),
    card: phone
      ? ({
          width: cardWidth,
          maxWidth: cardWidth,
          alignSelf: 'center',
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: 'auto',
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
        } as const)
      : ({
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 280,
          maxWidth: 400,
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
        } as const),
  };
}

/** @deprecated Prefer listLayoutFor(width).card */
export function listCardLayoutFor(width: number) {
  return listLayoutFor(width).card;
}

/** @deprecated Prefer listLayoutFor(width).card */
export const listCardLayout = {
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: 260,
  maxWidth: '100%' as const,
  minWidth: 0,
};

/** @deprecated Prefer useTheme().colors — kept for gradual migration */
export let colors: ThemeColors = { ...darkColors };

const STORAGE_KEY = 'theme_mode';

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setModeState(saved);
        }
      } catch {
        // ignore
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const resolved: 'light' | 'dark' =
    mode === 'system' ? (system === 'light' ? 'light' : 'dark') : mode;

  const palette = resolved === 'light' ? lightColors : darkColors;

  useEffect(() => {
    colors = palette;
  }, [palette]);

  const value = useMemo(
    () => ({ mode, resolved, colors: palette, setMode, ready }),
    [mode, resolved, palette, setMode, ready]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      mode: 'dark' as ThemeMode,
      resolved: 'dark' as const,
      colors: darkColors,
      setMode: (_m: ThemeMode) => undefined,
      ready: true,
    };
  }
  return ctx;
}

export function useThemedStyles<T>(factory: (c: ThemeColors) => T): T {
  const { colors: c } = useTheme();
  return useMemo(() => factory(c), [c, factory]);
}

/** Stable style factories — pass function reference, not inline arrow each render */
export function createStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (c: ThemeColors) => T
) {
  return factory;
}

export function resolveScheme(mode: ThemeMode, system: ColorSchemeName): 'light' | 'dark' {
  if (mode === 'system') return system === 'light' ? 'light' : 'dark';
  return mode;
}

export { Appearance };
