import { Icon } from './Icon.js';
import React, { useState, useEffect } from 'react';
import {
  colors,
  radii,
  spacing,
  touchTargets,
  typography,
  type ThemeMode,
} from '@daynori/design-tokens';
import {
  type RoutineFrequency,
  type Weekday,
  validateRoutineTitle,
  explainScheduleChangeImpact,
} from '@daynori/domain';

export interface RoutineEditorFormData {
  title: string;
  details: string | null;
  frequency: RoutineFrequency;
  weekdays: Weekday[];
  timezone: string;
  scheduledTime: string | null;
  activeFrom: string;
  activeTo: string | null;
  effectiveDate: string;
  isPaused: boolean;
}

export interface RoutineDetailEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: RoutineEditorFormData) => Promise<void> | void;
  initialRoutine?: {
    id: string;
    title: string;
    details?: string | null;
    frequency: RoutineFrequency;
    weekdays: Weekday[];
    timezone: string;
    scheduledTime?: string | null;
    activeFrom: string;
    activeTo?: string | null;
    effectiveDate: string;
    isPaused?: boolean;
  } | null;
  todayDate: string;
  defaultTimezone?: string;
  themeMode?: ThemeMode;
}

const WEEKDAY_OPTIONS: Array<{ day: Weekday; label: string; full: string }> = [
  { day: 1, label: 'M', full: 'Monday' },
  { day: 2, label: 'T', full: 'Tuesday' },
  { day: 3, label: 'W', full: 'Wednesday' },
  { day: 4, label: 'T', full: 'Thursday' },
  { day: 5, label: 'F', full: 'Friday' },
  { day: 6, label: 'S', full: 'Saturday' },
  { day: 7, label: 'S', full: 'Sunday' },
];

