/**
 * Android presentation-surface protections for vault UI (Phase 46).
 * Limits are platform-real; none claim protection against a second camera.
 */

import { Platform } from 'react-native';

export interface PresentationProtectionStatus {
  screenCaptureBlocked: boolean;
  screenCaptureSupported: boolean;
  recentTaskRedactionRequested: boolean;
  note: string;
}

let captureBlocked = false;

async function loadScreenCaptureModule(): Promise<{
  preventScreenCaptureAsync: () => Promise<void>;
  allowScreenCaptureAsync: () => Promise<void>;
} | null> {
  try {
    // Optional dependency — unavailable environments report explicit false.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-screen-capture') as {
      preventScreenCaptureAsync?: () => Promise<void>;
      allowScreenCaptureAsync?: () => Promise<void>;
    };
    if (typeof mod.preventScreenCaptureAsync === 'function' && typeof mod.allowScreenCaptureAsync === 'function') {
      return {
        preventScreenCaptureAsync: mod.preventScreenCaptureAsync,
        allowScreenCaptureAsync: mod.allowScreenCaptureAsync,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Enable FLAG_SECURE-equivalent capture blocking while vault surfaces are visible. */
export async function enableVaultScreenProtection(): Promise<PresentationProtectionStatus> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return {
      screenCaptureBlocked: false,
      screenCaptureSupported: false,
      recentTaskRedactionRequested: false,
      note: 'Screen capture controls are not available on this platform build.',
    };
  }
  const mod = await loadScreenCaptureModule();
  if (!mod) {
    return {
      screenCaptureBlocked: false,
      screenCaptureSupported: false,
      recentTaskRedactionRequested: false,
      note: 'expo-screen-capture not linked; document as pending native binding for production vault enablement.',
    };
  }
  await mod.preventScreenCaptureAsync();
  captureBlocked = true;
  return {
    screenCaptureBlocked: true,
    screenCaptureSupported: true,
    recentTaskRedactionRequested: true,
    note: 'Capture blocking requested via expo-screen-capture (Android FLAG_SECURE / iOS analog). Not a camera-proof claim.',
  };
}

export async function disableVaultScreenProtection(): Promise<void> {
  if (!captureBlocked) return;
  const mod = await loadScreenCaptureModule();
  if (mod) {
    await mod.allowScreenCaptureAsync();
  }
  captureBlocked = false;
}

/** Accessibility labels while locked must not include vault plaintext or titles. */
export function lockedVaultAccessibilityLabel(surface: string): string {
  return `Vault locked. ${surface}. Unlock required.`;
}

export function unlockedVaultAccessibilityLabel(title: string, detail?: string): string {
  return detail ? `${title}. ${detail}` : title;
}

/** Notification / analytics / log redaction helpers — never include vault plaintext. */
export function redactVaultLogFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (/plain|title|body|passphrase|recovery|secret|clipboard/i.test(k)) {
      out[k] = '[redacted]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function clearClipboardIfControllable(
  setStringAsync?: (value: string) => Promise<void>
): Promise<{ cleared: boolean; note: string }> {
  if (!setStringAsync) {
    return {
      cleared: false,
      note: 'Clipboard API unavailable; cannot guarantee wipe of prior copies outside the app.',
    };
  }
  try {
    await setStringAsync('');
    return {
      cleared: true,
      note: 'Clipboard cleared on lock where expo-clipboard permits. OS may retain history outside app control.',
    };
  } catch {
    return { cleared: false, note: 'Clipboard clear failed; treat as uncleared.' };
  }
}
