import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Vault — Daynori',
  description: 'Production vault access is disabled until security release gates pass.',
  robots: { index: false, follow: false },
};

/**
 * Production vault entry — intentionally disabled.
 * Does not render decrypted content, hydration secrets, or unlock UI.
 */
export default function VaultDisabledPage() {
  return (
    <main style={{ padding: 24, maxWidth: 640 }}>
      <h1>Vault unavailable</h1>
      <p>
        Production vault access is disabled. Unlock requires completed Phase 44/45 gates, reviewed
        browser key providers, and independent security review.
      </p>
      <p>
        Account password recovery cannot unlock vault ciphertext. Vault recovery remains a separate
        flow.
      </p>
      <p>
        <Link href="/settings">Return to settings</Link>
      </p>
    </main>
  );
}
