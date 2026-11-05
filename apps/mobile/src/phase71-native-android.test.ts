import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from './test-render.js';
import { SettingsView } from './views/SettingsView.js';
import { SettingsHubView } from './views/SettingsHubView.js';
import {
  MOBILE_SETTINGS_GROUPS,
  SETTINGS_NESTED_MODALS,
  getMobileSettingsGroup,
} from './settings/settingsGroups.js';

describe('Phase 71 native Settings groups and hub', () => {
  it('exposes six focused Settings groups with stable ids', () => {
    expect(MOBILE_SETTINGS_GROUPS.map((g) => g.id)).toEqual([
      'account',
      'appearance',
      'notifications',
      'workspace',
      'privacy',
      'help',
    ]);
    expect(getMobileSettingsGroup('privacy')?.title).toMatch(/Privacy/i);
  });

  it('lists nested Settings overlays that return to hub on Back', () => {
    expect(SETTINGS_NESTED_MODALS.has('gallery')).toBe(true);
    expect(SETTINGS_NESTED_MODALS.has('all-features')).toBe(true);
    expect(SETTINGS_NESTED_MODALS.has('account-deletion')).toBe(true);
    expect(SETTINGS_NESTED_MODALS.has('create')).toBe(false);
  });

  it('opens hub groups and closes via Done', () => {
    const opened: string[] = [];
    let closed = false;
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(SettingsHubView, {
          themeMode: 'light',
          onOpenGroup: (id) => opened.push(id),
          onClose: () => {
            closed = true;
          },
        })
      );
    });
    const appearance = renderer!.root.findByProps({ testID: 'settings-group-appearance' });
    act(() => {
      appearance.props.onPress();
    });
    expect(opened).toEqual(['appearance']);
    const done = renderer!.root.findByProps({ accessibilityLabel: 'Close settings' });
    act(() => {
      done.props.onPress();
    });
    expect(closed).toBe(true);
  });

  it('scopes appearance content and omits account auth section', () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(SettingsView, {
          themeMode: 'dark',
          group: 'appearance',
          onBackToHub: () => {},
          onToggleTheme: () => {},
          textScale: 1,
          onChangeTextScale: () => {},
          isAuthenticated: false,
          onToggleAuth: () => {},
          onClose: () => {},
        })
      );
    });
    expect(renderer!.root.findByProps({ testID: 'settings-view' })).toBeDefined();
    expect(renderer!.root.findByProps({ accessibilityLabel: 'Switch to light theme' })).toBeDefined();
    expect(() =>
      renderer!.root.findByProps({ accessibilityLabel: 'Sign in or create account' })
    ).toThrow();
  });

  it('scopes notifications and privacy groups without appearance controls', () => {
    let notifications: ReactTestRenderer;
    act(() => {
      notifications = TestRenderer.create(
        React.createElement(SettingsView, {
          themeMode: 'light',
          group: 'notifications',
          onBackToHub: () => {},
          onToggleTheme: () => {},
          textScale: 1,
          onChangeTextScale: () => {},
          isAuthenticated: true,
          onToggleAuth: () => {},
          onClose: () => {},
          notificationCapability: {
            status: 'denied',
            canDeliverLocally: false,
            canDeliverPush: false,
            hasPushToken: false,
            pushTokenType: 'none',
            isExactAlarmPermitted: false,
            platform: 'android',
            details: 'test',
          },
        })
      );
    });
    expect(
      notifications!.root.findByProps({ testID: 'mobile-notification-permission-status' })
    ).toBeDefined();
    expect(() =>
      notifications!.root.findByProps({ accessibilityLabel: 'Switch to dark theme' })
    ).toThrow();

    let privacy: ReactTestRenderer;
    act(() => {
      privacy = TestRenderer.create(
        React.createElement(SettingsView, {
          themeMode: 'light',
          group: 'privacy',
          onBackToHub: () => {},
          onToggleTheme: () => {},
          textScale: 1,
          onChangeTextScale: () => {},
          isAuthenticated: true,
          onToggleAuth: () => {},
          onClose: () => {},
          onOpenSyncDiagnostics: () => {},
          onOpenRecoveryExport: () => {},
          onOpenPortability: () => {},
          onOpenAccountDeletion: () => {},
        })
      );
    });
    expect(privacy!.root.findByProps({ testID: 'btn-open-sync-diagnostics' })).toBeDefined();
    expect(privacy!.root.findByProps({ testID: 'btn-open-account-deletion' })).toBeDefined();
  });

  it('denies ordinary users gallery and vault harness entry points', () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(SettingsView, {
          themeMode: 'light',
          group: 'workspace',
          onBackToHub: () => {},
          onToggleTheme: () => {},
          textScale: 1,
          onChangeTextScale: () => {},
          isAuthenticated: true,
          onToggleAuth: () => {},
          isOperator: false,
          onClose: () => {},
          onOpenAllFeatures: () => {},
        })
      );
    });
    expect(renderer!.root.findByProps({ testID: 'btn-open-all-features' })).toBeDefined();
    expect(() =>
      renderer!.root.findByProps({ accessibilityLabel: 'Open Component Gallery' })
    ).toThrow();
    expect(() =>
      renderer!.root.findByProps({ testID: 'btn-open-vault-harness' })
    ).toThrow();
  });

  it('wires help tutorial replay without privacy export controls', () => {
    const openOnboarding = vi.fn();
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(SettingsView, {
          themeMode: 'light',
          group: 'help',
          onBackToHub: () => {},
          onToggleTheme: () => {},
          textScale: 1,
          onChangeTextScale: () => {},
          isAuthenticated: false,
          onToggleAuth: () => {},
          onClose: () => {},
          onOpenOnboarding: openOnboarding,
        })
      );
    });
    const replay = renderer!.root.findByProps({ testID: 'btn-replay-tutorial' });
    act(() => {
      replay.props.onPress();
    });
    expect(openOnboarding).toHaveBeenCalledTimes(1);
    expect(() =>
      renderer!.root.findByProps({ testID: 'btn-open-workspace-portability' })
    ).toThrow();
  });
});
