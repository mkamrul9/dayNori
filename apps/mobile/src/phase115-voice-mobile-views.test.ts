import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from './test-render.js';
import { AssistantSheet } from './views/AssistantSheet.js';
import { MockAudioRecorderAdapter } from '@daynori/domain';

describe('Phase 115: Mobile Native Voice Assistant Views and Gating Testing', () => {
  const mockApiClient = {
    listAssistantHistory: vi.fn().mockResolvedValue({ data: [] }),
    getAssistantDraft: vi.fn().mockResolvedValue({ data: null }),
    saveAssistantDraft: vi.fn().mockResolvedValue({}),
    clearAssistantDraft: vi.fn().mockResolvedValue({}),
    streamAssistantAsk: vi.fn(),
    deleteAssistantHistory: vi.fn().mockResolvedValue({}),
    transcribeAudio: vi.fn().mockResolvedValue({
      data: {
        transcriptionId: 'tx-test-115',
        transcript: 'Voice transcribed task on mobile',
        detectedLanguage: 'en',
        confidence: 0.96,
        durationSeconds: 4,
        wordsCount: 5,
        costMicroUsd: 80,
        retentionPolicy: 'transient_deleted',
        uncertainSpeech: false,
      },
    }),
  } as any;

  it('renders AssistantSheet with voice recording chip disabled when isGated=true', () => {
    let renderer: ReactTestRenderer;
    const recorder = new MockAudioRecorderAdapter({ permissionGranted: true, durationSeconds: 3 });

    act(() => {
      renderer = TestRenderer.create(
        React.createElement(AssistantSheet, {
          themeMode: 'light',
          workspaceId: 'ws-voice-test',
          apiClient: mockApiClient,
          isGated: true,
          recorderAdapter: recorder,
          onClose: () => {},
        })
      );
    });

    // Sheet and gated banner are present
    expect(renderer!.root.findByProps({ testID: 'assistant-sheet' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'assistant-gated-banner' })).toBeDefined();

    // Voice record button is disabled under isGated=true
    const voiceRecordBtn = renderer!.root.findByProps({ testID: 'assistant-voice-record-btn' });
    expect(voiceRecordBtn).toBeDefined();
    expect(voiceRecordBtn.props.disabled).toBe(true);

    // Verify typing input remains accessible fallback
    const input = renderer!.root.findByProps({ testID: 'input-assistant-prompt' });
    expect(input).toBeDefined();
  });

  it('provides accessible text typing fallback when microphone permission is denied', async () => {
    let renderer: ReactTestRenderer;
    const deniedRecorder = new MockAudioRecorderAdapter({ permissionGranted: false });

    act(() => {
      renderer = TestRenderer.create(
        React.createElement(AssistantSheet, {
          themeMode: 'light',
          workspaceId: 'ws-voice-test',
          apiClient: mockApiClient,
          isGated: false,
          recorderAdapter: deniedRecorder,
          onClose: () => {},
        })
      );
    });

    const input = renderer!.root.findByProps({ testID: 'input-assistant-prompt' });
    expect(input.props.editable).toBe(true);

    // Update input question
    act(() => {
      input.props.onChangeText('Typed question fallback');
    });

    expect(renderer!.root.findByProps({ testID: 'input-assistant-prompt' }).props.value).toBe(
      'Typed question fallback'
    );
  });
});
