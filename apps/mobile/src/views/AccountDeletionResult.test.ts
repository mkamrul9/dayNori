import React from 'react';
import { expect, it, vi } from 'vitest';
import { MobileAccountDeletionSheet } from '@daynori/ui-mobile';
import { TestRenderer, act } from '../test-render.js';

it.each(['processing', 'completed', 'failed', 'scheduled'] as const)(
  'presents account deletion status %s without overstating erasure',
  async (status) => {
    const confirm = vi.fn().mockResolvedValue({
      success: status !== 'failed',
      deletionId: crypto.randomUUID(),
      status,
      message: 'Synthetic deletion response',
    });
    const renderer = TestRenderer.create(
      React.createElement(MobileAccountDeletionSheet, {
        visible: true,
        onClose: vi.fn(),
        onRequestDeletion: async () => ({
          deletionId: crypto.randomUUID(),
          status: 'pending_confirmation' as const,
          confirmationRequired: true,
          confirmationToken: 'synthetic-confirmation',
          retainedDataDisclosure: 'Synthetic retention disclosure',
        }),
        onConfirmDeletion: confirm,
      })
    );
    try {
      act(() =>
        renderer.root
          .findByProps({ testID: 'mobile-input-delete-password' })
          .props.onChangeText('synthetic-password')
      );
      act(() =>
        renderer.root.findByProps({ testID: 'mobile-btn-request-deletion' }).props.onPress()
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      act(() =>
        renderer.root.findByProps({ testID: 'mobile-btn-confirm-deletion' }).props.onPress()
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      const rendered = JSON.stringify(renderer.toJSON());
      if (status === 'processing') {
        expect(rendered).toContain('Cleanup Pending');
        expect(rendered).toContain('full deletion has not been confirmed');
        expect(rendered).not.toContain('Your account and data have been removed');
      } else if (status === 'completed') {
        expect(rendered).toContain('Your account and data have been removed');
      } else {
        expect(rendered).toContain('Deletion could not be confirmed');
        expect(rendered).not.toContain('Your account and data have been removed');
      }
    } finally {
      renderer.unmount();
    }
  }
);
