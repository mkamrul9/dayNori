import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { VaultHarnessClient } from '../../../vault/VaultHarnessClient';

export const metadata: Metadata = {
  title: 'Vault harness (development) — Daynori',
  description: 'Development-only synthetic vault harness. No production vault content.',
  robots: { index: false, follow: false },
};

/**
 * Server entry: available only when NODE_ENV === 'development'.
 * Renders no vault plaintext; client harness owns unlock/decrypt state.
 */
export default function DevVaultHarnessPage() {
  if (process.env.NODE_ENV !== 'development') {
    notFound();
  }

  return (
    <main>
      <VaultHarnessClient />
    </main>
  );
}
