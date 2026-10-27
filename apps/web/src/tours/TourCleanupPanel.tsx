'use client';

import React, { useMemo, useState } from 'react';
import { colors, spacing, type ThemeMode } from '@daynori/design-tokens';
import { Button } from '@daynori/ui-web';
import {
  applyCleanupDecisionsToProgress,
  buildTourCleanupReview,
  validateCleanupSelection,
} from '@daynori/domain';
import { useTourOptional } from './TourContext';
import { createWebApiClient } from '../data/webApiClient';
import { useAuth } from '../components/AuthContext';

/**
 * Selective practice cleanup — never bulk-deletes by title prefix.
 * Entity deletion uses normal app commands only when the user confirms removal.
 */
export function TourCleanupPanel({ themeMode }: { themeMode: ThemeMode }) {
  const palette = colors[themeMode];
  const tour = useTourOptional();
  const { csrfToken } = useAuth();
  const review = useMemo(
    () => (tour ? buildTourCleanupReview(tour.progress) : []),
    [tour]
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');

  if (!tour) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirm = async () => {
    const ids = Array.from(selected);
    const check = validateCleanupSelection(review, ids);
    if (!check.ok) {
      setMessage(check.error);
      return;
    }
    // Progress metadata only here; physical delete remains user-driven via Plan/Library.
    const next = applyCleanupDecisionsToProgress(tour.progress, ids);
    // Persist via preference update through a lightweight evidence confirmation.
    if (csrfToken) {
      try {
        const client = createWebApiClient({ csrfToken });
        const pref = await client.getUserPreferences();
        await client.updateUserPreferences({
          preferences: { tourProgress: next },
          expectedRevision: pref.data.revision,
        });
      } catch {
        setMessage('Could not save cleanup preferences. Try again when online.');
        return;
      }
    }
    await tour.reportEvidence({
      type: 'cleanup_confirmed',
      cleanupEntityIds: ids,
      expectedAction: 'confirm_cleanup',
      targetId: 'tour.cleanup.review',
    });
    setMessage(
      ids.length === 0
        ? 'Kept all tracked practice records. No deletions performed.'
        : `Marked ${ids.length} labeled practice ID(s) for review. Delete those items in Plan/Library if you still want them removed.`
    );
    setSelected(new Set());
  };

  return (
    <div
      data-tour-target="tour.cleanup.review"
      style={{
        borderTop: `1px solid ${palette.border.subtle}`,
        paddingTop: spacing.sm,
      }}
    >
      <h3 style={{ margin: '0 0 8px', fontSize: 14, color: palette.text.primary }}>
        Practice cleanup review
      </h3>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: palette.text.secondary }}>
        Only explicitly tracked tour practice records appear here. User-owned and edited/linked items
        default to keep. Titles alone never prove disposability.
      </p>
      {review.length === 0 ? (
        <p style={{ fontSize: 12, color: palette.text.secondary }}>No cleanup candidates.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {review.map((item) => (
            <li key={`${item.chapterId}:${item.entityId}`} style={{ marginBottom: 6 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={selected.has(item.entityId)}
                  disabled={item.defaultKeep && item.linkedOrEdited}
                  onChange={() => toggle(item.entityId)}
                />
                <span style={{ color: palette.text.primary }}>
                  {item.entityType} · {item.entityId.slice(0, 8)}… · {item.chapterId}
                  {item.linkedOrEdited ? ' (edited/linked — keep by default)' : ''}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <Button
          variant="secondary"
          size="compact"
          themeMode={themeMode}
          onClick={() => void confirm()}
        >
          Confirm cleanup selection
        </Button>
      </div>
      {message ? (
        <p style={{ marginTop: 8, fontSize: 12, color: palette.text.secondary }}>{message}</p>
      ) : null}
    </div>
  );
}
