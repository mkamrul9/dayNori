import { Icon } from './Icon.js';
import React, { useState, useEffect, useMemo } from 'react';
import { colors, radii, spacing, typography, type ThemeMode } from '@daynori/design-tokens';
import {
  type TaskPriority,
  type TaskStatus,
  type TaskDeadline,
  isValidCalendarDateString,
  isValidIanaTimezone,
  checkLocalTimeDisambiguation,
  getCalendarDateTimeParts,
  getCalendarDateInTimezone,
  type LocalTimeDisambiguation,
  MAX_TASK_TITLE_LENGTH,
  MAX_TASK_DETAILS_LENGTH,
  MAX_SUBTASK_DEPTH,
} from '@daynori/domain';
import { Button } from './Button.js';

export interface TaskDetailEditorProps {
  id?: string;
  initialTitle?: string;
  initialDetails?: string | null;
  initialPriority?: TaskPriority;
  initialStatus?: TaskStatus;
  initialDeadline?: TaskDeadline;
  initialFolderId?: string | null;
  initialTags?: string[];
  initialSubtasks?: Array<{ id: string; title: string; status: TaskStatus }>;
  folders?: Array<{ id: string; name: string }>;
  themeMode?: ThemeMode;
  userTimezone?: string;
  currentDepth?: number;
  readOnly?: boolean;
  onSave?: (task: {
    title: string;
    details?: string | null;
    priority: TaskPriority;
    status: TaskStatus;
    deadline: TaskDeadline;
    folderId?: string | null;
    tags: string[];
    subtasks?: Array<{ id?: string; title: string; status: TaskStatus }>;
  }) => void | Promise<void>;
  onClose?: () => void;
  onDelete?: () => void;
  onArchive?: () => void;
}

