import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { colors, getContrastRatio, radii } from '@daynori/design-tokens';
import {
  Checkbox,
  Coachmark,
  CreationMenu,
  ErrorRetryPanel,
  IconButton,
  LoadingState,
  NavItem,
  RadioGroup,
  ReorderControls,
  SegmentedControl,
  Switch,
  SyncStatusBadge,
  TextArea,
  TextLink,
} from './index.js';

describe('Phase 68 Warm notebook primitives', () => {
  it('uses Warm radii on TextArea borders', () => {
    expect(radii.sm).toBe(10);
    const html = renderToString(
      React.createElement(TextArea, { label: 'Entry', defaultValue: 'বাংলা নমুনা' })
    );
    expect(html).toContain('border-radius:10px');
    expect(html).toContain('Entry');
  });

  it('associates TextArea errors with aria-invalid', () => {
    const html = renderToString(
      React.createElement(TextArea, {
        label: 'Title',
        errorMessage: 'Required',
        defaultValue: 'kept',
      })
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Required');
    expect(html).toContain('kept');
  });

  it('gives IconButton an accessible name without duplicate icon text', () => {
    const html = renderToString(
      React.createElement(IconButton, { label: 'Search', icon: 'search' })
    );
    expect(html).toContain('aria-label="Search"');
    expect(html).toContain('aria-hidden="true"');
  });

  it('renders TextLink with action color contrast', () => {
    const html = renderToString(
      React.createElement(TextLink, { href: '/help', children: 'Open Help' })
    );
    expect(html).toContain('Open Help');
    expect(html).toContain('color:#146B63');
    expect(
      getContrastRatio(colors.light.action.primary, colors.light.background)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('Checkbox and Radio expose labels and invalid state', () => {
    const check = renderToString(
      React.createElement(Checkbox, { label: 'Remember device', errorMessage: 'Required' })
    );
    expect(check).toContain('Remember device');
    expect(check).toContain('type="checkbox"');
    expect(check).toContain('role="alert"');

    const radios = renderToString(
      React.createElement(RadioGroup, {
        legend: 'Priority',
        name: 'pri',
        value: 'high',
        onChange: () => undefined,
        options: [
          { value: 'none', label: 'None' },
          { value: 'high', label: 'High' },
        ],
      })
    );
    expect(radios).toContain('role="radiogroup"');
    expect(radios).toContain('High');
  });

  it('Switch exposes role=switch and checked state', () => {
    const html = renderToString(
      React.createElement(Switch, {
        label: 'Reduced motion',
        checked: true,
        onCheckedChange: () => undefined,
      })
    );
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
  });

  it('SegmentedControl marks selected tab', () => {
    const html = renderToString(
      React.createElement(SegmentedControl, {
        label: 'Plan views',
        value: 'tasks',
        onChange: () => undefined,
        options: [
          { value: 'tasks', label: 'Tasks' },
          { value: 'routines', label: 'Routines' },
        ],
      })
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('Tasks');
  });

  it('SyncStatusBadge pairs status color with text', () => {
    const html = renderToString(React.createElement(SyncStatusBadge, { status: 'device' }));
    expect(html).toContain('Saved on this device');
    expect(html).toContain('role="status"');
  });

  it('Loading and error/retry feedback are announced', () => {
    expect(renderToString(React.createElement(LoadingState, { label: 'Loading tasks' }))).toContain(
      'role="status"'
    );
    const err = renderToString(
      React.createElement(ErrorRetryPanel, {
        title: 'Could not save',
        description: 'Your draft is kept.',
        onRetry: () => undefined,
      })
    );
    expect(err).toContain('role="alert"');
    expect(err).toContain('Retry');
  });

  it('CreationMenu is a dialog when open', () => {
    const html = renderToString(
      React.createElement(CreationMenu, {
        open: true,
        onClose: () => undefined,
        items: [{ id: 'note', label: 'Note', icon: 'note', onSelect: () => undefined }],
      })
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Note');
  });

  it('ReorderControls expose move up/down names', () => {
    const html = renderToString(
      React.createElement(ReorderControls, {
        label: 'Block A',
        canMoveUp: true,
        canMoveDown: false,
        onMoveUp: () => undefined,
        onMoveDown: () => undefined,
      })
    );
    expect(html).toContain('Move Block A up');
    expect(html).toContain('Move Block A down');
  });

  it('Coachmark presents titled learning content', () => {
    const html = renderToString(
      React.createElement(Coachmark, {
        open: true,
        title: 'Find Create',
        description: 'Use the header Create control.',
        stepLabel: 'Step 1 of 4',
        onContinue: () => undefined,
        onExit: () => undefined,
      })
    );
    expect(html).toContain('Find Create');
    expect(html).toContain('role="dialog"');
  });

  it('NavItem exposes selected page state and long Bangla labels', () => {
    const html = renderToString(
      React.createElement(NavItem, {
        label: 'আজকের কাজ',
        icon: 'sun',
        selected: true,
      })
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('আজকের কাজ');
  });
});
