import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from './test-render.js';
import { describe, expect, it, vi } from 'vitest';
import { SettingsView } from './views/SettingsView.js';

describe('Phase 85: Native Settings Notifications View Suite', () => {
  it('renders truthful permission status, channels, preview privacy, and test notification actions', async () => {
    const onRequestPermission = vi.fn();
    const onSendTestNotification = vi.fn().mockResolvedValue(true);
    const onOptOut = vi.fn();
    const onChangePrivacy = vi.fn();

    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
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
            status: 'granted',
            canDeliverLocally: true,
            canDeliverPush: true,
            hasPushToken: true,
            pushTokenType: 'fcm',
            isExactAlarmPermitted: false,
            platform: 'android',
            details: 'Local reminders and server push fallback are active.',
          },
          privacyMode: 'generic',
          onChangePrivacyMode: onChangePrivacy,
          onRequestNotificationPermission: onRequestPermission,
          onSendTestNotification,
          onOptOutNotifications: onOptOut,
        })
      );
    });

    // Verify capability details & status badges
    const statusBadge = renderer!.root.findByProps({
      testID: 'mobile-notification-permission-status',
    });
    expect(statusBadge).toBeDefined();

    const details = renderer!.root.findByProps({
      testID: 'mobile-notification-capability-details',
    });
    expect(details).toBeDefined();

    // Privacy radio options
    const privacyGeneric = renderer!.root.findByProps({ testID: 'privacy-mode-generic' });
    expect(privacyGeneric).toBeDefined();
    const privacyDetailed = renderer!.root.findByProps({ testID: 'privacy-mode-detailed' });
    expect(privacyDetailed).toBeDefined();

    // Test notification button
    const testBtn = renderer!.root.findByProps({ testID: 'btn-send-test-notification' });
    expect(testBtn).toBeDefined();

    // Opt out button when granted
    const optOutBtn = renderer!.root.findByProps({ testID: 'btn-opt-out-notifications' });
    expect(optOutBtn).toBeDefined();

    // Trigger test notification
    await act(async () => {
      await testBtn.props.onPress();
    });

    expect(onSendTestNotification).toHaveBeenCalledTimes(1);
    const feedback = renderer!.root.findByProps({ testID: 'mobile-test-notification-feedback' });
    expect(feedback).toBeDefined();
  });

  it('renders permission request button when permission is not yet granted', () => {
    const onRequestPermission = vi.fn();

    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
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
            status: 'undetermined',
            canDeliverLocally: false,
            canDeliverPush: false,
            hasPushToken: false,
            pushTokenType: 'none',
            isExactAlarmPermitted: false,
            platform: 'android',
            details: 'Notifications not enabled.',
          },
          onRequestNotificationPermission: onRequestPermission,
        })
      );
    });

    const reqBtn = renderer!.root.findByProps({ testID: 'btn-request-notification-permission' });
    expect(reqBtn).toBeDefined();
    expect(() => renderer!.root.findByProps({ testID: 'btn-opt-out-notifications' })).toThrow();
  });
});
