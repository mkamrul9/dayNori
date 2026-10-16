import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { colors, radii, spacing, typography, type ThemeMode } from '@daynori/design-tokens';
import {
  type NoteDocument,
  isEntryBackdated,
  REFLECTION_TEMPLATES,
  instantiateReflectionTemplate,
  createEmptyNoteDocument,
  type JournalPromptItem,
} from '@daynori/domain';
import { NoteEditor } from './NoteEditor.js';

export type JournalMoodOption = 'great' | 'good' | 'okay' | 'difficult' | 'reflective';

export interface JournalEditorProps {
  id?: string;
  initialTitle?: string | null;
  initialEntryDate?: string;
  initialTimezone?: string;
  initialDocument?: NoteDocument;
  initialPlainText?: string;
  initialMood?: string | null;
  initialPrompts?: JournalPromptItem[];
  initialTags?: string[];
  initialFolderId?: string | null;
  folders?: Array<{ id: string; name: string }>;
  themeMode?: ThemeMode;
  readOnly?: boolean;
  localSaveStatus?: string;
  cloudSyncStatus?: string;
  conflict?: {
    serverRevision: number;
    serverTitle?: string;
    serverDocument?: NoteDocument;
  } | null;
  onDraftChange?: (entry: {
    title: string;
    entryDate: string;
    timezone: string;
    document: NoteDocument;
    plainText: string;
    mood: string | null;
    prompts: JournalPromptItem[];
    tags: string[];
    folderId?: string | null;
  }) => void;
  onSave?: (entry: {
    title: string;
    entryDate: string;
    timezone: string;
    document: NoteDocument;
    plainText: string;
    mood: string | null;
    prompts: JournalPromptItem[];
    tags: string[];
    folderId?: string | null;
  }) => void | Promise<void>;
  onResolveConflict?: (
    resolution: 'keep_server' | 'keep_local' | 'save_copy'
  ) => void | Promise<void>;
  onClose?: () => void;
  onTrash?: () => void;
  autoFocus?: boolean;
}

const AVAILABLE_MOODS: Array<{ value: JournalMoodOption; label: string; emoji: string }> = [
  { value: 'great', label: 'Great', emoji: '😊' },
  { value: 'good', label: 'Good', emoji: '🙂' },
  { value: 'okay', label: 'Okay', emoji: '😐' },
  { value: 'difficult', label: 'Difficult', emoji: '🌧️' },
  { value: 'reflective', label: 'Reflective', emoji: '🌱' },
];

