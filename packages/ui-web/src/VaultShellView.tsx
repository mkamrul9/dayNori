'use client';

import React from 'react';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import type { TransferUiPhase, VaultSessionSnapshot } from '@daynori/domain';
import { describeTransferUiStatus } from '@daynori/domain';
import { Button } from './Button.js';
import { EmptyState } from './EmptyState.js';
import { Feedback } from './Feedback.js';

export interface WebVaultListItemVm {
  id: string;
  displayLabel: string;
  folderId: string | null;
  trashed?: boolean;
}

export interface VaultShellViewProps {
  session: VaultSessionSnapshot;
  themeMode?: ThemeMode;
  syntheticHarness?: boolean;
  items: WebVaultListItemVm[];
  trashItems: WebVaultListItemVm[];
  selectedId: string | null;
  selectedDetail: { title: string; body: string } | null;
  transferPhase: TransferUiPhase;
  showingTrash: boolean;
  statusNotes?: string;
  onOpenUnlock: () => void;
  onLock: () => void;
  onSelectItem: (id: string) => void;
  onClearSelection: () => void;
  onShowTrash: () => void;
  onTransferPhaseChange: (phase: TransferUiPhase) => void;
}

/** Escape plaintext for safe text rendering (filenames/titles treated as text, never HTML). */
export function safeDisplayText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

export const VaultShellView: React.FC<VaultShellViewProps> = ({
  session,
  themeMode = 'light',
  syntheticHarness = false,
  items,
  trashItems,
  selectedId,
  selectedDetail,
  transferPhase,
  showingTrash,
  statusNotes,
  onOpenUnlock,
  onLock,
  onSelectItem,
  onClearSelection,
  onShowTrash,
  onTransferPhaseChange,
}) => {
  const palette = colors[themeMode];
  const unlocked = session.state === 'unlocked';
  const transfer = describeTransferUiStatus(transferPhase);
  const list = showingTrash ? trashItems : items;

  return (
    <div
      data-testid="web-vault-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.base,
        padding: spacing.base,
        color: palette.text.primary,
      }}
    >
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>
          {syntheticHarness ? 'Vault (synthetic harness)' : 'Vault'}
        </h1>
        <span role="status" aria-live="polite" data-testid="web-vault-lock-state">
          State: {session.state}
        </span>
        {!unlocked ? (
          <Button themeMode={themeMode} variant="primary" onClick={onOpenUnlock} data-testid="web-vault-open-unlock">
            Unlock
          </Button>
        ) : (
          <Button themeMode={themeMode} variant="secondary" onClick={onLock} data-testid="web-vault-lock">
            Lock
          </Button>
        )}
        <Button themeMode={themeMode} variant="subtle" onClick={onShowTrash}>
          {showingTrash ? 'Show active' : 'Show trash'}
        </Button>
      </header>

      {syntheticHarness ? (
        <Feedback
          severity="info"
          message="Synthetic harness: durable repository/sync operations are not available. Create/edit/attachments/transfer states are local UI only."
        />
      ) : null}

      {!unlocked ? (
        <EmptyState
          title="Vault locked"
          description="Protected vault content is hidden. Unlock required. Account password recovery cannot open the vault."
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.base }}>
          <ul
            aria-label={showingTrash ? 'Trashed vault items' : 'Vault items'}
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
          >
            {list.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  data-testid={`web-vault-item-${item.id}`}
                  onClick={() => onSelectItem(item.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: spacing.sm,
                    marginBottom: 4,
                    borderRadius: radii.sm,
                    border: `1px solid ${selectedId === item.id ? palette.action.primary : palette.border.subtle}`,
                    background: selectedId === item.id ? palette.surfaceRaised : palette.surface,
                    color: palette.text.primary,
                    cursor: 'pointer',
                  }}
                >
                  {safeDisplayText(item.displayLabel)}
                </button>
              </li>
            ))}
          </ul>
          <div
            aria-label="Vault item detail"
            style={{
              border: `1px solid ${palette.border.subtle}`,
              borderRadius: radii.card,
              padding: spacing.base,
              minHeight: 160,
            }}
          >
            {selectedDetail ? (
              <>
                <h2 style={{ marginTop: 0 }}>{safeDisplayText(selectedDetail.title)}</h2>
                <p style={{ whiteSpace: 'pre-wrap' }}>{safeDisplayText(selectedDetail.body)}</p>
                <Button themeMode={themeMode} variant="subtle" onClick={onClearSelection}>
                  Clear selection
                </Button>
              </>
            ) : (
              <p style={{ color: palette.text.secondary }}>Select an item to decrypt on read.</p>
            )}
          </div>
        </div>
      )}

      <section aria-labelledby="transfer-status-heading">
        <h2 id="transfer-status-heading" style={{ fontSize: 16 }}>
          Transfer recovery states (harness)
        </h2>
        <p role="status">{transfer.message}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs }}>
          {(
            [
              'preview',
              'pending_verification',
              'pending_cleanup',
              'retained_ordinary_copy',
              'failed',
              'complete',
            ] as TransferUiPhase[]
          ).map((phase) => (
            <Button
              key={phase}
              themeMode={themeMode}
              variant={transferPhase === phase ? 'primary' : 'subtle'}
              size="compact"
              onClick={() => onTransferPhaseChange(phase)}
            >
              {phase}
            </Button>
          ))}
        </div>
      </section>

      {statusNotes ? (
        <p style={{ color: palette.text.secondary, fontSize: 13 }} data-testid="web-vault-status-notes">
          {statusNotes}
        </p>
      ) : null}
    </div>
  );
};
