'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { colors, touchTargets } from '@daynori/design-tokens';
import { findHelpArticle, articleTitle } from '@daynori/domain';
import { useAuth } from './AuthContext';
import { useShell } from './ShellContext';
import { saveHelpReturnContext } from '../help/helpReturnContext';
import { hasUnsavedWork } from '../editing/unsavedWork';

/**
 * Opens a Help article without forcing save or clearing unsaved flags.
 * Return context is account-scoped; Browser Back restores the prior path.
 */
export function ContextualHelpLink(props: {
  articleId: string;
  label?: string;
  className?: string;
}) {
  const { articleId, label = 'Help', className } = props;
  const router = useRouter();
  const pathname = usePathname();
  const { user, workspaceId } = useAuth();
  const { themeMode } = useShell();
  const palette = colors[themeMode];
  const article = findHelpArticle(articleId);

  if (!article) {
    return (
      <span
        className={className}
        style={{ fontSize: 12, color: palette.text.secondary }}
        title="Help article unavailable"
      >
        Help unavailable
      </span>
    );
  }

  const open = () => {
    if (user?.id) {
      saveHelpReturnContext({
        userId: user.id,
        workspaceId: workspaceId,
        returnPath: pathname || '/',
        articleId,
        openedAt: new Date().toISOString(),
      });
    }
    // Intentionally do not call setUnsavedWork(false) or force-save.
    void hasUnsavedWork();
    router.push(`/help?article=${encodeURIComponent(articleId)}`);
  };

  return (
    <button
      type="button"
      className={className}
      onClick={open}
      aria-label={`Open Help: ${articleTitle(article)}`}
      style={{
        minHeight: touchTargets.webMin,
        minWidth: touchTargets.webMin,
        padding: '4px 10px',
        borderRadius: 8,
        border: `1px solid ${palette.border.subtle}`,
        background: palette.surface,
        color: palette.brand.primary,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
