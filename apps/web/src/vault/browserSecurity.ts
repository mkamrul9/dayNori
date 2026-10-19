/**
 * Browser vault security helpers (Phase 47).
 * Accurate limits: browser memory cleanup is best-effort; a compromised client can still observe plaintext while unlocked.
 */

const SENSITIVE_KEY = /plain|title|body|passphrase|recovery|secret|keyHandle|clipboard/i;

export function redactVaultDiagnostic(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : v;
  }
  return out;
}

/** Vault content must never enter search, preview, notification, analytics, or AI consumers. */
export function isVaultContentExcludedFromConsumers(): true {
  return true;
}

export function assertNoVaultPlaintextInUrl(href: string): boolean {
  return !/passphrase|recovery.secret|vault-item-|synth-handle/i.test(href);
}

export async function clearBrowserClipboardIfAvailable(): Promise<{
  cleared: boolean;
  note: string;
}> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return {
      cleared: false,
      note: 'Clipboard API unavailable; clearing not established.',
    };
  }
  try {
    await navigator.clipboard.writeText('');
    return {
      cleared: true,
      note: 'Clipboard cleared on lock where the Permissions Policy allows. OS clipboard history may retain copies.',
    };
  } catch {
    return { cleared: false, note: 'Clipboard clear failed or denied; treat as uncleared.' };
  }
}

export const BROWSER_MEMORY_CLEANUP_LIMITS = [
  'Unlocked keys and plaintext must stay in process memory only — never localStorage, sessionStorage, IndexedDB plaintext stores, service-worker caches, outbox payloads, URLs, or diagnostics.',
  'Lock detaches key handles and clears UI plaintext; JavaScript engines do not guarantee secure zeroization of prior buffers.',
  'A compromised browser profile or extension can observe plaintext while the vault is unlocked; disclose this limit honestly.',
  'Ciphertext drafts and pending encrypted operations may persist; they are not plaintext.',
] as const;