export const TaskDetailEditor: React.FC<TaskDetailEditorProps> = ({
  id,
  initialTitle = '',
  initialDetails = '',
  initialPriority = 'normal',
  initialStatus = 'todo',
  initialDeadline = { type: 'none' },
  initialFolderId = null,
  initialTags = [],
  initialSubtasks = [],
  folders = [],
  themeMode = 'light',
  userTimezone = typeof Intl !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    : 'UTC',
  currentDepth = 1,
  readOnly = false,
  onSave,
  onClose,
  onDelete,
  onArchive,
}) => {
  const palette = colors[themeMode];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const [title, setTitle] = useState(initialTitle);
  const [details, setDetails] = useState(initialDetails || '');
  const [priority, setPriority] = useState<TaskPriority>(initialPriority);
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [folderId, setFolderId] = useState<string | null>(initialFolderId);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState('');

  // Subtasks
  const [subtasks, setSubtasks] =
    useState<Array<{ id?: string; title: string; status: TaskStatus }>>(initialSubtasks);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // Derive both date and time synchronously from the exact same timezone
  const deadlineZoneInitial =
    initialDeadline.type === 'timed' ? initialDeadline.timezone : userTimezone;

  const initialParts = useMemo(() => {
    if (initialDeadline.type === 'timed') {
      const zone = initialDeadline.timezone || userTimezone;
      return getCalendarDateTimeParts(new Date(initialDeadline.timestamp), zone);
    }
    return null;
  }, [initialDeadline, userTimezone]);

  // Deadline state
  const [deadlineType, setDeadlineType] = useState<'none' | 'date' | 'timed'>(initialDeadline.type);
  const [deadlineZone, setDeadlineZone] = useState<string>(deadlineZoneInitial);
  const [deadlineDate, setDeadlineDate] = useState<string>(
    initialDeadline.type === 'date'
      ? initialDeadline.date
      : initialParts
        ? initialParts.date
        : getCalendarDateInTimezone(new Date(), userTimezone)
  );
  const [deadlineTime, setDeadlineTime] = useState<string>(
    initialParts ? initialParts.time : '17:00'
  );
  const [ambiguousChoice, setAmbiguousChoice] = useState<'earlier' | 'later'>('earlier');

  const [validationError, setValidationError] = useState<string | null>(null);
  const [disambiguationResult, setDisambiguationResult] = useState<LocalTimeDisambiguation | null>(
    null
  );
  const [disambiguationNotice, setDisambiguationNotice] = useState<string | null>(null);

  // Required-fields-first: optional folder/priority/notes/tags/subtasks live under Details.
  const hasOptionalSeed =
    Boolean((initialDetails || '').trim()) ||
    initialPriority !== 'normal' ||
    initialStatus !== 'todo' ||
    Boolean(initialFolderId) ||
    initialTags.length > 0 ||
    initialSubtasks.length > 0;
  const [detailsExpanded, setDetailsExpanded] = useState(hasOptionalSeed);

  // Check local time disambiguation when timed deadline fields change
  useEffect(() => {
    if (
      deadlineType === 'timed' &&
      isValidCalendarDateString(deadlineDate) &&
      isValidIanaTimezone(deadlineZone)
    ) {
      try {
        const result = checkLocalTimeDisambiguation(deadlineDate, deadlineTime, deadlineZone);
        setDisambiguationResult(result);
        if (result.type === 'nonexistent') {
          setDisambiguationNotice(`Nonexistent local time: ${result.explanation}`);
        } else if (result.type === 'ambiguous') {
          setDisambiguationNotice(`ℹ️ Ambiguous local time: ${result.explanation}`);
        } else {
          setDisambiguationNotice(null);
        }
      } catch (err: unknown) {
        setDisambiguationResult(null);
        setDisambiguationNotice(err instanceof Error ? err.message : null);
      }
    } else {
      setDisambiguationResult(null);
      setDisambiguationNotice(null);
    }
  }, [deadlineType, deadlineDate, deadlineTime, deadlineZone]);

  const handleAddTag = () => {
    const trimmed = tagInput.trim().replace(/^#/, '');
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleAddSubtask = () => {
    if (currentDepth >= MAX_SUBTASK_DEPTH) {
      setValidationError(`Maximum subtask nesting depth of ${MAX_SUBTASK_DEPTH} reached`);
      return;
    }
    const trimmed = newSubtaskTitle.trim();
    if (!trimmed) return;
    setSubtasks([...subtasks, { title: trimmed, status: 'todo' }]);
    setNewSubtaskTitle('');
    setValidationError(null);
  };

  const handleToggleSubtask = (index: number) => {
    setSubtasks((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, status: s.status === 'completed' ? 'todo' : 'completed' } : s
      )
    );
  };

  const handleRemoveSubtask = (index: number) => {
    setSubtasks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setValidationError('Task title is required');
      return;
    }
    if (cleanTitle.length > MAX_TASK_TITLE_LENGTH) {
      setValidationError(`Title cannot exceed ${MAX_TASK_TITLE_LENGTH} characters`);
      return;
    }
    if (details.length > MAX_TASK_DETAILS_LENGTH) {
      setValidationError(`Details cannot exceed ${MAX_TASK_DETAILS_LENGTH} characters`);
      return;
    }

    let deadline: TaskDeadline = { type: 'none' };
    if (deadlineType === 'date') {
      if (!isValidCalendarDateString(deadlineDate)) {
        setValidationError('Invalid calendar date format (expected YYYY-MM-DD)');
        return;
      }
      deadline = { type: 'date', date: deadlineDate };
    } else if (deadlineType === 'timed') {
      if (!isValidCalendarDateString(deadlineDate)) {
        setValidationError('Invalid calendar date format (expected YYYY-MM-DD)');
        return;
      }
      if (!isValidIanaTimezone(deadlineZone)) {
        setValidationError(`Invalid IANA timezone: '${deadlineZone}'`);
        return;
      }

      // Disambiguate local time
      try {
        const disambig = checkLocalTimeDisambiguation(deadlineDate, deadlineTime, deadlineZone);
        let utcIso: string;
        if (disambig.type === 'exact') {
          utcIso = disambig.utcTimestamp;
        } else if (disambig.type === 'ambiguous') {
          utcIso =
            ambiguousChoice === 'later' ? disambig.laterUtcTimestamp : disambig.earlierUtcTimestamp;
        } else {
          setValidationError(
            `Nonexistent local time: ${disambig.explanation}. Please adjust the time to a valid instant outside the DST gap.`
          );
          return;
        }

        deadline = {
          type: 'timed',
          timestamp: utcIso,
          timezone: deadlineZone,
        };
      } catch (err: unknown) {
        setValidationError(
          `Failed to construct timed deadline: ${err instanceof Error ? err.message : String(err)}`
        );
        return;
      }
    }

    if (onSave) {
      void onSave({
        title: cleanTitle,
        details: details.trim() || null,
        priority,
        status,
        deadline,
        folderId,
        tags,
        subtasks,
      });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-editor-title"
      className="daynori-mobile-editor-backdrop daynori-dialog-backdrop"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${spacing.md}px`,
        zIndex: 1000,
        boxSizing: 'border-box',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      <div
        className="daynori-mobile-editor-panel daynori-dialog-panel"
        style={{
          backgroundColor: palette.surface,
          color: palette.text.primary,
          borderRadius: radii.sheet,
          padding: `${spacing.lg}px`,
          maxWidth: '640px',
          width: '100%',
          maxHeight: 'min(90vh, 90dvh)',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          boxSizing: 'border-box',
          border: `1px solid ${palette.border.subtle}`,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: `${spacing.base}px`,
          }}
        >
          <h2
            id="task-editor-title"
            style={{
              fontSize: `${typography.webScale.sectionHeading}px`,
              fontFamily: typography.fontFamily.sans,
              fontWeight: 600,
              margin: 0,
            }}
          >
            {id ? 'Task Details' : 'New Task'}
          </h2>
          <Button variant="subtle" size="compact" onClick={onClose} aria-label="Close task editor">
            <Icon name="x" />
          </Button>
        </div>

        {/* Validation Error Banner */}
        {validationError && (
          <div
            role="alert"
            style={{
              padding: `${spacing.sm}px ${spacing.base}px`,
              backgroundColor: themeMode === 'dark' ? '#7f1d1d' : '#fee2e2',
              color: themeMode === 'dark' ? '#fecaca' : '#991b1b',
              borderRadius: radii.card,
              marginBottom: `${spacing.base}px`,
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {validationError}
          </div>
        )}

        {/* Disambiguation Notice */}
        {disambiguationNotice && (
          <div
            role="status"
            style={{
              padding: `${spacing.sm}px ${spacing.base}px`,
              backgroundColor: themeMode === 'dark' ? '#78350f' : '#fef3c7',
              color: themeMode === 'dark' ? '#fde68a' : '#92400e',
              borderRadius: radii.card,
              marginBottom: `${spacing.base}px`,
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {disambiguationNotice}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Title */}
          <div style={{ marginBottom: `${spacing.base}px` }}>
            <label
              htmlFor="task-title-input"
              style={{
                display: 'block',
                fontSize: `${typography.webScale.supporting}px`,
                fontFamily: typography.fontFamily.sans,
                color: palette.text.secondary,
                marginBottom: '4px',
              }}
            >
              Title <span style={{ color: palette.status.danger }}>*</span>
            </label>
            <input
              id="task-title-input"
              type="text"
              required
              disabled={readOnly}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              style={{
                width: '100%',
                padding: `${spacing.sm}px ${spacing.base}px`,
                borderRadius: radii.card,
                border: `1px solid ${palette.border.subtle}`,
                backgroundColor: palette.background,
                color: palette.text.primary,
                fontSize: '15px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Deadline Section (primary planning field — stays above optional Details) */}
          <div
            style={{
              marginBottom: `${spacing.base}px`,
              padding: `${spacing.base}px`,
              backgroundColor: themeMode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderRadius: radii.card,
              border: `1px solid ${palette.border.subtle}`,
            }}
          >
            <span
              style={{
                display: 'block',
                fontSize: `${typography.webScale.supporting}px`,
                fontFamily: typography.fontFamily.sans,
                color: palette.text.secondary,
                marginBottom: '8px',
              }}
            >
              Deadline
            </span>

            {/* Type selector */}
            <div
              style={{ display: 'flex', gap: `${spacing.base}px`, marginBottom: `${spacing.sm}px` }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="deadline-type"
                  value="none"
                  checked={deadlineType === 'none'}
                  onChange={() => setDeadlineType('none')}
                  disabled={readOnly}
                />
                No deadline
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="deadline-type"
                  value="date"
                  checked={deadlineType === 'date'}
                  onChange={() => setDeadlineType('date')}
                  disabled={readOnly}
                />
                Date only
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="deadline-type"
                  value="timed"
                  checked={deadlineType === 'timed'}
                  onChange={() => setDeadlineType('timed')}
                  disabled={readOnly}
                />
                Timed (Date & Time)
              </label>
            </div>

            {/* Date and Time Pickers */}
            {deadlineType !== 'none' && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: deadlineType === 'timed' ? '1fr 1fr 1fr' : '1fr',
                  gap: `${spacing.sm}px`,
                  marginTop: `${spacing.sm}px`,
                }}
              >
                <div>
                  <label
                    htmlFor="deadline-date-input"
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: palette.text.muted,
                      marginBottom: '2px',
                    }}
                  >
                    Calendar Date
                  </label>
                  <input
                    id="deadline-date-input"
                    type="date"
                    disabled={readOnly}
                    value={deadlineDate}
                    onChange={(e) => setDeadlineDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: `${spacing.xs}px ${spacing.sm}px`,
                      borderRadius: radii.sm,
                      border: `1px solid ${palette.border.subtle}`,
                      backgroundColor: palette.background,
                      color: palette.text.primary,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {deadlineType === 'timed' && (
                  <>
                    <div>
                      <label
                        htmlFor="deadline-time-input"
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          color: palette.text.muted,
                          marginBottom: '2px',
                        }}
                      >
                        Time (24h)
                      </label>
                      <input
                        id="deadline-time-input"
                        type="time"
                        disabled={readOnly}
                        value={deadlineTime}
                        onChange={(e) => setDeadlineTime(e.target.value)}
                        style={{
                          width: '100%',
                          padding: `${spacing.xs}px ${spacing.sm}px`,
                          borderRadius: radii.sm,
                          border: `1px solid ${palette.border.subtle}`,
                          backgroundColor: palette.background,
                          color: palette.text.primary,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="deadline-tz-input"
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          color: palette.text.muted,
                          marginBottom: '2px',
                        }}
                      >
                        Timezone
                      </label>
                      <input
                        id="deadline-tz-input"
                        type="text"
                        disabled={readOnly}
                        value={deadlineZone}
                        onChange={(e) => setDeadlineZone(e.target.value)}
                        placeholder="e.g. UTC, Asia/Dhaka"
                        style={{
                          width: '100%',
                          padding: `${spacing.xs}px ${spacing.sm}px`,
                          borderRadius: radii.sm,
                          border: `1px solid ${palette.border.subtle}`,
                          backgroundColor: palette.background,
                          color: palette.text.primary,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </>
                )}
                {disambiguationNotice && (
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      marginTop: `${spacing.xs}px`,
                      padding: `${spacing.xs}px ${spacing.sm}px`,
                      borderRadius: radii.sm,
                      fontSize: '12px',
                      backgroundColor:
                        disambiguationResult?.type === 'nonexistent'
                          ? palette.status.dangerBg
                          : palette.status.warningBg,
                      color:
                        disambiguationResult?.type === 'nonexistent'
                          ? palette.status.danger
                          : palette.status.warning,
                      border: `1px solid ${
                        disambiguationResult?.type === 'nonexistent'
                          ? palette.status.dangerBorder
                          : palette.status.warningBorder
                      }`,
                    }}
                  >
                    {disambiguationNotice}
                    {disambiguationResult?.type === 'ambiguous' && (
                      <div
                        style={{
                          marginTop: '6px',
                          display: 'flex',
                          gap: '12px',
                          alignItems: 'center',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>Choice:</span>
                        <label
                          style={{
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <input
                            type="radio"
                            name="ambiguous-choice-editor"
                            value="earlier"
                            checked={ambiguousChoice === 'earlier'}
                            onChange={() => setAmbiguousChoice('earlier')}
                          />
                          Earlier occurrence (
                          {disambiguationResult.earlierUtcTimestamp.slice(11, 16)} UTC)
                        </label>
                        <label
                          style={{
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <input
                            type="radio"
                            name="ambiguous-choice-editor"
                            value="later"
                            checked={ambiguousChoice === 'later'}
                            onChange={() => setAmbiguousChoice('later')}
                          />
                          Later occurrence ({disambiguationResult.laterUtcTimestamp.slice(11, 16)}{' '}
                          UTC)
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Optional fields — folder, priority, notes, tags, subtasks */}
          <details
            id="task-editor-details"
            open={detailsExpanded}
            onToggle={(e) => setDetailsExpanded((e.target as HTMLDetailsElement).open)}
            style={{ marginBottom: `${spacing.lg}px` }}
          >
            <summary
              style={{
                cursor: 'pointer',
                fontSize: `${typography.webScale.supporting}px`,
                fontFamily: typography.fontFamily.sans,
                fontWeight: 600,
                color: palette.text.primary,
                marginBottom: `${spacing.sm}px`,
                listStyle: 'revert',
              }}
            >
              Details (optional)
            </summary>

          {/* Details / Description */}
          <div style={{ marginBottom: `${spacing.base}px` }}>
            <label
              htmlFor="task-details-input"
              style={{
                display: 'block',
                fontSize: `${typography.webScale.supporting}px`,
                fontFamily: typography.fontFamily.sans,
                color: palette.text.secondary,
                marginBottom: '4px',
              }}
            >
              Notes
            </label>
            <textarea
              id="task-details-input"
              rows={3}
              disabled={readOnly}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Add description or context..."
              style={{
                width: '100%',
                padding: `${spacing.sm}px ${spacing.base}px`,
                borderRadius: radii.card,
                border: `1px solid ${palette.border.subtle}`,
                backgroundColor: palette.background,
                color: palette.text.primary,
                fontSize: '14px',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Priority & Status Controls */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: `${spacing.base}px`,
              marginBottom: `${spacing.base}px`,
            }}
          >
            <div>
              <label
                htmlFor="task-priority-select"
                style={{
                  display: 'block',
                  fontSize: `${typography.webScale.supporting}px`,
                  fontFamily: typography.fontFamily.sans,
                  color: palette.text.secondary,
                  marginBottom: '4px',
                }}
              >
                Priority
              </label>
              <select
                id="task-priority-select"
                disabled={readOnly}
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                style={{
                  width: '100%',
                  padding: `${spacing.sm}px`,
                  borderRadius: radii.card,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.background,
                  color: palette.text.primary,
                  fontSize: '14px',
                }}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="task-status-select"
                style={{
                  display: 'block',
                  fontSize: `${typography.webScale.supporting}px`,
                  fontFamily: typography.fontFamily.sans,
                  color: palette.text.secondary,
                  marginBottom: '4px',
                }}
              >
                Status
              </label>
              <select
                id="task-status-select"
                disabled={readOnly}
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                style={{
                  width: '100%',
                  padding: `${spacing.sm}px`,
                  borderRadius: radii.card,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.background,
                  color: palette.text.primary,
                  fontSize: '14px',
                }}
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Folder & Tags */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: `${spacing.base}px`,
              marginBottom: `${spacing.base}px`,
            }}
          >
            {/* Folder Picker */}
            <div>
              <label
                htmlFor="task-folder-select"
                style={{
                  display: 'block',
                  fontSize: `${typography.webScale.supporting}px`,
                  fontFamily: typography.fontFamily.sans,
                  color: palette.text.secondary,
                  marginBottom: '4px',
                }}
              >
                Folder
              </label>
              <select
                id="task-folder-select"
                disabled={readOnly}
                value={folderId || ''}
                onChange={(e) => setFolderId(e.target.value ? e.target.value : null)}
                style={{
                  width: '100%',
                  padding: `${spacing.sm}px`,
                  borderRadius: radii.card,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.background,
                  color: palette.text.primary,
                  fontSize: '14px',
                }}
              >
                <option value="">(None / Root)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tags Input */}
            <div>
              <label
                htmlFor="task-tag-input"
                style={{
                  display: 'block',
                  fontSize: `${typography.webScale.supporting}px`,
                  fontFamily: typography.fontFamily.sans,
                  color: palette.text.secondary,
                  marginBottom: '4px',
                }}
              >
                Tags
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  id="task-tag-input"
                  type="text"
                  disabled={readOnly}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="Add tag..."
                  style={{
                    flex: 1,
                    padding: `${spacing.xs}px ${spacing.sm}px`,
                    borderRadius: radii.sm,
                    border: `1px solid ${palette.border.subtle}`,
                    backgroundColor: palette.background,
                    color: palette.text.primary,
                    fontSize: '13px',
                  }}
                />
                <Button
                  type="button"
                  size="compact"
                  variant="subtle"
                  onClick={handleAddTag}
                  disabled={readOnly}
                >
                  Add
                </Button>
              </div>
              {/* Tag Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                {tags.map((t) => (
                  <span
                    key={t}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: radii.sm,
                      backgroundColor: themeMode === 'dark' ? '#1f2937' : '#e5e7eb',
                      color: palette.text.primary,
                    }}
                  >
                    #{t}
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(t)}
                        aria-label={`Remove tag ${t}`}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: '12px',
                          color: palette.text.muted,
                        }}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Subtasks Section */}
          <div style={{ marginBottom: `${spacing.base}px` }}>
            <span
              style={{
                display: 'block',
                fontSize: `${typography.webScale.supporting}px`,
                fontFamily: typography.fontFamily.sans,
                color: palette.text.secondary,
                marginBottom: '6px',
              }}
            >
              Subtasks ({subtasks.length})
            </span>

            {/* Subtask list */}
            {subtasks.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  marginBottom: '8px',
                }}
              >
                {subtasks.map((sub, idx) => (
                  <div
                    key={sub.id || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      backgroundColor: palette.background,
                      borderRadius: radii.sm,
                      border: `1px solid ${palette.border.subtle}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={sub.status === 'completed'}
                        onChange={() => handleToggleSubtask(idx)}
                        disabled={readOnly}
                        aria-label={`Mark subtask "${sub.title}" as completed`}
                      />
                      <span
                        style={{
                          fontSize: '13px',
                          textDecoration: sub.status === 'completed' ? 'line-through' : 'none',
                          color:
                            sub.status === 'completed' ? palette.text.muted : palette.text.primary,
                        }}
                      >
                        {sub.title}
                      </span>
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSubtask(idx)}
                        aria-label={`Delete subtask "${sub.title}"`}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: palette.text.muted,
                          fontSize: '14px',
                        }}
                      >
                        <Icon name="x" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add subtask input */}
            {!readOnly && currentDepth < MAX_SUBTASK_DEPTH && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSubtask();
                    }
                  }}
                  placeholder="Add a subtask..."
                  style={{
                    flex: 1,
                    padding: `${spacing.xs}px ${spacing.sm}px`,
                    borderRadius: radii.sm,
                    border: `1px solid ${palette.border.subtle}`,
                    backgroundColor: palette.background,
                    color: palette.text.primary,
                    fontSize: '13px',
                  }}
                />
                <Button type="button" size="compact" variant="secondary" onClick={handleAddSubtask}>
                  + Add Subtask
                </Button>
              </div>
            )}
          </div>
          </details>

          {/* Action Footer — sticky on mobile so Save/Cancel stay reachable with keyboard */}
          <div
            className="daynori-dialog-actions"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: `${spacing.base}px`,
              borderTop: `1px solid ${palette.border.subtle}`,
              flexWrap: 'wrap',
              gap: `${spacing.sm}px`,
              backgroundColor: palette.surface,
            }}
          >
            <div style={{ display: 'flex', gap: `${spacing.sm}px` }}>
              {id && onDelete && !readOnly && (
                <Button type="button" variant="danger" size="compact" onClick={onDelete}>
                  Delete Task
                </Button>
              )}
              {id && onArchive && !readOnly && (
                <Button type="button" variant="subtle" size="compact" onClick={onArchive}>
                  Archive
                </Button>
              )}
            </div>

            <div style={{ display: 'flex', gap: `${spacing.sm}px` }}>
              <Button type="button" variant="subtle" size="compact" onClick={onClose}>
                Cancel
              </Button>
              {!readOnly && (
                <Button
                  type="submit"
                  variant="primary"
                  size="compact"
                  data-tour-target="create.task.save"
                >
                  Save Task
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
