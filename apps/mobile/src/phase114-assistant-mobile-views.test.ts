import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from './test-render.js';
import { AssistantSheet } from './views/AssistantSheet.js';

describe('Phase 114: Mobile Native AssistantSheet Interface Testing', () => {
  const mockApiClient = {
    listAssistantHistory: vi.fn().mockResolvedValue({ data: [] }),
    getAssistantDraft: vi.fn().mockResolvedValue({ data: null }),
    saveAssistantDraft: vi.fn().mockResolvedValue({}),
    clearAssistantDraft: vi.fn().mockResolvedValue({}),
    streamAssistantAsk: vi.fn(),
    deleteAssistantHistory: vi.fn().mockResolvedValue({}),
    createAiProposal: vi.fn().mockResolvedValue({
      data: {
        id: 'prop-test-001',
        workspaceId: 'ws-test',
        operation: 'create_personal_note',
        status: 'pending',
        reviewSummary: { headline: 'Create a personal note', kind: 'note' },
        payload: { title: 'Test Proposal Note', plainText: 'Proposal content' },
        confirmationToken: 'token-abc-123',
      },
    }),
    confirmAiProposal: vi.fn().mockResolvedValue({
      data: {
        id: 'prop-test-001',
        status: 'confirmed',
        executionReceipt: {
          kind: 'note',
          id: 'note-1111-2222',
          deepLink: '/library?noteId=note-1111-2222',
        },
      },
    }),
  } as any;

  it('renders AssistantSheet with truthful gated banner when isGated=true under DEF-V2-008', () => {
    let closed = false;
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        React.createElement(AssistantSheet, {
          themeMode: 'light',
          workspaceId: 'ws-test',
          apiClient: mockApiClient,
          isGated: true,
          onClose: () => {
            closed = true;
          },
        })
      );
    });

    // Sheet and gated banner are present
    expect(renderer!.root.findByProps({ testID: 'assistant-sheet' })).toBeDefined();
    const banner = renderer!.root.findByProps({ testID: 'assistant-gated-banner' });
    expect(banner).toBeDefined();

    // Ask button is disabled
    const askBtn = renderer!.root.findByProps({ testID: 'btn-assistant-ask' });
    expect(askBtn.props.disabled).toBe(true);

    // Close button functions
    const closeBtn = renderer!.root.findByProps({ testID: 'btn-assistant-close' });
    act(() => {
      closeBtn.props.onPress();
    });
    expect(closed).toBe(true);
    renderer!.unmount();
  });

  it('enables text input and ask button when ungated (isGated=false)', () => {
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        React.createElement(AssistantSheet, {
          themeMode: 'light',
          workspaceId: 'ws-test',
          apiClient: mockApiClient,
          isGated: false,
          onClose: () => {},
        })
      );
    });

    // Gated banner must not be present
    expect(() => renderer!.root.findByProps({ testID: 'assistant-gated-banner' })).toThrow();

    // Input accepts text
    const input = renderer!.root.findByProps({ testID: 'input-assistant-prompt' });
    act(() => {
      input.props.onChangeText('What tasks are scheduled for tomorrow?');
    });

    // Ask button enabled
    const askBtn = renderer!.root.findByProps({ testID: 'btn-assistant-ask' });
    expect(askBtn.props.disabled).toBe(false);
    renderer!.unmount();
  });
});
