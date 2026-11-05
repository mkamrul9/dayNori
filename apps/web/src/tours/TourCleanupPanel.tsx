'use client';

import React, { useMemo, useRef, useState } from 'react';
import { colors, spacing, type ThemeMode } from '@daynori/design-tokens';
import { Button } from '@daynori/ui-web';
import {
  executeTourCleanup,
  buildTourCleanupReview,
  validateCleanupSelection,
} from '@daynori/domain';
import { useTourOptional } from './TourContext';
import { createWebApiClient } from '../data/webApiClient';
import { useAuth } from '../components/AuthContext';
import { createSyncTourCleanupPort } from '@daynori/sync';
import { getActiveWebSyncEngine } from '../data/syncAdapter';

/**
 * Selective practice cleanup — never bulk-deletes by title prefix.
 * Entity deletion uses normal app commands only when the user confirms removal.
 */
export function TourCleanupPanel({ themeMode }: { themeMode: ThemeMode }) {
  const palette = colors[themeMode];
  const tour = useTourOptional();
  const { csrfToken, user, workspaceId } = useAuth();
  const scopeKey = `${user?.id}:${workspaceId}`;
  const currentScope = useRef(scopeKey);
  currentScope.current = scopeKey;
  const review = useMemo(() => (tour ? buildTourCleanupReview(tour.progress) : []), [tour]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

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
    if (busy) return;
    const report = tour.captureEvidence();
    const ids = Array.from(selected);
    const check = validateCleanupSelection(review, ids);
    if (!check.ok) {
      setMessage(check.error);
      return;
    }
    if (ids.length === 0) {
      await report({
        type: 'cleanup_confirmed',
        cleanupEntityIds: [],
        expectedAction: 'confirm_cleanup',
        targetId: 'tour.cleanup.review',
      });
      setMessage('Kept all tracked practice records. No deletions performed.');
      return;
    }
    const engine = getActiveWebSyncEngine();
    if (
      !engine ||
      !workspaceId ||
      !user ||
      !csrfToken ||
      engine.getAccountNamespace().workspaceId !== workspaceId ||
      engine.getAccountNamespace().userId !== user.id
    ) {
      setMessage('Open Plan or Library in this workspace before cleaning up practice records.');
      return;
    }
    setBusy(true);
    try {
      const client = createWebApiClient({ csrfToken });
      const result = await executeTourCleanup(
        tour.progress,
        ids,
        createSyncTourCleanupPort(
          engine,
          () => currentScope.current === scopeKey,
          async (id) => {
            try {
              return (await client.listItemLinks(workspaceId, id)).data.length > 0;
            } catch (error) {
              if (
                error instanceof Error &&
                error.message.includes('404') &&
                (await engine.getItemHeader(id))?.serverRevision === 0
              )
                return false;
              throw error;
            }
          }
        )
      );
      if (currentScope.current !== scopeKey) return;
      const saved = await tour.saveProgress(result.state);
      const failed = result.results.filter((r) => r.status === 'failed');
      if (!saved || failed.length > 0) {
        if (saved) setSelected(new Set(failed.map((r) => r.entityId)));
        setMessage(
          'Some records were kept or are waiting for deletion acknowledgment. Their tracking is retained; retry after reconnecting.'
        );
        return;
      }
      await report({
        type: 'cleanup_confirmed',
        cleanupEntityIds: ids,
        expectedAction: 'confirm_cleanup',
        targetId: 'tour.cleanup.review',
      });
      setMessage(
        ids.length === 0
          ? 'Kept all tracked practice records. No deletions performed.'
          : `Moved ${ids.length} selected practice record(s) to Trash. Kept all other records.`
      );
      setSelected(new Set());
    } catch {
      if (currentScope.current === scopeKey)
        setMessage('Cleanup failed. Practice tracking was retained; retry safely.');
    } finally {
      setBusy(false);
    }
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
        Only explicitly tracked tour practice records appear here. User-owned and edited/linked
        items default to keep. Titles alone never prove disposability.
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
                  disabled={busy || item.defaultKeep}
                  onChange={() => toggle(item.entityId)}
                />
                <span style={{ color: palette.text.primary }}>
                  {item.entityType} · {item.entityId.slice(0, 8)}… · {item.chapterId}
                  {item.defaultKeep ? ' (protected or unverified — keep)' : ''}
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
          disabled={busy}
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
