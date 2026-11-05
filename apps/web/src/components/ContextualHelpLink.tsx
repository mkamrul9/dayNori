'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { colors, touchTargets } from '@daynori/design-tokens';
import { findHelpArticle, articleTitle, resolveHelpText } from '@daynori/domain';
import { Button, Dialog } from '@daynori/ui-web';
import { useTourOptional } from '../tours/TourContext';
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
  const tour = useTourOptional();
  const [isOpen, setIsOpen] = useState(false);
  const sourceEditor = useRef<Element | null>(null);
  const pathname = usePathname();
  const { user, workspaceId } = useAuth();
  const { themeMode } = useShell();
  const palette = colors[themeMode];
  const article = findHelpArticle(articleId);
  useEffect(() => {
    setIsOpen(false);
    sourceEditor.current = null;
  }, [user?.id, workspaceId]);

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
    const report = tour?.captureEvidence();
    sourceEditor.current = document.querySelector(
      '[data-testid="note-editor"], [data-testid="journal-editor"]'
    );
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
    // Keep the actual editor mounted: routing away can cancel a debounced draft write.
    setIsOpen(true);
    requestAnimationFrame(() => {
      if (document.querySelector(`[data-help-article="${articleId}"]`)) {
        void report?.({ type: 'help_article_opened', articleId });
      }
    });
  };

  const close = () => {
    const report = tour?.captureEvidence();
    const editor = sourceEditor.current;
    setIsOpen(false);
    requestAnimationFrame(() => {
      if (editor?.isConnected)
        void report?.({
          type: 'help_return_to_editor',
          recordLoaded: true,
          entityId: editor.id || undefined,
          draftPreserved: true,
        });
    });
  };

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={open}
        data-tour-target="help.article.open"
        aria-label={`Open Help: ${articleTitle(article)}`}
        style={{
          minHeight: touchTargets.webMin,
          minWidth: touchTargets.webMin,
          padding: '4px 10px',
          borderRadius: 8,
          border: `1px solid ${palette.border.subtle}`,
          background: palette.surface,
          color: palette.action.primary,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
      <Dialog isOpen={isOpen} onClose={close} title={articleTitle(article)} themeMode={themeMode}>
        <div data-help-article={articleId}>
          <p>{resolveHelpText(article.summary)}</p>
          <ol>
            {article.steps.map((step) => (
              <li key={step.instruction.key}>{resolveHelpText(step.instruction)}</li>
            ))}
          </ol>
          <p>{resolveHelpText(article.expectedResult)}</p>
          <Button onClick={close} data-tour-target="help.return.editor" themeMode={themeMode}>
            Back to editor
          </Button>
        </div>
      </Dialog>
    </>
  );
}
