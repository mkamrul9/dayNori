'use client';

import React from 'react';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import { Button, Card, Feedback } from '@daynori/ui-web';
import { useShell } from '../../components/ShellContext';

export default function SettingsPage() {
  const {
    themeMode,
    setTheme,
    textScale,
    setTextScale,
    direction,
    setDirection,
    language,
    setLanguage,
  } = useShell();

  const palette = colors[themeMode];

  return (
    <div
      style={{
        maxWidth: '860px',
        margin: '0 auto',
        padding: `${spacing.lg}px ${spacing.base}px`,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ marginBottom: `${spacing.base}px` }}>
        <h1
          style={{
            margin: 0,
            fontSize: `${typography.webScale.welcomeTitle}px`,
            fontWeight: 800,
            color: palette.text.primary,
          }}
        >
          Settings
        </h1>
        <p style={{ margin: '4px 0 0 0', color: palette.text.secondary }}>
          Personalize appearance, accessibility preferences, typography, and workspace defaults.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
        {/* 1. Theme Mode */}
        <Card themeMode={themeMode}>
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Color Theme
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
            Select warm paper light mode or deep ink dark mode. Both meet WCAG 2.2 contrast
            standards.
          </p>

          <div
            role="radiogroup"
            aria-label="Color theme selection"
            style={{ display: 'flex', gap: `${spacing.sm}px` }}
          >
            <Button
              variant={themeMode === 'light' ? 'primary' : 'secondary'}
              size="compact"
              themeMode={themeMode}
              onClick={() => setTheme('light')}
              id="set-theme-light"
            >
              ☀️ Warm Paper (Light)
            </Button>
            <Button
              variant={themeMode === 'dark' ? 'primary' : 'secondary'}
              size="compact"
              themeMode={themeMode}
              onClick={() => setTheme('dark')}
              id="set-theme-dark"
            >
              🌙 Deep Ink (Dark)
            </Button>
          </div>
        </Card>

        {/* 2. Text Scaling & Reflow (WCAG 2.2 200% Zoom) */}
        <Card themeMode={themeMode}>
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Text Scaling & Reflow
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
            Adjust base font scaling to test reflow at up to 200% text size without horizontal
            clipping.
          </p>

          <div
            role="group"
            aria-label="Text scale options"
            style={{ display: 'flex', gap: `${spacing.xs}px`, flexWrap: 'wrap' }}
          >
            {[100, 125, 150, 175, 200].map((scale) => (
              <button
                key={scale}
                type="button"
                id={`scale-${scale}`}
                aria-pressed={textScale === scale}
                onClick={() => setTextScale(scale)}
                style={{
                  padding: '6px 14px',
                  borderRadius: `${radii.sm}px`,
                  border: `1.5px solid ${
                    textScale === scale ? palette.action.primary : palette.border.subtle
                  }`,
                  backgroundColor: textScale === scale ? palette.surfaceRaised : palette.surface,
                  color: textScale === scale ? palette.action.primary : palette.text.primary,
                  fontWeight: textScale === scale ? 700 : 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                  minHeight: `${touchTargets.webMin}px`,
                  minWidth: `${touchTargets.webMin}px`,
                }}
              >
                {scale}%
              </button>
            ))}
          </div>
        </Card>

        {/* 3. Reading Direction (RTL / LTR) */}
        <Card themeMode={themeMode}>
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Reading Direction (RTL Readiness)
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
            Verify that navigation, drawers, list rows, and layout components mirror properly in
            Right-to-Left mode.
          </p>

          <div style={{ display: 'flex', gap: `${spacing.sm}px` }}>
            <Button
              variant={direction === 'ltr' ? 'primary' : 'secondary'}
              size="compact"
              themeMode={themeMode}
              onClick={() => setDirection('ltr')}
              id="direction-ltr-btn"
            >
              Left-to-Right (LTR)
            </Button>
            <Button
              variant={direction === 'rtl' ? 'primary' : 'secondary'}
              size="compact"
              themeMode={themeMode}
              onClick={() => setDirection('rtl')}
              id="direction-rtl-btn"
            >
              Right-to-Left (RTL)
            </Button>
          </div>
        </Card>

        {/* 4. Language & Bangla Typography Readability */}
        <Card themeMode={themeMode}>
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Language & Bangla (বাংলা) Readability
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
            Daynori supports extended line-height (1.6) and conjunct rendering for clear Bangla
            script readability.
          </p>

          <div
            style={{ display: 'flex', gap: `${spacing.sm}px`, marginBottom: `${spacing.base}px` }}
          >
            <Button
              variant={language === 'en' ? 'primary' : 'secondary'}
              size="compact"
              themeMode={themeMode}
              onClick={() => setLanguage('en')}
              id="lang-en-btn"
            >
              English
            </Button>
            <Button
              variant={language === 'bn' ? 'primary' : 'secondary'}
              size="compact"
              themeMode={themeMode}
              onClick={() => setLanguage('bn')}
              id="lang-bn-btn"
            >
              বাংলা (Bangla)
            </Button>
          </div>

          {/* Bangla Typography Verification Card */}
          <div
            style={{
              padding: `${spacing.base}px`,
              borderRadius: `${radii.sm}px`,
              backgroundColor: palette.surfaceRaised,
              border: `1px solid ${palette.border.subtle}`,
              lineHeight: typography.lineHeight.bangla,
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: palette.text.secondary,
                marginBottom: '6px',
              }}
            >
              Bangla Script Rendering Verification:
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: palette.text.primary,
                marginBottom: '4px',
              }}
            >
              আজকের দিনটি গুছিয়ে নিন — দিনপঞ্জি, রুটিন এবং দৈনন্দিন কাজ
            </div>
            <div style={{ fontSize: '14px', color: palette.text.secondary }}>
              যুক্তাক্ষর, স্বরচিহ্ন এবং মাত্রা সঠিকভাবে প্রদর্শিত হচ্ছে। লাইন-হাইট ১.৬ অক্ষরের
              ওভারল্যাপ প্রতিরোধ করে।
            </div>
          </div>
        </Card>

        {/* 5. Storage & Privacy Architecture */}
        <Card themeMode={themeMode}>
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Storage & Security Notice
          </h2>
          <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: palette.text.secondary }}>
            Daynori is designed offline-first. Your private reflections, tasks, and notes reside
            locally.
          </p>
          <Feedback
            severity="info"
            message="No credentials or remote sync are required for Phase 05 navigation shell. Encrypted vault records will follow Phase 44."
            themeMode={themeMode}
          />
        </Card>
      </div>
    </div>
  );
}
