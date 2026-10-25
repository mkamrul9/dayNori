'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { colors, spacing, touchTargets, typography } from '@daynori/design-tokens';
import { Button, Card, Feedback, Icon, TextField } from '@daynori/ui-web';
import { describeTwoActionPath, type FeatureId } from '@daynori/domain';
import { useShell } from '../../components/ShellContext';
import { useFeatureNavigation } from '../../navigation/useFeatureNavigation';

export default function AllFeaturesPage() {
  const { themeMode } = useShell();
  const palette = colors[themeMode];
  const {
    searchDirectory,
    hideFeature,
    restoreFeature,
    pinFeature,
    unpinFeature,
    personalization,
    saveStatus,
    saveMessage,
  } = useFeatureNavigation();
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchDirectory(query), [searchDirectory, query]);

  return (
    <div className="daynori-page">
      <div style={{ marginBottom: `${spacing.base}px` }}>
        <h1
          className="daynori-break"
          style={{
            margin: 0,
            fontSize: `${typography.webScale.welcomeTitle}px`,
            fontWeight: 800,
            color: palette.text.primary,
          }}
        >
          All features
        </h1>
        <p
          className="daynori-break"
          style={{ margin: '4px 0 0 0', color: palette.text.secondary, fontSize: '14px' }}
        >
          Find every enabled feature. Path: shell → All features → destination (two navigation
          actions). Hiding removes shortcuts only — your content and reminders stay.
        </p>
      </div>

      <Card themeMode={themeMode} style={{ marginBottom: `${spacing.base}px` }}>
        <label htmlFor="all-features-search" style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>
          Search features
        </label>
        <TextField
          id="all-features-search"
          label="Search features"
          themeMode={themeMode}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          aria-label="Search features"
        />
        {saveMessage ? (
          <div style={{ marginTop: 12 }} role="status" aria-live="polite">
            <Feedback
              severity={
                saveStatus === 'error' || saveStatus === 'conflict' ? 'warning' : 'success'
              }
              message={saveMessage}
              themeMode={themeMode}
            />
          </div>
        ) : null}
      </Card>

      {results.length === 0 ? (
        <Card themeMode={themeMode}>
          <p style={{ margin: 0, color: palette.text.secondary }}>
            {query.trim()
              ? 'No features match that search. Try another name or clear the search.'
              : 'No features available in this environment.'}
          </p>
        </Card>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: `${spacing.sm}px`,
          }}
        >
          {results.map(({ feature, eligibility }) => {
            const pinned = personalization.pinnedFeatureIds.includes(feature.id);
            const usable = eligibility.usable;
            return (
              <li key={feature.id}>
                <Card themeMode={themeMode}>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: `${spacing.sm}px`,
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontWeight: 700,
                          color: palette.text.primary,
                        }}
                      >
                        <Icon name={feature.icon} />
                        <span>{feature.label}</span>
                      </div>
                      <p
                        className="daynori-break"
                        style={{ margin: '6px 0 0', fontSize: 13, color: palette.text.secondary }}
                      >
                        {feature.description}
                      </p>
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: palette.text.secondary }}>
                        {eligibility.personallyHidden
                          ? 'Hidden by you — content kept. Restore to show shortcuts again.'
                          : eligibility.statusLabel
                            ? eligibility.statusLabel
                            : describeTwoActionPath(feature.id as FeatureId)}
                      </p>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        alignItems: 'center',
                      }}
                    >
                      {usable ? (
                        <Link href={feature.webPath} style={{ textDecoration: 'none' }}>
                          <Button
                            variant="primary"
                            size="compact"
                            themeMode={themeMode}
                            style={{ minHeight: touchTargets.webMin }}
                          >
                            Open
                          </Button>
                        </Link>
                      ) : null}
                      {eligibility.personallyHidden ? (
                        <Button
                          variant="secondary"
                          size="compact"
                          themeMode={themeMode}
                          onClick={() => void restoreFeature(feature.id)}
                        >
                          Restore
                        </Button>
                      ) : null}
                      {eligibility.canHide && !eligibility.personallyHidden ? (
                        <Button
                          variant="subtle"
                          size="compact"
                          themeMode={themeMode}
                          onClick={() => void hideFeature(feature.id)}
                        >
                          Hide
                        </Button>
                      ) : null}
                      {eligibility.canPin && usable ? (
                        <Button
                          variant="subtle"
                          size="compact"
                          themeMode={themeMode}
                          onClick={() =>
                            void (pinned ? unpinFeature(feature.id) : pinFeature(feature.id))
                          }
                          aria-pressed={pinned}
                        >
                          {pinned ? 'Unpin' : 'Pin'}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
