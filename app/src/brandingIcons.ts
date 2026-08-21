import { Platform } from 'react-native';
import { getApiBaseUrlSyncFallback } from './api';

function absoluteUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;
  return `${getApiBaseUrlSyncFallback()}${path}`;
}

function upsertLink(rel: string, href: string, attrs: Record<string, string> = {}) {
  if (typeof document === 'undefined') return;
  let el = document.querySelector(`link[data-tt-brand="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('data-tt-brand', rel);
    document.head.appendChild(el);
  }
  el.rel = attrs.rel || rel;
  if (attrs.sizes) el.setAttribute('sizes', attrs.sizes);
  if (attrs.type) el.type = attrs.type;
  el.href = href;
}

/** Keep browser / PWA “home screen” icons in sync with Settings logo. */
export function applyBrandingIcons(logoPath?: string | null) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const href = absoluteUrl(logoPath);
  if (!href) return;
  const bust = href.includes('?') ? href : `${href}?v=${Date.now()}`;
  upsertLink('icon', bust, { rel: 'icon', type: 'image/png' });
  upsertLink('apple-touch-icon', bust, { rel: 'apple-touch-icon', sizes: '180x180' });
  upsertLink('shortcut icon', bust, { rel: 'shortcut icon' });

  const native = (window as any).TeamTaskNative;
  if (native && typeof native.setAppLogo === 'function') {
    try {
      native.setAppLogo(bust);
    } catch {
      // ignore
    }
  }
}
