'use client';

import { OperatorGate } from '../../../components/OperatorGate';
import { VaultHarnessClient } from '../../../vault/VaultHarnessClient';

export function VaultHarnessGate() {
  return (
    <OperatorGate title="Synthetic vault harness">
      <main>
        <VaultHarnessClient />
      </main>
    </OperatorGate>
  );
}
