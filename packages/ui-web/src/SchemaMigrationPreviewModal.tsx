'use client';

import React from 'react';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import type { SchemaMigrationPreview } from '@daynori/domain';
import { Button } from './Button.js';
import { Dialog } from './Dialog.js';

export interface SchemaMigrationPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  preview: SchemaMigrationPreview | null;
  themeMode?: ThemeMode;
  onConfirmMigration: () => Promise<void> | void;
  isApplying?: boolean;
}

export const SchemaMigrationPreviewModal: React.FC<SchemaMigrationPreviewModalProps> = ({
  isOpen,
  onClose,
  preview,
  themeMode = 'light',
  onConfirmMigration,
  isApplying = false,
}) => {
  const palette = colors[themeMode];

  if (!preview) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Review Schema Changes"
      description="Preview how changes to your fields affect existing entries before applying them."
      themeMode={themeMode}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.base, minWidth: 420 }}>
        {/* Banner on breaking changes vs safe additions */}
        {preview.hasIncompatibleChanges ? (
          <div
            style={{
              padding: spacing.md,
              borderRadius: radii.sm,
              backgroundColor: '#fef2f2',
              border: `1px solid ${palette.status.danger}`,
              color: '#991b1b',
              fontSize: '0.85rem',
            }}
          >
            <strong>Important:</strong> This schema update modifies or removes existing fields
            across <strong>{preview.affectedRecordCount}</strong> recorded entry/entries.
            <div style={{ marginTop: spacing.xs }}>
              All previously entered values will be{' '}
              <strong>safely preserved in append-only versioned archives</strong> and can be
              inspected or recovered at any time.
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: spacing.md,
              borderRadius: radii.sm,
              backgroundColor: '#f0fdf4',
              border: `1px solid ${palette.status.success}`,
              color: '#166534',
              fontSize: '0.85rem',
            }}
          >
            <strong>Non-breaking update:</strong> This change adds new fields or retains existing
            ones without modifying types. All {preview.affectedRecordCount} existing entries remain
            intact.
          </div>
        )}

        {/* Impact List */}
        <div>
          <h4
            style={{
              margin: 0,
              marginBottom: spacing.sm,
              fontSize: '0.9rem',
              color: palette.text.primary,
            }}
          >
            Field Changes ({preview.summary})
          </h4>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: spacing.sm,
              maxHeight: 260,
              overflowY: 'auto',
            }}
          >
            {preview.affectedFields.map((impact, idx) => {
              let badgeColor = '#526363';
              let badgeBg = '#E4EFEA';
              if (impact.changeType === 'removed') {
                badgeColor = '#991b1b';
                badgeBg = '#fee2e2';
              } else if (impact.changeType === 'type_changed') {
                badgeColor = '#92400e';
                badgeBg = '#fef3c7';
              } else if (impact.changeType === 'added') {
                badgeColor = '#166534';
                badgeBg = '#dcfce7';
              }

              return (
                <div
                  key={`${impact.fieldId}_${idx}`}
                  style={{
                    padding: `${spacing.sm}px ${spacing.md}px`,
                    borderRadius: radii.sm,
                    border: `1px solid ${palette.border.subtle}`,
                    backgroundColor: palette.surface,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: palette.text.primary }}>
                      {impact.label}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: palette.text.secondary }}>
                      {impact.description}
                    </div>
                    {impact.archivedNotice && (
                      <div style={{ fontSize: '0.7rem', color: '#92400e', marginTop: 2 }}>
                        {impact.archivedNotice}
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      padding: '2px 8px',
                      borderRadius: radii.sm,
                      backgroundColor: badgeBg,
                      color: badgeColor,
                    }}
                  >
                    {impact.changeType.replace('_', ' ')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Safe archival explanation */}
        <div
          style={{
            padding: spacing.sm,
            borderRadius: radii.sm,
            backgroundColor: palette.action.subtle,
            fontSize: '0.75rem',
            color: palette.text.secondary,
          }}
        >
          Archive Retention Policy: Values from removed or type-changed fields are never erased.
          They remain stored as versioned archives linked to this section and can be recovered if
          you reinstate the field.
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: spacing.sm,
            marginTop: spacing.sm,
          }}
        >
          <Button variant="secondary" onClick={onClose} disabled={isApplying}>
            Cancel (Keep Current)
          </Button>
          <Button variant="primary" loading={isApplying} onClick={onConfirmMigration}>
            Apply Migration
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