export const RoutineDetailEditor: React.FC<RoutineDetailEditorProps> = ({
  isOpen,
  onClose,
  onSave,
  initialRoutine,
  todayDate,
  defaultTimezone = 'UTC',
  themeMode = 'light',
}) => {
  const palette = colors[themeMode];
  const isEditing = Boolean(initialRoutine?.id);

  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [frequency, setFrequency] = useState<RoutineFrequency>('daily');
  const [weekdays, setWeekdays] = useState<Weekday[]>([1, 2, 3, 4, 5, 6, 7]);
  const [scheduledTime, setScheduledTime] = useState('08:00');
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [activeFrom, setActiveFrom] = useState(todayDate);
  const [activeTo, setActiveTo] = useState<string>('');
  const [effectiveDate, setEffectiveDate] = useState(todayDate);
  const [isPaused, setIsPaused] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialRoutine) {
      setTitle(initialRoutine.title);
      setDetails(initialRoutine.details || '');
      setFrequency(initialRoutine.frequency);
      setWeekdays(initialRoutine.weekdays || [1, 2, 3, 4, 5, 6, 7]);
      setScheduledTime(initialRoutine.scheduledTime || '');
      setTimezone(initialRoutine.timezone || defaultTimezone);
      setActiveFrom(initialRoutine.activeFrom || todayDate);
      setActiveTo(initialRoutine.activeTo || '');
      setEffectiveDate(todayDate);
      setIsPaused(Boolean(initialRoutine.isPaused));
    } else {
      setTitle('');
      setDetails('');
      setFrequency('daily');
      setWeekdays([1, 2, 3, 4, 5, 6, 7]);
      setScheduledTime('08:00');
      setTimezone(defaultTimezone);
      setActiveFrom(todayDate);
      setActiveTo('');
      setEffectiveDate(todayDate);
      setIsPaused(false);
    }
    setValidationError(null);
  }, [initialRoutine, isOpen, todayDate, defaultTimezone]);

  if (!isOpen) return null;

  const toggleWeekday = (day: Weekday) => {
    if (weekdays.includes(day)) {
      if (weekdays.length === 1) return; // Must have at least 1 weekday
      setWeekdays(weekdays.filter((d) => d !== day).sort((a, b) => a - b) as Weekday[]);
    } else {
      setWeekdays([...weekdays, day].sort((a, b) => a - b) as Weekday[]);
    }
  };

  const handleFrequencyChange = (newFreq: RoutineFrequency) => {
    setFrequency(newFreq);
    if (newFreq === 'daily') {
      setWeekdays([1, 2, 3, 4, 5, 6, 7]);
    } else if (newFreq === 'weekdays') {
      setWeekdays([1, 2, 3, 4, 5]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    try {
      const validatedTitle = validateRoutineTitle(title);

      if (weekdays.length === 0) {
        setValidationError('Please select at least one weekday.');
        return;
      }

      setIsSubmitting(true);
      await onSave({
        title: validatedTitle,
        details: details.trim() ? details.trim() : null,
        frequency,
        weekdays,
        timezone: timezone.trim() || defaultTimezone,
        scheduledTime: scheduledTime.trim() ? scheduledTime.trim() : null,
        activeFrom,
        activeTo: activeTo.trim() ? activeTo.trim() : null,
        effectiveDate,
        isPaused,
      });
      setIsSubmitting(false);
      onClose();
    } catch (err: unknown) {
      setIsSubmitting(false);
      setValidationError(err instanceof Error ? err.message : String(err));
    }
  };

  const impactExplanation = isEditing
    ? explainScheduleChangeImpact(effectiveDate, todayDate)
    : `Occurrences will be scheduled starting from ${activeFrom}.`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="routine-editor-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: `${spacing.md}px`,
        boxSizing: 'border-box',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          backgroundColor: palette.surface,
          borderRadius: `${radii.card}px`,
          border: `1px solid ${palette.border.subtle}`,
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: `${spacing.base}px`,
            borderBottom: `1px solid ${palette.border.subtle}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2
            id="routine-editor-title"
            style={{
              margin: 0,
              fontSize: `${typography.webScale.sectionHeading}px`,
              fontWeight: 700,
              color: palette.text.primary,
            }}
          >
            {isEditing ? 'Edit Daily Routine' : 'New Daily Routine'}
          </h2>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              color: palette.text.secondary,
              cursor: 'pointer',
              padding: `${spacing.xs}px`,
            }}
          >
            <Icon name="x" />
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: `${spacing.base}px`,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: `${spacing.base}px`,
          }}
        >
          {validationError && (
            <div
              role="alert"
              style={{
                padding: `${spacing.sm}px`,
                backgroundColor: themeMode === 'dark' ? '#7f1d1d40' : '#fee2e2',
                color: themeMode === 'dark' ? '#fca5a5' : '#991b1b',
                borderRadius: `${radii.sm}px`,
                border: '1px solid #ef4444',
                fontSize: '13px',
              }}
            >
              {validationError}
            </div>
          )}

          {/* Title */}
          <div>
            <label
              htmlFor="routine-title-input"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: palette.text.primary,
                marginBottom: '4px',
              }}
            >
              Routine Title *
            </label>
            <input
              id="routine-title-input"
              type="text"
              required
              maxLength={255}
              placeholder="e.g., Morning 20-min reading"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: `${radii.sm}px`,
                border: `1px solid ${palette.border.strong}`,
                backgroundColor: palette.surfaceRaised,
                color: palette.text.primary,
                fontSize: `${typography.webScale.body}px`,
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          {/* Details / Description */}
          <div>
            <label
              htmlFor="routine-details-input"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: palette.text.primary,
                marginBottom: '4px',
              }}
            >
              Description / Notes (optional)
            </label>
            <textarea
              id="routine-details-input"
              rows={2}
              maxLength={1000}
              placeholder="e.g., Focus on non-fiction or career books"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: `${radii.sm}px`,
                border: `1px solid ${palette.border.strong}`,
                backgroundColor: palette.surfaceRaised,
                color: palette.text.primary,
                fontSize: `${typography.webScale.body}px`,
                boxSizing: 'border-box',
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Frequency Selector */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: palette.text.primary,
                marginBottom: '4px',
              }}
            >
              Frequency
            </label>
            <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
              <button
                type="button"
                onClick={() => handleFrequencyChange('daily')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: `${radii.sm}px`,
                  border: `1px solid ${frequency === 'daily' ? palette.action.primary : palette.border.strong}`,
                  backgroundColor:
                    frequency === 'daily' ? palette.action.primary : palette.surfaceRaised,
                  color: frequency === 'daily' ? '#ffffff' : palette.text.primary,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                Every Day
              </button>
              <button
                type="button"
                onClick={() => handleFrequencyChange('weekdays')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: `${radii.sm}px`,
                  border: `1px solid ${frequency === 'weekdays' ? palette.action.primary : palette.border.strong}`,
                  backgroundColor:
                    frequency === 'weekdays' ? palette.action.primary : palette.surfaceRaised,
                  color: frequency === 'weekdays' ? '#ffffff' : palette.text.primary,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                Custom Weekdays
              </button>
            </div>
          </div>

          {/* Weekday Picker (when weekdays selected) */}
          {frequency === 'weekdays' && (
            <div>
              <span
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: palette.text.secondary,
                  marginBottom: '6px',
                }}
              >
                Active Weekdays
              </span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {WEEKDAY_OPTIONS.map(({ day, label, full }) => {
                  const isSelected = weekdays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-label={`${full}: ${isSelected ? 'selected' : 'not selected'}`}
                      aria-pressed={isSelected}
                      onClick={() => toggleWeekday(day)}
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: `${radii.pill}px`,
                        border: `1px solid ${isSelected ? palette.action.primary : palette.border.strong}`,
                        backgroundColor: isSelected
                          ? palette.action.primary
                          : palette.surfaceRaised,
                        color: isSelected ? '#ffffff' : palette.text.primary,
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scheduled Time & Timezone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${spacing.sm}px` }}>
            <div>
              <label
                htmlFor="routine-time-input"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: palette.text.primary,
                  marginBottom: '4px',
                }}
              >
                Scheduled Time
              </label>
              <input
                id="routine-time-input"
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: `${radii.sm}px`,
                  border: `1px solid ${palette.border.strong}`,
                  backgroundColor: palette.surfaceRaised,
                  color: palette.text.primary,
                  fontSize: `${typography.webScale.body}px`,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="routine-tz-input"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: palette.text.primary,
                  marginBottom: '4px',
                }}
              >
                Timezone
              </label>
              <input
                id="routine-tz-input"
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: `${radii.sm}px`,
                  border: `1px solid ${palette.border.strong}`,
                  backgroundColor: palette.surfaceRaised,
                  color: palette.text.primary,
                  fontSize: `${typography.webScale.body}px`,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Active Period & Effective Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${spacing.sm}px` }}>
            <div>
              <label
                htmlFor="routine-active-from"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: palette.text.primary,
                  marginBottom: '4px',
                }}
              >
                Active From
              </label>
              <input
                id="routine-active-from"
                type="date"
                required
                value={activeFrom}
                onChange={(e) => setActiveFrom(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: `${radii.sm}px`,
                  border: `1px solid ${palette.border.strong}`,
                  backgroundColor: palette.surfaceRaised,
                  color: palette.text.primary,
                  fontSize: `${typography.webScale.body}px`,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {isEditing && (
              <div>
                <label
                  htmlFor="routine-effective-date"
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: palette.text.primary,
                    marginBottom: '4px',
                  }}
                >
                  Effective Date
                </label>
                <input
                  id="routine-effective-date"
                  type="date"
                  required
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: `${radii.sm}px`,
                    border: `1px solid ${palette.border.strong}`,
                    backgroundColor: palette.surfaceRaised,
                    color: palette.text.primary,
                    fontSize: `${typography.webScale.body}px`,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}
          </div>

          {/* Schedule Change Impact Info Callout */}
          <div
            style={{
              padding: `${spacing.sm}px`,
              borderRadius: `${radii.sm}px`,
              backgroundColor: palette.surfaceRaised,
              border: `1px solid ${palette.border.subtle}`,
              fontSize: '12px',
              color: palette.text.secondary,
              lineHeight: 1.4,
            }}
          >
            <strong style={{ color: palette.text.primary, display: 'block', marginBottom: '2px' }}>
              Schedule Reconciliation & History Preservation:
            </strong>
            {impactExplanation}
          </div>

          {/* Pause / Resume Toggle (when editing) */}
          {isEditing && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `${spacing.xs}px 0`,
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: palette.text.primary,
                    display: 'block',
                  }}
                >
                  Pause Routine
                </span>
                <span style={{ fontSize: '12px', color: palette.text.secondary }}>
                  Temporarily pause occurrences without deleting history.
                </span>
              </div>
              <input
                type="checkbox"
                id="routine-pause-toggle"
                checked={isPaused}
                onChange={(e) => setIsPaused(e.target.checked)}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
            </div>
          )}

          {/* Action buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: `${spacing.sm}px`,
              marginTop: `${spacing.sm}px`,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '8px 16px',
                borderRadius: `${radii.sm}px`,
                border: `1px solid ${palette.border.strong}`,
                backgroundColor: palette.surface,
                color: palette.text.primary,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px',
                minHeight: `${touchTargets.webMin}px`,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '8px 20px',
                borderRadius: `${radii.sm}px`,
                border: 'none',
                backgroundColor: palette.action.primary,
                color: '#ffffff',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: '13px',
                minHeight: `${touchTargets.webMin}px`,
                opacity: isSubmitting ? 0.7 : 1,
              }}
            >
              {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Routine'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
