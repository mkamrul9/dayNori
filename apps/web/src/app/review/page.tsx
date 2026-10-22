'use client';

import { Icon } from '@daynori/ui-web';
import React, { useState } from 'react';
import { colors, spacing, touchTargets, typography, type ThemeMode } from '@daynori/design-tokens';
import {
  Button,
  Card,
  Dialog,
  Feedback,
  ListRow,
  TextField,
  type FeedbackSeverity,
} from '@daynori/ui-web';

export default function ComponentReviewPage() {
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');
  const [textScale, setTextScale] = useState<number>(100);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [selectedRow, setSelectedRow] = useState<string>('task-1');
  const [fieldValue, setFieldValue] = useState<string>('');
  const [showError, setShowError] = useState<boolean>(false);
  const [feedbackList, setFeedbackList] = useState<FeedbackSeverity[]>([
    'info',
    'success',
    'warning',
    'danger',
  ]);

  const palette = colors[themeMode];

  const handleDismissFeedback = (sev: FeedbackSeverity) => {
    setFeedbackList((prev) => prev.filter((s) => s !== sev));
  };

  return (
    <div
      dir={direction}
      style={{
        backgroundColor: palette.background,
        color: palette.text.primary,
        minHeight: '100vh',
        fontSize: `${(16 * textScale) / 100}px`,
        transition: 'background-color 200ms ease, color 200ms ease',
        boxSizing: 'border-box',
      }}
    >
      <div
        id="review-gallery-content"
        style={
          {
            maxWidth: '880px',
            margin: '0 auto',
            padding: `${spacing.xl}px ${spacing.base}px`,
            '--daynori-text-scale': textScale / 100,
          } as React.CSSProperties
        }
      >
        <nav aria-label="Breadcrumbs" style={{ marginBottom: `${spacing.md}px` }}>
          <a
            href="/today"
            style={{
              color: palette.action.primary,
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: '44px',
            }}
          >
            <Icon name="arrow-left" /> Return to Organizer Shell
          </a>
        </nav>
        {/* Header and Controls */}
        <header
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: `${spacing.base}px`,
            marginBottom: `${spacing.lg}px`,
            borderBottom: `1px solid ${palette.border.subtle}`,
            paddingBottom: `${spacing.base}px`,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: `${(28 * textScale) / 100}px`,
                fontWeight: 700,
                margin: 0,
                color: palette.text.primary,
              }}
            >
              Daynori Component Review Surface
            </h1>
            <p
              style={{
                fontSize: `${(15 * textScale) / 100}px`,
                color: palette.text.secondary,
                margin: `${spacing.xs}px 0 0 0`,
                lineHeight: typography.lineHeight.relaxed,
              }}
            >
              Phase 04 — Semantic design tokens & accessible browser primitives verification.
            </p>
          </div>

          {/* Interactive Mode Controls */}
          <div
            role="toolbar"
            aria-label="Display and accessibility settings"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: `${spacing.sm}px`,
              alignItems: 'center',
            }}
          >
            <Button
              id="toggle-theme"
              variant="secondary"
              size="compact"
              themeMode={themeMode}
              onClick={() => setThemeMode((m) => (m === 'light' ? 'dark' : 'light'))}
              aria-label={`Switch to ${themeMode === 'light' ? 'dark' : 'light'} theme`}
            >
              Theme: {themeMode === 'light' ? (<><Icon name='sun' /> {'Light'}</>) : (<><Icon name='moon' /> {'Dark'}</>)}
            </Button>

            <Button
              id="toggle-dir"
              variant="secondary"
              size="compact"
              themeMode={themeMode}
              onClick={() => setDirection((d) => (d === 'ltr' ? 'rtl' : 'ltr'))}
              aria-label={`Switch text direction to ${direction === 'ltr' ? 'right-to-left' : 'left-to-right'}`}
            >
              Direction: {direction.toUpperCase()}
            </Button>

            <Button
              id="toggle-scale"
              variant="secondary"
              size="compact"
              themeMode={themeMode}
              onClick={() =>
                setTextScale((s) => (s === 100 ? 125 : s === 125 ? 150 : s === 150 ? 200 : 100))
              }
              aria-label={`Current text scale ${textScale} percent. Click to change.`}
            >
              Scale: {textScale}%
            </Button>
          </div>
        </header>

        {/* Section 1: Buttons and Interactive States */}
        <section aria-labelledby="heading-buttons" style={{ marginBottom: `${spacing.xl}px` }}>
          <h2
            id="heading-buttons"
            style={{
              fontSize: `${(20 * textScale) / 100}px`,
              fontWeight: 600,
              color: palette.text.primary,
              marginBottom: `${spacing.sm}px`,
            }}
          >
            1. Buttons & Interaction States
          </h2>
          <p
            style={{
              fontSize: `${(14 * textScale) / 100}px`,
              color: palette.text.secondary,
              marginTop: 0,
              marginBottom: `${spacing.base}px`,
            }}
          >
            Touch targets meet minimum {touchTargets.webMin}px. Operable with Space and Enter keys.
          </p>

          <Card themeMode={themeMode}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: `${spacing.base}px`,
                alignItems: 'center',
              }}
            >
              <Button id="btn-primary" variant="primary" themeMode={themeMode}>
                Primary Action
              </Button>
              <Button id="btn-secondary" variant="secondary" themeMode={themeMode}>
                Secondary Action
              </Button>
              <Button id="btn-subtle" variant="subtle" themeMode={themeMode}>
                Subtle Action
              </Button>
              <Button id="btn-danger" variant="danger" themeMode={themeMode}>
                Danger Action
              </Button>
              <Button id="btn-loading" variant="primary" loading={true} themeMode={themeMode}>
                Saving...
              </Button>
              <Button id="btn-disabled" variant="secondary" disabled={true} themeMode={themeMode}>
                Disabled
              </Button>
              <Button id="btn-compact" variant="primary" size="compact" themeMode={themeMode}>
                Compact (36px)
              </Button>
            </div>
          </Card>
        </section>

        {/* Section 2: Form Input & Validation States */}
        <section aria-labelledby="heading-inputs" style={{ marginBottom: `${spacing.xl}px` }}>
          <h2
            id="heading-inputs"
            style={{
              fontSize: `${(20 * textScale) / 100}px`,
              fontWeight: 600,
              color: palette.text.primary,
              marginBottom: `${spacing.sm}px`,
            }}
          >
            2. Form Inputs, Helper Text & Error Announcements
          </h2>
          <p
            style={{
              fontSize: `${(14 * textScale) / 100}px`,
              color: palette.text.secondary,
              marginTop: 0,
              marginBottom: `${spacing.base}px`,
            }}
          >
            Inputs maintain essential boundary contrast &gt;= 3.0:1 and connect helper/error
            messages via aria-describedby.
          </p>

          <Card themeMode={themeMode}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))',
                gap: `${spacing.base}px`,
              }}
            >
              <TextField
                id="input-title"
                label="Workspace Name"
                placeholder="e.g., Personal Notes"
                helperText="Familiar label for your primary daily workspace."
                themeMode={themeMode}
                required
                value={fieldValue}
                onChange={(e) => setFieldValue(e.target.value)}
              />

              <TextField
                id="input-error"
                label="Daily Goal"
                placeholder="e.g., Complete writing"
                errorMessage={
                  showError ? 'A daily goal description is required before saving.' : undefined
                }
                helperText={!showError ? 'Optional focus intention for today.' : undefined}
                themeMode={themeMode}
                defaultValue="Reflect on week"
              />

              <TextField
                id="input-disabled"
                label="Account ID (Read-only)"
                value="usr_daynori_01948a"
                disabled
                helperText="Permanent identifier assigned during workspace creation."
                themeMode={themeMode}
              />
            </div>

            <div style={{ marginTop: `${spacing.base}px` }}>
              <Button
                id="btn-toggle-error"
                variant="subtle"
                size="compact"
                themeMode={themeMode}
                onClick={() => setShowError((prev) => !prev)}
              >
                {showError ? 'Clear Form Error' : 'Trigger Validation Error State'}
              </Button>
            </div>
          </Card>
        </section>

        {/* Section 3: List Rows and Navigation */}
        <section aria-labelledby="heading-lists" style={{ marginBottom: `${spacing.xl}px` }}>
          <h2
            id="heading-lists"
            style={{
              fontSize: `${(20 * textScale) / 100}px`,
              fontWeight: 600,
              color: palette.text.primary,
              marginBottom: `${spacing.sm}px`,
            }}
          >
            3. Interactive List Rows & Touch Targets
          </h2>
          <p
            style={{
              fontSize: `${(14 * textScale) / 100}px`,
              color: palette.text.secondary,
              marginTop: 0,
              marginBottom: `${spacing.base}px`,
            }}
          >
            List rows support keyboard selection (Enter/Space), active states, and meta badges.
          </p>

          <Card themeMode={themeMode}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
              <ListRow
                title="Review Phase 04 design token contrast"
                subtitle="Ensure WCAG 2.2 AA compliant ratios in light and dark modes"
                meta="Today"
                selected={selectedRow === 'task-1'}
                onClick={() => setSelectedRow('task-1')}
                themeMode={themeMode}
                leading={
                  <span aria-hidden="true">
                    <Icon name="check" />
                  </span>
                }
              />

              <ListRow
                title="Bangla script typography and line-height test"
                subtitle="Verify conjuncts and matra spacing at 1.6 line-height"
                meta="In Progress"
                selected={selectedRow === 'task-2'}
                onClick={() => setSelectedRow('task-2')}
                themeMode={themeMode}
                leading={
                  <span aria-hidden="true">
                    <Icon name="note" />
                  </span>
                }
              />

              <ListRow
                title="Archived routine: Morning walk"
                subtitle="Disabled item demonstrates muted contrast and inactive state"
                meta="Archived"
                disabled
                themeMode={themeMode}
                leading={
                  <span aria-hidden="true">
                    <Icon name="folder" />
                  </span>
                }
              />
            </div>
          </Card>
        </section>

        {/* Section 4: Feedback Banners */}
        <section aria-labelledby="heading-feedback" style={{ marginBottom: `${spacing.xl}px` }}>
          <h2
            id="heading-feedback"
            style={{
              fontSize: `${(20 * textScale) / 100}px`,
              fontWeight: 600,
              color: palette.text.primary,
              marginBottom: `${spacing.sm}px`,
            }}
          >
            4. Accessible Feedback & Notification Primitives
          </h2>
          <p
            style={{
              fontSize: `${(14 * textScale) / 100}px`,
              color: palette.text.secondary,
              marginTop: 0,
              marginBottom: `${spacing.base}px`,
            }}
          >
            Status always pairs semantic colors with text labels and recognizable icons.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
            {feedbackList.includes('info') && (
              <Feedback
                severity="info"
                title="Sync Status"
                message="Local workspace is up to date. Offline changes will automatically sync when connected."
                themeMode={themeMode}
                onDismiss={() => handleDismissFeedback('info')}
              />
            )}
            {feedbackList.includes('success') && (
              <Feedback
                severity="success"
                title="Journal Saved"
                message="Your entry has been saved to local storage with revision receipt #142."
                themeMode={themeMode}
                onDismiss={() => handleDismissFeedback('success')}
              />
            )}
            {feedbackList.includes('warning') && (
              <Feedback
                severity="warning"
                title="Storage Advisory"
                message="IndexedDB usage is approaching 80% of local quota. Review attachment sizes."
                themeMode={themeMode}
                onDismiss={() => handleDismissFeedback('warning')}
              />
            )}
            {feedbackList.includes('danger') && (
              <Feedback
                severity="danger"
                title="Connection Error"
                message="Server unreachable. Offline drafts and mutation receipts are preserved locally."
                themeMode={themeMode}
                onDismiss={() => handleDismissFeedback('danger')}
              />
            )}
            {feedbackList.length === 0 && (
              <Button
                variant="subtle"
                size="compact"
                themeMode={themeMode}
                onClick={() => setFeedbackList(['info', 'success', 'warning', 'danger'])}
              >
                Reset Feedback Banners
              </Button>
            )}
          </div>
        </section>

        {/* Section 5: Modal Dialog with Focus Trap */}
        <section aria-labelledby="heading-dialog" style={{ marginBottom: `${spacing.xl}px` }}>
          <h2
            id="heading-dialog"
            style={{
              fontSize: `${(20 * textScale) / 100}px`,
              fontWeight: 600,
              color: palette.text.primary,
              marginBottom: `${spacing.sm}px`,
            }}
          >
            5. Accessible Dialog & Focus Management
          </h2>
          <p
            style={{
              fontSize: `${(14 * textScale) / 100}px`,
              color: palette.text.secondary,
              marginTop: 0,
              marginBottom: `${spacing.base}px`,
            }}
          >
            Traps Tab focus inside dialog, closes on Escape, and returns focus to opener button upon
            close.
          </p>

          <Card themeMode={themeMode}>
            <Button
              id="btn-open-dialog"
              variant="primary"
              themeMode={themeMode}
              onClick={() => setIsDialogOpen(true)}
            >
              Open Accessible Dialog
            </Button>

            <Dialog
              isOpen={isDialogOpen}
              onClose={() => setIsDialogOpen(false)}
              title="Confirm Workspace Archive"
              description="This action moves the current workspace to read-only archive mode. Offline records remain accessible."
              themeMode={themeMode}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    lineHeight: 1.5,
                    color: palette.text.secondary,
                  }}
                >
                  Are you sure you want to proceed? You can restore an archived workspace anytime
                  from settings.
                </p>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: `${spacing.sm}px`,
                    marginTop: `${spacing.sm}px`,
                  }}
                >
                  <Button
                    id="btn-dialog-cancel"
                    variant="secondary"
                    themeMode={themeMode}
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    id="btn-dialog-confirm"
                    variant="danger"
                    themeMode={themeMode}
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Archive Workspace
                  </Button>
                </div>
              </div>
            </Dialog>
          </Card>
        </section>

        {/* Section 6: Bangla Script Readability & Multilingual Typography */}
        <section aria-labelledby="heading-bangla" style={{ marginBottom: `${spacing.xl}px` }}>
          <h2
            id="heading-bangla"
            style={{
              fontSize: `${(20 * textScale) / 100}px`,
              fontWeight: 600,
              color: palette.text.primary,
              marginBottom: `${spacing.sm}px`,
            }}
          >
            6. Bangla Script Readability & Reflow Verification
          </h2>
          <p
            style={{
              fontSize: `${(14 * textScale) / 100}px`,
              color: palette.text.secondary,
              marginTop: 0,
              marginBottom: `${spacing.base}px`,
            }}
          >
            Tested with typography.lineHeight.bangla ({typography.lineHeight.bangla}) to avoid
            diacritic/matra clipping.
          </p>

          <Card themeMode={themeMode}>
            <div
              style={{
                lineHeight: typography.lineHeight.bangla,
                fontSize: `${(16 * textScale) / 100}px`,
                color: palette.text.primary,
              }}
            >
              <p style={{ fontWeight: 600, margin: `0 0 ${spacing.sm}px 0` }}>
                আপনার দিন, একত্রিত। একটি শান্ত ও নির্ভরযোগ্য নোটবুক।
              </p>
              <p style={{ color: palette.text.secondary, margin: 0 }}>
                নোট, রুটিন, কাজ এবং ব্যক্তিগত জার্নাল লেখার একটি সহজ মাধ্যম। জটিল যুক্তাক্ষর (যেমন:
                ক্ষ, জ্ঞ, ঞ্চ, ম্প, ত্র) এবং উপর-নিচের কারচিহ্ন (হ্রস্ব-ইকার, দীর্ঘ-ঈকার,
                হ্রস্ব-উকার) যেন কোনোভাবে কেটে না যায়, তা এই বিশেষ লাইনের উচ্চতা দ্বারা নিশ্চিত করা
                হয়েছে।
              </p>
            </div>
          </Card>
        </section>

        {/* Section 7: Contrast AA Verification Summary */}
        <section aria-labelledby="heading-contrast" style={{ marginBottom: `${spacing.xl}px` }}>
          <h2
            id="heading-contrast"
            style={{
              fontSize: `${(20 * textScale) / 100}px`,
              fontWeight: 600,
              color: palette.text.primary,
              marginBottom: `${spacing.sm}px`,
            }}
          >
            7. WCAG 2.2 Level AA Contrast Audit Summary
          </h2>

          <Card themeMode={themeMode}>
            <div
              role="region"
              aria-label="WCAG 2.2 Level AA Contrast Audit Summary"
              tabIndex={0}
              style={{
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                width: '100%',
              }}
            >
              <table
                style={{
                  width: '100%',
                  minWidth: '540px',
                  borderCollapse: 'collapse',
                  fontSize: '14px',
                  textAlign: direction === 'rtl' ? 'right' : 'left',
                }}
              >
                <thead>
                  <tr style={{ borderBottom: `2px solid ${palette.border.strong}` }}>
                    <th style={{ padding: `${spacing.sm}px` }}>Element Pair</th>
                    <th style={{ padding: `${spacing.sm}px` }}>Color Tokens</th>
                    <th style={{ padding: `${spacing.sm}px` }}>Calculated Ratio</th>
                    <th style={{ padding: `${spacing.sm}px` }}>Target</th>
                    <th style={{ padding: `${spacing.sm}px` }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: `1px solid ${palette.border.subtle}` }}>
                    <td style={{ padding: `${spacing.sm}px` }}>Ink text on Warm Paper (Light)</td>
                    <td style={{ padding: `${spacing.sm}px` }}>#172C2C / #F7F5EF</td>
                    <td style={{ padding: `${spacing.sm}px`, fontWeight: 600 }}>13.44:1</td>
                    <td style={{ padding: `${spacing.sm}px` }}>&ge; 4.5:1</td>
                    <td style={{ padding: `${spacing.sm}px`, color: palette.status.success }}>
                      PASS AA
                    </td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${palette.border.subtle}` }}>
                    <td style={{ padding: `${spacing.sm}px` }}>Secondary Slate on Paper (Light)</td>
                    <td style={{ padding: `${spacing.sm}px` }}>#526363 / #F7F5EF</td>
                    <td style={{ padding: `${spacing.sm}px`, fontWeight: 600 }}>5.80:1</td>
                    <td style={{ padding: `${spacing.sm}px` }}>&ge; 4.5:1</td>
                    <td style={{ padding: `${spacing.sm}px`, color: palette.status.success }}>
                      PASS AA
                    </td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${palette.border.subtle}` }}>
                    <td style={{ padding: `${spacing.sm}px` }}>
                      White label on Primary Teal (Light)
                    </td>
                    <td style={{ padding: `${spacing.sm}px` }}>#FFFFFF / #146B63</td>
                    <td style={{ padding: `${spacing.sm}px`, fontWeight: 600 }}>6.34:1</td>
                    <td style={{ padding: `${spacing.sm}px` }}>&ge; 4.5:1</td>
                    <td style={{ padding: `${spacing.sm}px`, color: palette.status.success }}>
                      PASS AA
                    </td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${palette.border.subtle}` }}>
                    <td style={{ padding: `${spacing.sm}px` }}>
                      White label on Danger Action (Light)
                    </td>
                    <td style={{ padding: `${spacing.sm}px` }}>#FFFFFF / #B3261E</td>
                    <td style={{ padding: `${spacing.sm}px`, fontWeight: 600 }}>6.55:1</td>
                    <td style={{ padding: `${spacing.sm}px` }}>&ge; 4.5:1</td>
                    <td style={{ padding: `${spacing.sm}px`, color: palette.status.success }}>
                      PASS AA
                    </td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${palette.border.subtle}` }}>
                    <td style={{ padding: `${spacing.sm}px` }}>Selected Row Metadata (Light)</td>
                    <td style={{ padding: `${spacing.sm}px` }}>#526363 / #E4EFEA</td>
                    <td style={{ padding: `${spacing.sm}px`, fontWeight: 600 }}>5.30:1</td>
                    <td style={{ padding: `${spacing.sm}px` }}>&ge; 4.5:1</td>
                    <td style={{ padding: `${spacing.sm}px`, color: palette.status.success }}>
                      PASS AA
                    </td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${palette.border.subtle}` }}>
                    <td style={{ padding: `${spacing.sm}px` }}>
                      Dark primary text on Dark Surface
                    </td>
                    <td style={{ padding: `${spacing.sm}px` }}>#E9F0ED / #132323</td>
                    <td style={{ padding: `${spacing.sm}px`, fontWeight: 600 }}>14.05:1</td>
                    <td style={{ padding: `${spacing.sm}px` }}>&ge; 4.5:1</td>
                    <td style={{ padding: `${spacing.sm}px`, color: palette.status.success }}>
                      PASS AA
                    </td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${palette.border.subtle}` }}>
                    <td style={{ padding: `${spacing.sm}px` }}>
                      Dark secondary text on Dark Surface
                    </td>
                    <td style={{ padding: `${spacing.sm}px` }}>#AEC0BB / #132323</td>
                    <td style={{ padding: `${spacing.sm}px`, fontWeight: 600 }}>8.56:1</td>
                    <td style={{ padding: `${spacing.sm}px` }}>&ge; 4.5:1</td>
                    <td style={{ padding: `${spacing.sm}px`, color: palette.status.success }}>
                      PASS AA
                    </td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${palette.border.subtle}` }}>
                    <td style={{ padding: `${spacing.sm}px` }}>
                      Dark Ink label on Danger Action (Dark)
                    </td>
                    <td style={{ padding: `${spacing.sm}px` }}>#381615 / #F2B8B5</td>
                    <td style={{ padding: `${spacing.sm}px`, fontWeight: 600 }}>9.58:1</td>
                    <td style={{ padding: `${spacing.sm}px` }}>&ge; 4.5:1</td>
                    <td style={{ padding: `${spacing.sm}px`, color: palette.status.success }}>
                      PASS AA
                    </td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${palette.border.subtle}` }}>
                    <td style={{ padding: `${spacing.sm}px` }}>Selected Row Metadata (Dark)</td>
                    <td style={{ padding: `${spacing.sm}px` }}>#AEC0BB / #1C312E</td>
                    <td style={{ padding: `${spacing.sm}px`, fontWeight: 600 }}>7.26:1</td>
                    <td style={{ padding: `${spacing.sm}px` }}>&ge; 4.5:1</td>
                    <td style={{ padding: `${spacing.sm}px`, color: palette.status.success }}>
                      PASS AA
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: `${spacing.sm}px` }}>Essential Field Border (Dark)</td>
                    <td style={{ padding: `${spacing.sm}px` }}>#5C7670 / #132323</td>
                    <td style={{ padding: `${spacing.sm}px`, fontWeight: 600 }}>3.31:1</td>
                    <td style={{ padding: `${spacing.sm}px` }}>&ge; 3.0:1</td>
                    <td style={{ padding: `${spacing.sm}px`, color: palette.status.success }}>
                      PASS AA
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
