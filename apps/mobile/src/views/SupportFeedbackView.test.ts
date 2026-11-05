import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SupportFeedbackView } from './SupportFeedbackView.js';
import { TestRenderer, act } from '../test-render.js';
import type { DaynoriApiClient } from '@daynori/api-client';

describe('SupportFeedbackView', () => {
  it('renders Bug form by default, switches types, and submits report durably', async () => {
    const onClose = vi.fn();
    const createFeedbackReport = vi.fn().mockResolvedValue({
      data: {
        id: 'rec-1234-uuid',
        clientReportId: 'client-5678-uuid',
        workspaceId: 'ws-example',
        reporterId: 'user-example',
        reportType: 'bug',
        category: 'ui',
        summary: 'Buttons are misaligned on tablet',
        description: 'When rotating to landscape on tablet, buttons overflow the card boundary.',
        includeDiagnostics: true,
        attachments: [],
        status: 'received',
        deliveryStatus: 'unconfigured',
        deliveryNotice: 'Receipt acknowledged by server. External developer inbox is not configured in this preview.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    const mockApiClient = {
      createFeedbackReport,
    } as unknown as DaynoriApiClient;

    const renderer = TestRenderer.create(
      React.createElement(SupportFeedbackView, {
        themeMode: 'light',
        userId: 'user-example',
        workspaceId: 'ws-example',
        apiClient: mockApiClient,
        onClose,
      })
    );

    // Switch to suggestion
    act(() => {
      renderer.root.findByProps({ testID: 'btn-type-suggestion' }).props.onPress();
    });

    // Enter summary and description
    act(() => {
      renderer.root
        .findByProps({ testID: 'native-feedback-summary' })
        .props.onChangeText('Add pure dark theme option');
    });

    act(() => {
      renderer.root
        .findByProps({ testID: 'native-feedback-description' })
        .props.onChangeText('Pure black OLED theme would save battery and look great.');
    });

    // Submit report
    await act(async () => {
      renderer.root.findByProps({ testID: 'btn-submit-feedback' }).props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(createFeedbackReport).toHaveBeenCalledTimes(1);
    expect(createFeedbackReport).toHaveBeenCalledWith(
      'ws-example',
      expect.objectContaining({
        reportType: 'suggestion',
        summary: 'Add pure dark theme option',
        description: 'Pure black OLED theme would save battery and look great.',
      })
    );

    // Verify receipt card is displayed
    const receiptCard = renderer.root.findByProps({ testID: 'native-feedback-receipt-card' });
    expect(receiptCard).toBeDefined();

    // Close button
    act(() => {
      renderer.root.findByProps({ testID: 'btn-close-feedback' }).props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    renderer.unmount();
  });

  it('preserves draft and allows retry when API request fails', async () => {
    const onClose = vi.fn();
    const createFeedbackReport = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network timeout connecting to server'))
      .mockResolvedValueOnce({
        data: {
          id: 'rec-retry-uuid',
          clientReportId: 'client-retry-uuid',
          workspaceId: 'ws-example',
          reporterId: 'user-example',
          reportType: 'bug',
          category: 'sync',
          summary: 'Sync conflict resolution failed',
          description: 'Conflict dialog does not dismiss after manual merge resolution.',
          includeDiagnostics: false,
          attachments: [],
          status: 'received',
          deliveryStatus: 'unconfigured',
          deliveryNotice: 'Receipt acknowledged by server.',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

    const mockApiClient = {
      createFeedbackReport,
    } as unknown as DaynoriApiClient;

    const renderer = TestRenderer.create(
      React.createElement(SupportFeedbackView, {
        themeMode: 'dark',
        userId: 'user-retry',
        workspaceId: 'ws-example',
        apiClient: mockApiClient,
        onClose,
      })
    );

    act(() => {
      renderer.root
        .findByProps({ testID: 'native-feedback-summary' })
        .props.onChangeText('Sync conflict resolution failed');
    });

    act(() => {
      renderer.root
        .findByProps({ testID: 'native-feedback-description' })
        .props.onChangeText('Conflict dialog does not dismiss after manual merge resolution.');
    });

    // First attempt fails
    await act(async () => {
      renderer.root.findByProps({ testID: 'btn-submit-feedback' }).props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(createFeedbackReport).toHaveBeenCalledTimes(1);

    // Retry button is displayed
    const retryBtn = renderer.root.findByProps({ testID: 'btn-retry-feedback' });
    expect(retryBtn).toBeDefined();

    // Second attempt (retry) succeeds
    await act(async () => {
      retryBtn.props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(createFeedbackReport).toHaveBeenCalledTimes(2);

    const receiptCard = renderer.root.findByProps({ testID: 'native-feedback-receipt-card' });
    expect(receiptCard).toBeDefined();

    renderer.unmount();
  });
});
