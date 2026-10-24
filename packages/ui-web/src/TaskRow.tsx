import { Icon } from './Icon.js';
import React from 'react';
import {
  colors,
  radii,
  spacing,
  touchTargets,
  typography,
  type ThemeMode,
} from '@daynori/design-tokens';
import {
  type TaskPriority,
  type TaskStatus,
  type TaskDeadline,
  formatTaskDeadlineExplanation,
} from '@daynori/domain';

export interface TaskRowProps {
  id: string;
  title: string;
  details?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: TaskDeadline;
  folderName?: string;
  tags?: string[];
  subtaskCount?: { completed: number; total: number };
  depth?: number;
  isSelected?: boolean;
  themeMode?: ThemeMode;
  userTimezone?: string;
  onToggleComplete?: (id: string) => void;
  onSelect?: (id: string, selected: boolean) => void;
  onClick?: (id: string) => void;
  readOnly?: boolean;
}

export const TaskRow: React.FC<TaskRowProps> = ({
  id,
  title,
  details,
  priority,
  status,
  deadline,
  folderName,
  tags = [],
  subtaskCount,
  depth = 1,
  isSelected = false,
  themeMode = 'light',
  userTimezone = 'UTC',
  onToggleComplete,
  onSelect,
  onClick,
  readOnly = false,
}) => {
  const palette = colors[themeMode];
  const isCompleted = status === 'completed';

  const deadlineExp = formatTaskDeadlineExplanation(deadline, userTimezone);

  const getPriorityStyle = (p: TaskPriority) => {
    switch (p) {
      case 'urgent':
        return {
          bg: themeMode === 'dark' ? '#7f1d1d' : '#fee2e2',
          text: themeMode === 'dark' ? '#fecaca' : '#991b1b',
          border: themeMode === 'dark' ? '#ef4444' : '#b91c1c',
          label: 'Urgent',
        };
      case 'high':
        return {
          bg: themeMode === 'dark' ? '#78350f' : '#fef3c7',
          text: themeMode === 'dark' ? '#fde68a' : '#92400e',
          border: themeMode === 'dark' ? '#f59e0b' : '#b45309',
          label: 'High',
        };
      case 'normal':
        return {
          bg: themeMode === 'dark' ? '#1e293b' : '#f1f5f9',
          text: themeMode === 'dark' ? '#cbd5e1' : '#475569',
          border: themeMode === 'dark' ? '#475569' : '#cbd5e1',
          label: 'Normal',
        };
      case 'low':
        return {
          bg: themeMode === 'dark' ? '#141e2e' : '#f8fafc',
          text: themeMode === 'dark' ? '#94a3b8' : '#64748b',
          border: themeMode === 'dark' ? '#334155' : '#e2e8f0',
          label: 'Low',
        };
    }
  };

  const priorityStyle = getPriorityStyle(priority);
  const indentPadding = (depth - 1) * 24;

  return (
    <div
      role="listitem"
      data-task-id={id}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: `${spacing.sm}px ${spacing.base}px`,
        paddingLeft: `${spacing.base + indentPadding}px`,
        borderBottom: `1px solid ${palette.border.subtle}`,
        backgroundColor: isSelected
          ? themeMode === 'dark'
            ? 'rgba(59, 130, 246, 0.15)'
            : 'rgba(59, 130, 246, 0.08)'
          : palette.surface,
        borderRadius: radii.card,
        gap: `${spacing.sm}px`,
        transition: 'background-color 0.15s ease',
        minHeight: `${touchTargets.webMin}px`,
        boxSizing: 'border-box',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={(e) => {
        // Prevent clicking checkbox from triggering row open
        const target = e.target as HTMLElement;
        if (target.tagName.toLowerCase() === 'input' || target.closest('button')) {
          return;
        }
        if (onClick) onClick(id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const target = e.target as HTMLElement;
          if (target.tagName.toLowerCase() !== 'input' && onClick) {
            e.preventDefault();
            onClick(id);
          }
        }
      }}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`Task: ${title}, priority ${priorityStyle.label}, ${isCompleted ? 'Completed' : 'Incomplete'}`}
    >
      {/* Bulk Select Checkbox */}
      {onSelect && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(id, e.target.checked)}
          aria-label={`Select task "${title}" for bulk actions`}
          style={{
            width: '18px',
            height: '18px',
            cursor: 'pointer',
            accentColor: palette.action.primary,
          }}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Completion Toggle Checkbox */}
      <button
        type="button"
        disabled={readOnly}
        onClick={(e) => {
          e.stopPropagation();
          if (onToggleComplete) onToggleComplete(id);
        }}
        aria-label={isCompleted ? `Reopen task "${title}"` : `Mark task "${title}" as completed`}
        style={{
          width: '24px',
          height: '24px',
          borderRadius: radii.sm,
          border: `2px solid ${isCompleted ? palette.action.primary : palette.border.strong}`,
          backgroundColor: isCompleted ? palette.action.primary : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: readOnly ? 'default' : 'pointer',
          padding: 0,
          color: '#ffffff',
          fontWeight: 'bold',
          fontSize: '14px',
          flexShrink: 0,
        }}
      >
        {isCompleted ? <Icon name="check" /> : null}
      </button>

      {/* Title & Secondary Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
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
              fontSize: `${typography.webScale.body}px`,
              fontFamily: typography.fontFamily.sans,
              color: isCompleted ? palette.text.muted : palette.text.primary,
              textDecoration: isCompleted ? 'line-through' : 'none',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}
          >
            {title}
          </span>

          {/* Priority Badge */}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              padding: '2px 6px',
              borderRadius: radii.sm,
              backgroundColor: priorityStyle.bg,
              color: priorityStyle.text,
              border: `1px solid ${priorityStyle.border}`,
              flexShrink: 0,
            }}
          >
            {priorityStyle.label}
          </span>

          {/* Folder Badge if available */}
          {folderName && (
            <span
              style={{
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: radii.sm,
                backgroundColor: themeMode === 'dark' ? '#1f2937' : '#e5e7eb',
                color: palette.text.secondary,
                flexShrink: 0,
              }}
            >
              <Icon name="folder" /> {folderName}
            </span>
          )}

          {/* Subtask progress count if any */}
          {subtaskCount && subtaskCount.total > 0 && (
            <span
              style={{
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: radii.sm,
                backgroundColor: themeMode === 'dark' ? '#0f172a' : '#f1f5f9',
                color: palette.text.secondary,
                flexShrink: 0,
              }}
            >
              <Icon name="corner-down-right" /> {subtaskCount.completed}/{subtaskCount.total} subtasks
            </span>
          )}
        </div>

        {/* Details snippet and tags */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.sm}px`,
            marginTop: '2px',
            flexWrap: 'wrap',
          }}
        >
          {/* Overdue / Due Date with explicit text explanation */}
          {deadline.type !== 'none' && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: deadlineExp.isOverdue && !isCompleted ? 600 : 400,
                color:
                  deadlineExp.isOverdue && !isCompleted
                    ? themeMode === 'dark'
                      ? '#f87171'
                      : '#b91c1c'
                    : palette.text.secondary,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {deadlineExp.isOverdue && !isCompleted ? (
                <>
                  <span aria-hidden="true">
                    <Icon name="warning" />
                  </span>
                  <span>{deadlineExp.overdueText || deadlineExp.label}</span>
                </>
              ) : (
                <span>
                  <Icon name="calendar" /> {deadlineExp.label}
                </span>
              )}
            </span>
          )}

          {/* Timezone Note when viewing timezone differs */}
          {deadlineExp.timezoneNote && (
            <span
              style={{
                fontSize: '11px',
                color: palette.text.muted,
              }}
            >
              ({deadlineExp.timezoneNote})
            </span>
          )}

          {/* Tags */}
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: '11px',
                padding: '1px 5px',
                borderRadius: radii.sm,
                backgroundColor:
                  themeMode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                color: palette.text.secondary,
              }}
            >
              #{tag}
            </span>
          ))}

          {/* Details text snippet */}
          {details && (
            <span
              style={{
                fontSize: '12px',
                color: palette.text.muted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '260px',
              }}
            >
              {details}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
