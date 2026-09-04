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
 * Equal-width cards from measured content area (not content text).
 * Density comes from Settings → Card size: preferred card width drives how many columns fit.
 */
export type CardSize = 'compact' | 'comfortable' | 'large';

const CARD_SIZE_PRESETS: Record<
  CardSize,
  { preferredCard: number; padPhone: number; padDesktop: number; gap: number; cardPad: number }
> = {
  // preferredCard drives column count on wide layouts; on 1-col Compact/Comfortable are capped to it.
  compact: { preferredCard: 220, padPhone: 8, padDesktop: 8, gap: 8, cardPad: 10 },
  comfortable: { preferredCard: 280, padPhone: 10, padDesktop: 12, gap: spacing.cardGap, cardPad: spacing.cardPad },
  large: { preferredCard: 460, padPhone: 10, padDesktop: 14, gap: 18, cardPad: 22 },
};

export function listLayoutFor(windowWidth: number, contentWidth = 0, cardSize: CardSize = 'comfortable') {
  const preset = CARD_SIZE_PRESETS[cardSize] || CARD_SIZE_PRESETS.comfortable;
  const phone = windowWidth < PHONE_MAX;
  const pad = phone ? preset.padPhone : preset.padDesktop;
  const gap = preset.gap;
  const column =
    contentWidth > 40
      ? contentWidth
      : Math.max(200, windowWidth - (phone ? SIDEBAR_RAIL : 0));
  const inner = Math.max(160, column - pad * 2);
  // How many preferred-width cards fit — Large prefers fewer, wider cards.
  const cols = phone
    ? 1
    : Math.max(1, Math.min(4, Math.floor((inner + gap) / (preset.preferredCard + gap))));
  let cardWidth = Math.floor((inner - gap * (cols - 1)) / cols);
  // Single column: cap at preferred width so Compact/Comfortable stay visibly smaller than Large.
  if (cols === 1) {
    cardWidth = Math.min(inner, cardSize === 'large' ? inner : preset.preferredCard);
  }

  return {
    phone,
    pad,
    gap,
    cols,
    cardWidth,
    cardPad: preset.cardPad,
    cardSize,
    grid: {
      flexDirection: cols === 1 ? ('column' as const) : ('row' as const),
      flexWrap: cols === 1 ? ('nowrap' as const) : ('wrap' as const),
      alignItems: cols === 1 ? ('center' as const) : ('flex-start' as const),
      alignContent: 'flex-start' as const,
      justifyContent: 'flex-start' as const,
      flexGrow: 0,
      paddingHorizontal: pad,
      paddingTop: pad,
      paddingBottom: phone ? 100 : 40,
      gap,
      width: '100%' as const,
      maxWidth: '100%' as const,
    },
    card: {
      width: cardWidth,
      maxWidth: cardWidth,
      minWidth: cardWidth,
      alignSelf: cols === 1 ? ('center' as const) : ('flex-start' as const),
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: cardWidth,
      height: 'auto' as const,
      minHeight: 0,
      overflow: 'hidden' as const,
    },
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
const CARD_SIZE_KEY = 'card_size';

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  cardSize: CardSize;
  setCardSize: (size: CardSize) => void;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [cardSize, setCardSizeState] = useState<CardSize>('comfortable');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [savedTheme, savedCard] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(CARD_SIZE_KEY),
        ]);
        if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
          setModeState(savedTheme);
        }
        if (savedCard === 'compact' || savedCard === 'comfortable' || savedCard === 'large') {
          setCardSizeState(savedCard);
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

  const setCardSize = useCallback((next: CardSize) => {
    setCardSizeState(next);
    AsyncStorage.setItem(CARD_SIZE_KEY, next).catch(() => undefined);
  }, []);

  const resolved: 'light' | 'dark' =
    mode === 'system' ? (system === 'light' ? 'light' : 'dark') : mode;

  const palette = resolved === 'light' ? lightColors : darkColors;

  useEffect(() => {
    colors = palette;
  }, [palette]);

  const value = useMemo(
    () => ({ mode, resolved, colors: palette, setMode, cardSize, setCardSize, ready }),
    [mode, resolved, palette, setMode, cardSize, setCardSize, ready]
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
      cardSize: 'comfortable' as CardSize,
      setCardSize: (_s: CardSize) => undefined,
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