export const JournalEditor: React.FC<JournalEditorProps> = ({
  id,
  initialTitle = '',
  initialEntryDate,
  initialTimezone,
  initialDocument,
  initialPlainText = '',
  initialMood = null,
  initialPrompts = [],
  initialTags = [],
  initialFolderId = null,
  folders = [],
  themeMode = 'light',
  readOnly = false,
  localSaveStatus = 'Saved on this device',
  cloudSyncStatus = 'Synced',
  conflict = null,
  onDraftChange,
  onSave,
  onResolveConflict,
  onClose,
  onTrash,
  autoFocus = false,
}) => {
  const dateInputId = useId();
  const palette = colors[themeMode];

  const defaultDate = useMemo(() => {
    if (initialEntryDate) return initialEntryDate;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [initialEntryDate]);

  const defaultTimezone = useMemo(() => {
    if (initialTimezone) return initialTimezone;
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, [initialTimezone]);

  const [entryDate, setEntryDate] = useState(defaultDate);
  const [timezone] = useState(defaultTimezone);
  const [mood, setMood] = useState<string | null>(initialMood);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [newTagInput, setNewTagInput] = useState('');
  const [prompts, setPrompts] = useState<JournalPromptItem[]>(initialPrompts);
  const [showPromptTray, setShowPromptTray] = useState(initialPrompts.length > 0);

  const isBackdated = useMemo(() => {
    return isEntryBackdated(entryDate, new Date(), timezone);
  }, [entryDate, timezone]);

  const latestNoteRef = useRef<{
    title: string;
    document: NoteDocument;
    plainText: string;
    folderId?: string | null;
  }>({
    title: initialTitle || '',
    document: initialDocument || createEmptyNoteDocument(),
    plainText: initialPlainText || '',
    folderId: initialFolderId,
  });

  const latestOnDraftChangeRef = useRef(onDraftChange);
  latestOnDraftChangeRef.current = onDraftChange;

  const latestOnSaveRef = useRef(onSave);
  latestOnSaveRef.current = onSave;

  const metadataTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (metadataTimerRef.current) {
        clearTimeout(metadataTimerRef.current);
      }
    };
  }, []);

  const scheduleMetadataSave = useCallback(
    (
      newDate: string,
      newMood: string | null,
      newPrompts: JournalPromptItem[],
      newTags: string[]
    ) => {
      const note = latestNoteRef.current;
      latestOnDraftChangeRef.current?.({
        title: note.title,
        entryDate: newDate,
        timezone,
        document: note.document,
        plainText: note.plainText,
        mood: newMood,
        prompts: newPrompts,
        tags: newTags,
        folderId: note.folderId,
      });

      if (readOnly) return;
      if (metadataTimerRef.current) {
        clearTimeout(metadataTimerRef.current);
      }
      metadataTimerRef.current = setTimeout(() => {
        void latestOnSaveRef.current?.({
          title: note.title,
          entryDate: newDate,
          timezone,
          document: note.document,
          plainText: note.plainText,
          mood: newMood,
          prompts: newPrompts,
          tags: newTags,
          folderId: note.folderId,
        });
      }, 600);
    },
    [timezone, readOnly]
  );

  const handleNoteChange = useCallback(
    (noteData: {
      title: string;
      document: NoteDocument;
      plainText: string;
      folderId?: string | null;
    }) => {
      latestNoteRef.current = noteData;
      latestOnDraftChangeRef.current?.({
        title: noteData.title,
        entryDate,
        timezone,
        document: noteData.document,
        plainText: noteData.plainText,
        mood,
        prompts,
        tags,
        folderId: noteData.folderId,
      });
    },
    [entryDate, timezone, mood, prompts, tags]
  );

  const handleDateChange = useCallback(
    (newDate: string) => {
      setEntryDate(newDate);
      scheduleMetadataSave(newDate, mood, prompts, tags);
    },
    [mood, prompts, tags, scheduleMetadataSave]
  );

  const handleMoodSelect = useCallback(
    (selectedMood: string | null) => {
      const nextMood = mood === selectedMood ? null : selectedMood;
      setMood(nextMood);
      scheduleMetadataSave(entryDate, nextMood, prompts, tags);
    },
    [mood, entryDate, prompts, tags, scheduleMetadataSave]
  );

  const handleAddTag = useCallback(() => {
    const trimmed = newTagInput.trim().toLowerCase();
    if (!trimmed) return;
    let nextTags = tags;
    if (!tags.includes(trimmed)) {
      nextTags = [...tags, trimmed];
      setTags(nextTags);
      scheduleMetadataSave(entryDate, mood, prompts, nextTags);
    }
    setNewTagInput('');
  }, [newTagInput, tags, entryDate, mood, prompts, scheduleMetadataSave]);

  const handleRemoveTag = useCallback(
    (tagToRemove: string) => {
      const nextTags = tags.filter((t) => t !== tagToRemove);
      setTags(nextTags);
      scheduleMetadataSave(entryDate, mood, prompts, nextTags);
    },
    [tags, entryDate, mood, prompts, scheduleMetadataSave]
  );

  const handleSelectTemplate = useCallback(
    (templateId: string) => {
      const newPrompts = instantiateReflectionTemplate(templateId);
      setPrompts(newPrompts);
      setShowPromptTray(newPrompts.length > 0);
      scheduleMetadataSave(entryDate, mood, newPrompts, tags);
    },
    [entryDate, mood, tags, scheduleMetadataSave]
  );

  const handlePromptChange = useCallback(
    (idx: number, response: string) => {
      setPrompts((prev) => {
        const updated = [...prev];
        if (updated[idx]) {
          updated[idx] = { ...updated[idx]!, response };
        }
        scheduleMetadataSave(entryDate, mood, updated, tags);
        return updated;
      });
    },
    [entryDate, mood, tags, scheduleMetadataSave]
  );

  const handleRemovePrompt = useCallback(
    (idx: number) => {
      setPrompts((prev) => {
        const updated = prev.filter((_, i) => i !== idx);
        scheduleMetadataSave(entryDate, mood, updated, tags);
        return updated;
      });
    },
    [entryDate, mood, tags, scheduleMetadataSave]
  );

  const handleDismissPrompts = useCallback(() => {
    setPrompts([]);
    setShowPromptTray(false);
    scheduleMetadataSave(entryDate, mood, [], tags);
  }, [entryDate, mood, tags, scheduleMetadataSave]);

  const handleNoteSave = useCallback(
    async (noteData: {
      title: string;
      document: NoteDocument;
      plainText: string;
      folderId?: string | null;
    }) => {
      latestNoteRef.current = noteData;
      if (!onSave) return;
      await onSave({
        title: noteData.title,
        entryDate,
        timezone,
        document: noteData.document,
        plainText: noteData.plainText,
        mood,
        prompts,
        tags,
        folderId: noteData.folderId,
      });
    },
    [onSave, entryDate, timezone, mood, prompts, tags]
  );

  return (
    <div
      role="region"
      aria-label="Journal reflection writing surface"
      data-testid="journal-editor"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: palette.background,
        color: palette.text.primary,
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      {/* Journal Reflection Header Controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${spacing.sm}px ${spacing.base}px`,
          borderBottom: `1px solid ${palette.border.subtle}`,
          backgroundColor: palette.surfaceRaised,
          gap: `${spacing.sm}px`,
        }}
      >
        {/* Date Selector & Backdating Indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.xs}px`,
            flexWrap: 'wrap',
          }}
        >
          <label
            htmlFor={dateInputId}
            style={{
              fontSize: `${typography.webScale.metadata}px`,
              color: palette.text.muted,
              fontWeight: 600,
            }}
          >
            Entry Date:
          </label>
          <input
            id={dateInputId}
            type="date"
            value={entryDate}
            disabled={readOnly}
            onChange={(e) => handleDateChange(e.target.value)}
            data-testid="journal-date-input"
            aria-label="Select journal entry calendar date"
            style={{
              padding: '6px 10px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.strong}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              fontSize: `${typography.webScale.supporting}px`,
              minHeight: '44px',
            }}
          />
          {isBackdated && (
            <span
              data-testid="journal-backdated-badge"
              title="Entry is intentionally backdated relative to current date"
              style={{
                fontSize: `${typography.webScale.metadata}px`,
                padding: '4px 10px',
                borderRadius: `${radii.pill}px`,
                backgroundColor: palette.accent.subtle,
                color: palette.accent.label,
                fontWeight: 600,
                border: `1px solid ${palette.accent.warm}`,
              }}
            >
              🕒 Backdated
            </span>
          )}
          <span
            style={{ fontSize: `${typography.webScale.metadata}px`, color: palette.text.muted }}
          >
            🌐 {timezone}
          </span>
        </div>

        {/* Prompt Tray Toggle Button */}
        <div style={{ display: 'flex', gap: `${spacing.xs}px`, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setShowPromptTray((prev) => !prev)}
            data-testid="journal-toggle-prompts-btn"
            aria-expanded={showPromptTray}
            aria-label={
              showPromptTray ? 'Hide reflection prompt tray' : 'Show reflection prompt tray'
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${showPromptTray ? palette.action.primary : palette.border.subtle}`,
              backgroundColor: showPromptTray ? palette.action.subtle : palette.surface,
              color: showPromptTray ? palette.action.subtleText : palette.text.primary,
              fontSize: `${typography.webScale.supporting}px`,
              fontWeight: 500,
              cursor: 'pointer',
              minHeight: '44px',
            }}
          >
            <span>💡</span>
            <span>{showPromptTray ? 'Hide Prompts' : 'Reflection Prompts'}</span>
          </button>
        </div>
      </div>

      {/* Mood Selector & Tags Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${spacing.xs}px ${spacing.base}px`,
          borderBottom: `1px solid ${palette.border.subtle}`,
          backgroundColor: palette.surface,
          gap: `${spacing.sm}px`,
        }}
      >
        {/* Mood Selector Pills */}
        <div
          role="group"
          aria-label="Non-clinical mood selection"
          data-testid="journal-mood-selector"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}
        >
          <span
            style={{
              fontSize: `${typography.webScale.metadata}px`,
              color: palette.text.muted,
              fontWeight: 600,
            }}
          >
            Mood:
          </span>
          {AVAILABLE_MOODS.map((m) => {
            const isSelected = mood === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => handleMoodSelect(m.value)}
                disabled={readOnly}
                data-testid={`journal-mood-${m.value}`}
                aria-pressed={isSelected}
                aria-label={`Select mood ${m.label}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  borderRadius: `${radii.pill}px`,
                  border: `1px solid ${isSelected ? palette.action.primary : palette.border.subtle}`,
                  backgroundColor: isSelected ? palette.action.primary : palette.surface,
                  color: isSelected ? palette.action.label : palette.text.primary,
                  fontSize: `${typography.webScale.metadata}px`,
                  fontWeight: isSelected ? 600 : 400,
                  cursor: 'pointer',
                  minHeight: '44px',
                }}
              >
                <span>{m.emoji}</span>
                <span>{m.label}</span>
              </button>
            );
          })}
          {mood && (
            <button
              type="button"
              onClick={() => handleMoodSelect(null)}
              data-testid="journal-clear-mood-btn"
              aria-label="Clear selected mood"
              style={{
                background: 'none',
                border: 'none',
                color: palette.text.muted,
                cursor: 'pointer',
                fontSize: `${typography.webScale.metadata}px`,
                textDecoration: 'underline',
                minHeight: '44px',
                padding: '0 6px',
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Tags Chips Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.xs}px`,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: `${typography.webScale.metadata}px`,
              color: palette.text.muted,
              fontWeight: 600,
            }}
          >
            Tags:
          </span>
          {tags.map((t) => (
            <span
              key={t}
              data-testid={`journal-tag-${t}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: `${radii.pill}px`,
                backgroundColor: palette.action.subtle,
                fontSize: `${typography.webScale.metadata}px`,
                color: palette.action.subtleText,
                fontWeight: 500,
              }}
            >
              #{t}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleRemoveTag(t)}
                  aria-label={`Remove tag ${t}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '11px',
                    color: palette.action.subtleText,
                    padding: '0 2px',
                  }}
                >
                  ✕
                </button>
              )}
            </span>
          ))}
          {!readOnly && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="text"
                placeholder="+ Tag"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                data-testid="journal-new-tag-input"
                aria-label="Add a journal tag"
                style={{
                  width: '90px',
                  padding: '4px 8px',
                  borderRadius: `${radii.sm}px`,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.surface,
                  color: palette.text.primary,
                  fontSize: `${typography.webScale.metadata}px`,
                  minHeight: '36px',
                }}
              />
              <button
                type="button"
                onClick={handleAddTag}
                data-testid="journal-add-tag-btn"
                style={{
                  padding: '4px 8px',
                  borderRadius: `${radii.sm}px`,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.surface,
                  color: palette.text.primary,
                  cursor: 'pointer',
                  fontSize: `${typography.webScale.metadata}px`,
                  minHeight: '36px',
                }}
              >
                Add
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Optional Dismissible Prompt / Template Tray */}
      {showPromptTray && (
        <div
          data-testid="journal-prompt-tray"
          role="region"
          aria-label="Reflection prompts and templates"
          style={{
            padding: `${spacing.sm}px ${spacing.base}px`,
            backgroundColor: palette.surfaceRaised,
            borderBottom: `1px solid ${palette.border.subtle}`,
            display: 'flex',
            flexDirection: 'column',
            gap: `${spacing.sm}px`,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: `${spacing.xs}px`,
            }}
          >
            <span style={{ fontSize: `${typography.webScale.supporting}px`, fontWeight: 600 }}>
              Optional Reflection Templates
            </span>
            <div style={{ display: 'flex', gap: `${spacing.xs}px`, flexWrap: 'wrap' }}>
              {REFLECTION_TEMPLATES.filter((t) => t.id !== 'blank').map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => handleSelectTemplate(tmpl.id)}
                  data-testid={`journal-template-${tmpl.id}`}
                  style={{
                    padding: '4px 10px',
                    borderRadius: `${radii.sm}px`,
                    border: `1px solid ${palette.border.subtle}`,
                    backgroundColor: palette.surface,
                    color: palette.text.primary,
                    fontSize: `${typography.webScale.metadata}px`,
                    cursor: 'pointer',
                    minHeight: '36px',
                  }}
                >
                  {tmpl.name}
                </button>
              ))}
              <button
                type="button"
                onClick={handleDismissPrompts}
                data-testid="journal-dismiss-prompts-btn"
                aria-label="Dismiss reflection prompts and clear responses"
                style={{
                  padding: '4px 10px',
                  borderRadius: `${radii.sm}px`,
                  border: `1px solid ${palette.status.dangerBorder}`,
                  backgroundColor: palette.status.dangerBg,
                  color: palette.status.danger,
                  fontSize: `${typography.webScale.metadata}px`,
                  fontWeight: 600,
                  cursor: 'pointer',
                  minHeight: '36px',
                }}
              >
                ✕ Clear & Dismiss
              </button>
            </div>
          </div>

          {/* Active Prompt Fields */}
          {prompts.map((p, idx) => (
            <div
              key={idx}
              data-testid={`journal-prompt-item-${idx}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                padding: `${spacing.xs}px ${spacing.sm}px`,
                backgroundColor: palette.surface,
                borderRadius: `${radii.sm}px`,
                border: `1px solid ${palette.border.subtle}`,
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontSize: `${typography.webScale.supporting}px`, fontWeight: 600 }}>
                  {p.prompt}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => handleRemovePrompt(idx)}
                    aria-label={`Remove prompt "${p.prompt}"`}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: palette.text.muted,
                      fontSize: '12px',
                      padding: '4px 8px',
                      minHeight: '36px',
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
              <textarea
                value={p.response || ''}
                placeholder="Write reflection response here..."
                disabled={readOnly}
                onChange={(e) => handlePromptChange(idx, e.target.value)}
                data-testid={`journal-prompt-response-${idx}`}
                aria-label={`Response for ${p.prompt}`}
                rows={2}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: `${radii.sm}px`,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.background,
                  color: palette.text.primary,
                  fontSize: `${typography.webScale.body}px`,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Embedded NoteEditor for Proven AST Block Editing */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <NoteEditor
          id={id}
          initialTitle={initialTitle || ''}
          initialDocument={initialDocument}
          initialFolderId={initialFolderId}
          folders={folders}
          themeMode={themeMode}
          readOnly={readOnly}
          localSaveStatus={localSaveStatus}
          cloudSyncStatus={cloudSyncStatus}
          conflict={conflict}
          onChange={handleNoteChange}
          onSave={handleNoteSave}
          onResolveConflict={onResolveConflict}
          onClose={onClose}
          onDelete={onTrash}
          autoFocus={autoFocus}
        />
      </div>
    </div>
  );
};
