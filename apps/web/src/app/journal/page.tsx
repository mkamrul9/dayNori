'use client';

import React, { useState } from 'react';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import { Button, Card, Dialog, EmptyState, TextField } from '@daynori/ui-web';
import { useShell } from '../../components/ShellContext';
import { useAuth } from '../../components/AuthContext';

export default function JournalPage() {
  const { themeMode } = useShell();
  const { isAuthenticated, openAuthModal } = useAuth();
  const palette = colors[themeMode];

  const [isWriting, setIsWriting] = useState(false);
  const [entryTitle, setEntryTitle] = useState('');
  const [entryBody, setEntryBody] = useState('');
  const [showPrompt, setShowPrompt] = useState(true);
  const [showEmpty, setShowEmpty] = useState(false);

  const [entries, setEntries] = useState([
    {
      id: 'j1',
      date: 'Wednesday, October 14, 2026',
      title: 'Mid-week engineering progress',
      preview:
        'Completed accessible web primitive verification and responsive navigation shell structure...',
      wordCount: 84,
    },
    {
      id: 'j2',
      date: 'Tuesday, October 13, 2026',
      title: 'Thoughts on keyboard navigation and focus rings',
      preview:
        'Clear focus indicators make the entire web experience feel dependable and trustworthy...',
      wordCount: 142,
    },
    {
      id: 'j3',
      date: 'Sunday, October 11, 2026',
      title: 'Weekly calm review',
      preview:
        'Set the tone for the upcoming sprint with quiet reflection and minimal distractions...',
      wordCount: 110,
    },
  ]);

  const handleSaveEntry = () => {
    if (entryBody.trim() || entryTitle.trim()) {
      setEntries([
        {
          id: `j-${Date.now()}`,
          date: 'Wednesday, October 14, 2026',
          title: entryTitle.trim() || 'Untitled Reflection',
          preview: entryBody.slice(0, 100) + '...',
          wordCount: entryBody.split(/\s+/).filter(Boolean).length,
        },
        ...entries,
      ]);
    }
    setEntryTitle('');
    setEntryBody('');
    setIsWriting(false);
  };

  if (!isAuthenticated) {
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
        <EmptyState
          id="journal-auth-required"
          title="Sign in required to view your Journal"
          description="Your reflection journal contains private records. Sign in or create an account to access your personal timeline."
          actionLabel="Sign In or Create Account"
          onAction={() => openAuthModal('/journal')}
          themeMode={themeMode}
          icon="🔒"
        />
      </div>
    );
  }

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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
          marginBottom: `${spacing.base}px`,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: `${typography.webScale.welcomeTitle}px`,
              fontWeight: 800,
              color: palette.text.primary,
            }}
          >
            Journal
          </h1>
          <p style={{ margin: '4px 0 0 0', color: palette.text.secondary }}>
            A quiet, distraction-free space for daily reflections and personal notes.
          </p>
        </div>

        <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
          <Button
            size="compact"
            variant="secondary"
            themeMode={themeMode}
            onClick={() => setShowEmpty(!showEmpty)}
          >
            {showEmpty ? 'Show Entries' : 'Simulate Empty'}
          </Button>
          <Button
            size="compact"
            variant="primary"
            themeMode={themeMode}
            onClick={() => setIsWriting(true)}
          >
            ✍️ Write Entry
          </Button>
        </div>
      </div>

      {/* Writing Prompt */}
      {showPrompt && !showEmpty && (
        <div style={{ marginBottom: `${spacing.base}px` }}>
          <Card
            themeMode={themeMode}
            style={{
              borderLeft: `4px solid ${palette.accent.warm}`,
              backgroundColor: palette.surfaceRaised,
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: palette.accent.warm,
                    letterSpacing: '0.05em',
                  }}
                >
                  Daily Prompt
                </span>
                <h3
                  style={{
                    margin: '4px 0',
                    fontSize: `${typography.webScale.sectionHeading}px`,
                    color: palette.text.primary,
                  }}
                >
                  What is one intention you want to carry through this week?
                </h3>
                <p style={{ margin: 0, fontSize: '13px', color: palette.text.secondary }}>
                  No mood, title, or streak is compulsory. Write freely when you feel ready.
                </p>
              </div>
              <button
                type="button"
                aria-label="Dismiss prompt"
                onClick={() => setShowPrompt(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: palette.text.secondary,
                  minHeight: `${touchTargets.webMin}px`,
                  minWidth: `${touchTargets.webMin}px`,
                  fontSize: '16px',
                }}
              >
                ✕
              </button>
            </div>
          </Card>
        </div>
      )}

      {showEmpty ? (
        <EmptyState
          id="journal-empty-state"
          title="No journal entries yet"
          description="Your reflection timeline is quiet and clean. Take a moment to write about your day."
          actionLabel="Write First Entry"
          onAction={() => {
            setShowEmpty(false);
            setIsWriting(true);
          }}
          themeMode={themeMode}
          icon="📖"
        />
      ) : (
        /* Timeline of entries */
        <div
          role="feed"
          aria-label="Journal timeline"
          style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}
        >
          {entries.map((entry) => (
            <Card key={entry.id} themeMode={themeMode}>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: palette.action.primary,
                  marginBottom: '4px',
                }}
              >
                {entry.date}
              </div>
              <h2
                style={{
                  margin: '0 0 8px 0',
                  fontSize: `${typography.webScale.sectionHeading}px`,
                  fontWeight: 700,
                  color: palette.text.primary,
                }}
              >
                {entry.title}
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: `${typography.webScale.body}px`,
                  color: palette.text.secondary,
                  lineHeight: typography.lineHeight.relaxed,
                }}
              >
                {entry.preview}
              </p>
              <div
                style={{
                  marginTop: `${spacing.sm}px`,
                  fontSize: '12px',
                  color: palette.text.secondary,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{entry.wordCount} words</span>
                <span style={{ fontSize: '11px', color: palette.text.secondary }}>
                  Private & Encrypted Local Record
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Write Entry Modal / Surface */}
      <Dialog
        isOpen={isWriting}
        onClose={() => setIsWriting(false)}
        title="Write Journal Entry"
        description="A quiet, private writing surface. Your reflections stay on your device."
        themeMode={themeMode}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          <TextField
            id="journal-title-input"
            label="Title (Optional)"
            placeholder="Give your entry a title or leave blank..."
            value={entryTitle}
            onChange={(e) => setEntryTitle(e.target.value)}
            themeMode={themeMode}
            autoFocus
          />

          <div>
            <label
              htmlFor="journal-body-textarea"
              style={{
                display: 'block',
                marginBottom: `${spacing.xs}px`,
                fontSize: `${typography.webScale.supporting}px`,
                fontWeight: 600,
                color: palette.text.primary,
              }}
            >
              Reflection Body
            </label>
            <textarea
              id="journal-body-textarea"
              rows={8}
              placeholder="Write your thoughts freely..."
              value={entryBody}
              onChange={(e) => setEntryBody(e.target.value)}
              style={{
                width: '100%',
                padding: `${spacing.sm}px`,
                borderRadius: `${radii.sm}px`,
                border: `1.5px solid ${palette.border.strong}`,
                backgroundColor: palette.surface,
                color: palette.text.primary,
                fontSize: `${typography.webScale.body}px`,
                lineHeight: typography.lineHeight.relaxed,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: `${spacing.sm}px` }}>
            <Button variant="secondary" themeMode={themeMode} onClick={() => setIsWriting(false)}>
              Cancel
            </Button>
            <Button variant="primary" themeMode={themeMode} onClick={handleSaveEntry}>
              Save Reflection Preview
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
