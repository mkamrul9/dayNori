import type { Metadata } from 'next';
import { VaultHarnessGate } from './VaultHarnessGate';

export const metadata: Metadata = {
  title: 'Vault harness (operator) — Daynori',
  description: 'Operator-only synthetic vault harness. No production vault content.',
  robots: { index: false, follow: false },
};

/**
 * Operator-authorized synthetic harness. NODE_ENV alone is not authorization —
 * OperatorGate + /v1/operator/session enforce DAYNORI_OPERATOR_USER_IDS.
 */
export default function DevVaultHarnessPage() {
  return <VaultHarnessGate />;
}
