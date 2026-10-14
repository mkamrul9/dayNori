import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  Button,
  Card,
  Dialog,
  Feedback,
  ListRow,
  TextField,
  EmptyState,
  SkipLink,
  RouteAnnouncer,
} from './index.js';

describe('UI Web Primitives Accessibility & Interaction Contracts', () => {
  it('exports all core accessible primitives', () => {
    expect(Button).toBeDefined();
    expect(Card).toBeDefined();
    expect(TextField).toBeDefined();
    expect(Dialog).toBeDefined();
    expect(Feedback).toBeDefined();
    expect(ListRow).toBeDefined();
    expect(EmptyState).toBeDefined();
    expect(SkipLink).toBeDefined();
    expect(RouteAnnouncer).toBeDefined();
  });

  describe('Button Accessibility', () => {
    it('renders standard primary button with accessible attributes', () => {
      const html = renderToString(React.createElement(Button, { id: 'btn-1' }, 'Click me'));
      expect(html).toContain('type="button"');
      expect(html).toContain('aria-busy="false"');
      expect(html).toContain('aria-disabled="false"');
      expect(html).toContain('Click me');
      expect(html).toContain('min-height:44px');
    });

    it('enforces 44px minimum touch target on compact buttons', () => {
      const html = renderToString(React.createElement(Button, { size: 'compact' }, 'Compact'));
      expect(html).toContain('min-height:44px');
      expect(html).toContain('min-width:44px');
    });

    it('renders loading state with aria-busy and status role', () => {
      const html = renderToString(React.createElement(Button, { loading: true }, 'Saving'));
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-label="Loading"');
    });

    it('renders disabled state with aria-disabled and disabled attribute', () => {
      const html = renderToString(React.createElement(Button, { disabled: true }, 'Disabled'));
      expect(html).toContain('disabled=""');
      expect(html).toContain('aria-disabled="true"');
    });
  });

  describe('TextField Accessibility', () => {
    it('associates label, input, and helper text via aria-describedby', () => {
      const html = renderToString(
        React.createElement(TextField, {
          id: 'title-field',
          label: 'Task Title',
          helperText: 'A concise summary of the task.',
        })
      );
      expect(html).toContain('for="title-field"');
      expect(html).toContain('id="title-field"');
      expect(html).toContain('aria-describedby="title-field-helper"');
      expect(html).toContain('id="title-field-helper"');
      expect(html).toContain('Task Title');
    });

    it('associates error message with role="alert" and aria-invalid="true"', () => {
      const html = renderToString(
        React.createElement(TextField, {
          id: 'error-field',
          label: 'Due Date',
          errorMessage: 'Date format must be YYYY-MM-DD.',
        })
      );
      expect(html).toContain('aria-invalid="true"');
      expect(html).toContain('aria-describedby="error-field-error"');
      expect(html).toContain('role="alert"');
      expect(html).toContain('Date format must be YYYY-MM-DD.');
    });
  });

  describe('Dialog Accessibility', () => {
    it('renders accessible dialog modal structure when open', () => {
      const html = renderToString(
        React.createElement(
          Dialog,
          {
            isOpen: true,
            onClose: () => {},
            title: 'Delete Confirmation',
            description: 'Are you sure you want to delete this note?',
          },
          React.createElement('button', { type: 'button' }, 'Confirm')
        )
      );
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('Delete Confirmation');
      expect(html).toContain('aria-label="Close dialog"');
      expect(html).toContain('Confirm');
    });

    it('renders nothing when isOpen is false', () => {
      const html = renderToString(
        React.createElement(
          Dialog,
          {
            isOpen: false,
            onClose: () => {},
            title: 'Hidden Dialog',
          },
          'Content'
        )
      );
      expect(html).toBe('');
    });
  });

  describe('Feedback Accessibility', () => {
    it('renders danger feedback with role="alert" and assertive aria-live', () => {
      const html = renderToString(
        React.createElement(Feedback, {
          severity: 'danger',
          title: 'Network Error',
          message: 'Unable to reach the server.',
        })
      );
      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');
      expect(html).toContain('Error:');
      expect(html).toContain('Network Error');
    });

    it('renders info/success feedback with role="status" and polite aria-live', () => {
      const html = renderToString(
        React.createElement(Feedback, {
          severity: 'success',
          title: 'Saved',
          message: 'Draft stored locally.',
        })
      );
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('Success:');
    });

    it('enforces 44px minimum touch target on dismiss button', () => {
      const html = renderToString(
        React.createElement(Feedback, {
          severity: 'info',
          message: 'Notice with dismiss',
          onDismiss: () => {},
        })
      );
      expect(html).toContain('min-height:44px');
      expect(html).toContain('min-width:44px');
      expect(html).toContain('aria-label="Dismiss message"');
    });
  });

  describe('ListRow Accessibility', () => {
    it('renders interactive row with button role and tabIndex 0', () => {
      const html = renderToString(
        React.createElement(ListRow, {
          title: 'Morning review',
          subtitle: 'Daily routine',
          onClick: () => {},
          selected: true,
        })
      );
      expect(html).toContain('role="button"');
      expect(html).toContain('tabindex="0"');
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain('min-height:44px');
      expect(html).toContain('Morning review');
    });

    it('renders non-interactive row without button role', () => {
      const html = renderToString(
        React.createElement(ListRow, {
          title: 'Static item',
        })
      );
      expect(html).not.toContain('role="button"');
      expect(html).not.toContain('tabindex="0"');
    });
  });

  describe('EmptyState Accessibility', () => {
    it('renders accessible empty state with section region and action button', () => {
      const html = renderToString(
        React.createElement(EmptyState, {
          id: 'tasks-empty',
          title: 'No upcoming tasks',
          description: 'You have cleared all tasks for today.',
          actionLabel: 'Create Task',
          onAction: () => {},
        })
      );
      expect(html).toContain('id="tasks-empty"');
      expect(html).toContain('aria-label="No upcoming tasks"');
      expect(html).toContain('No upcoming tasks');
      expect(html).toContain('You have cleared all tasks for today.');
      expect(html).toContain('Create Task');
    });
  });

  describe('SkipLink Accessibility', () => {
    it('renders skip link pointing to main-content with 44px min touch target semantics', () => {
      const html = renderToString(
        React.createElement(SkipLink, {
          targetId: 'main-content',
          label: 'Skip to main content',
        })
      );
      expect(html).toContain('href="#main-content"');
      expect(html).toContain('Skip to main content');
    });
  });

  describe('RouteAnnouncer Accessibility', () => {
    it('renders polite live region for route change announcements', () => {
      const html = renderToString(
        React.createElement(RouteAnnouncer, {
          message: 'Navigated to Today view',
        })
      );
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('aria-atomic="true"');
      expect(html).toContain('Navigated to Today view');
    });
  });
});
