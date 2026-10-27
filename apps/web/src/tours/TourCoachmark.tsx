'use client';

import React, { useEffect, useState } from 'react';
import { colors, radii, spacing, typography } from '@daynori/design-tokens';
import { Button } from '@daynori/ui-web';
import {
  getStepDefinition,
  getTourChapterDefinition,
} from '@daynori/domain';
import { useShell } from '../components/ShellContext';
import { useTour } from './TourContext';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Non-trapping coachmark: highlights the semantic target and keeps tour controls reachable.
 * Does not intercept pointer events on the target (overlay uses pointer-events: none on dim).
 */
export function TourCoachmark() {
  const { themeMode } = useShell();
  const palette = colors[themeMode];
  const tour = useTour();
  const { activeChapter, activeChapterId, applyControl, missingTarget, getTargetElement } = tour;
  const [rect, setRect] = useState<Rect | null>(null);
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const def = activeChapterId ? getTourChapterDefinition(activeChapterId) : undefined;
  const step =
    def && activeChapter?.currentStepId
      ? getStepDefinition(def, activeChapter.currentStepId)
      : null;

  useEffect(() => {
    if (!step?.targetId || activeChapter?.lifecycle !== 'active') {
      setRect(null);
      return;
    }
    const update = () => {
      const el = getTargetElement(step.targetId!);
      if (!el || !el.isConnected) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) {
        setRect(null);
        return;
      }
      setRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      });
      // Keep target in view without stealing focus traps.
      if (r.top < 80 || r.bottom > window.innerHeight - 120) {
        el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const id = window.setInterval(update, 500);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.clearInterval(id);
    };
  }, [step?.targetId, activeChapter?.lifecycle, activeChapter?.currentStepId, getTargetElement, reduceMotion]);

  if (!activeChapter || !def || !step) return null;
  if (activeChapter.lifecycle !== 'active' && activeChapter.lifecycle !== 'paused') return null;

  const stepIndex = def.steps.findIndex((s) => s.id === step.id);
  const panelBottom = 16;
  const highlight = rect && !missingTarget ? rect : null;

  return (
    <>
      {highlight ? (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: highlight.top - 4,
            left: highlight.left - 4,
            width: highlight.width + 8,
            height: highlight.height + 8,
            borderRadius: radii.md,
            border: `2px solid ${palette.action.primary}`,
            boxShadow: `0 0 0 9999px rgba(0,0,0,0.28)`,
            pointerEvents: 'none',
            zIndex: 9400,
            transition: reduceMotion ? undefined : 'top 120ms ease, left 120ms ease',
          }}
        />
      ) : null}

      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-coachmark-title"
        aria-describedby="tour-coachmark-instruction"
        style={{
          position: 'fixed',
          left: spacing.base,
          right: spacing.base,
          bottom: panelBottom,
          zIndex: 9500,
          maxWidth: 480,
          margin: '0 auto',
          backgroundColor: palette.surface,
          color: palette.text.primary,
          border: `1px solid ${palette.border.strong}`,
          borderRadius: radii.lg,
          padding: spacing.base,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        }}
      >
        <p
          id="tour-coachmark-title"
          style={{
            margin: 0,
            fontSize: typography.webScale.sectionHeading,
            fontWeight: 600,
          }}
        >
          {def.title.defaultText}
          <span style={{ fontWeight: 400, color: palette.text.secondary }}>
            {' '}
            · {stepIndex + 1}/{def.steps.length}
          </span>
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600 }}>{step.title.defaultText}</p>
        <p
          id="tour-coachmark-instruction"
          style={{ margin: '6px 0 0', fontSize: 13, color: palette.text.secondary, lineHeight: 1.4 }}
        >
          {step.instruction.defaultText}
        </p>
        {missingTarget || activeChapter.lifecycle === 'paused' ? (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: palette.text.secondary }}>
            {activeChapter.lifecycle === 'paused'
              ? 'Paused. Progress is saved. Resume when ready.'
              : step.recovery.defaultText}
          </p>
        ) : null}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginTop: spacing.sm,
          }}
        >
          {activeChapter.lifecycle === 'paused' ? (
            <Button
              variant="primary"
              size="compact"
              themeMode={themeMode}
              onClick={() => void applyControl('resume')}
            >
              Resume
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                size="compact"
                themeMode={themeMode}
                onClick={() => void applyControl('back')}
              >
                Back
              </Button>
              {step.allowInformationalNext ? (
                <Button
                  variant="primary"
                  size="compact"
                  themeMode={themeMode}
                  onClick={() => void applyControl('next')}
                >
                  Next
                </Button>
              ) : null}
              {step.allowSkip ? (
                <Button
                  variant="subtle"
                  size="compact"
                  themeMode={themeMode}
                  onClick={() => void applyControl('skip_step')}
                >
                  Skip step
                </Button>
              ) : null}
              <Button
                variant="subtle"
                size="compact"
                themeMode={themeMode}
                onClick={() => void applyControl('pause')}
              >
                Pause
              </Button>
            </>
          )}
          <Button
            variant="subtle"
            size="compact"
            themeMode={themeMode}
            onClick={() => void applyControl('skip_chapter')}
          >
            Skip chapter
          </Button>
          <Button
            variant="subtle"
            size="compact"
            themeMode={themeMode}
            onClick={() => void applyControl('restart_chapter')}
          >
            Restart chapter
          </Button>
          <Button
            variant="secondary"
            size="compact"
            themeMode={themeMode}
            onClick={() => void applyControl('exit')}
          >
            Exit
          </Button>
        </div>
      </div>
    </>
  );
}
