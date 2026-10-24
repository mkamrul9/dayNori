/**
 * Cross-tab vault lock coordination — never transmits keys, passphrases, recovery secrets, or plaintext.
 */

export const VAULT_LOCK_CHANNEL = 'daynori-vault-session-v1';

export type VaultCrossTabMessage =
  | { type: 'lock_signal'; reason: string; at: string }
  | { type: 'session_invalidated'; reason: string; at: string };

export function publishVaultLockSignal(
  message: VaultCrossTabMessage,
  channelFactory: () => BroadcastChannel | null = defaultChannel
): void {
  const ch = channelFactory();
  if (!ch) return;
  try {
    ch.postMessage(message);
  } finally {
    ch.close();
  }
}

export function subscribeVaultLockSignals(
  onMessage: (message: VaultCrossTabMessage) => void,
  channelFactory: () => BroadcastChannel | null = defaultChannel
): () => void {
  const ch = channelFactory();
  if (!ch) return () => {};
  const handler = (ev: MessageEvent) => {
    const data = ev.data as VaultCrossTabMessage | null;
    if (!data || typeof data !== 'object') return;
    if (data.type !== 'lock_signal' && data.type !== 'session_invalidated') return;
    if (typeof data.reason !== 'string' || typeof data.at !== 'string') return;
    onMessage(data);
  };
  ch.addEventListener('message', handler);
  return () => {
    ch.removeEventListener('message', handler);
    ch.close();
  };
}

function defaultChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(VAULT_LOCK_CHANNEL);
  } catch {
    return null;
  }
}
