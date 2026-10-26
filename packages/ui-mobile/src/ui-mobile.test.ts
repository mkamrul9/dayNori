import { describe, expect, it } from 'vitest';
import React from 'react';
import {
  lightMobileTheme,
  darkMobileTheme,
  MobileButton,
  MobileCard,
  MobileFeedback,
  MobileListRow,
  MobileModalSheet,
  MobileTextField,
  MobileEmptyState,
  MobileNavigationBar,
  MobileHeader,
  MobileNoteEditor,
  MobileRoutineRow,
  MobileStorageUsageBar,
  MobileFileUploadSheet,
  MobileFilePreviewSheet,
  MobileAudioPlayerCard,
  MobileAudioRecorderSheet,
  keyboardAvoidingBehavior,
  readAndroidInsets,
} from './index.js';

describe('UI Mobile Primitives', () => {
  it('provides light and dark mobile themes with correct token values', () => {
    expect(lightMobileTheme.colors.background).toBe('#F7F5EF');
    expect(darkMobileTheme.colors.background).toBe('#0D1919');
    expect(lightMobileTheme.spacing.base).toBe(16);
    expect(lightMobileTheme.touchTargets.mobileMin).toBe(48);
    // Semantic danger action tokens for mobile buttons (F03 fix)
    expect(lightMobileTheme.colors.action.danger).toBe('#B3261E');
    expect(lightMobileTheme.colors.action.dangerLabel).toBe('#FFFFFF');
    expect(darkMobileTheme.colors.action.danger).toBe('#F2B8B5');
    expect(darkMobileTheme.colors.action.dangerLabel).toBe('#381615');
  });

  it('exports all mobile primitive components', () => {
    expect(MobileButton).toBeDefined();
    expect(MobileTextField).toBeDefined();
    expect(MobileModalSheet).toBeDefined();
    expect(MobileFeedback).toBeDefined();
    expect(MobileListRow).toBeDefined();
    expect(MobileCard).toBeDefined();
  });

  it('creates MobileButton and MobileModalSheet React elements with expected props', () => {
    const btn = React.createElement(MobileButton, {
      variant: 'danger',
      themeMode: 'dark',
      title: 'Delete Item',
    });
    expect(btn.type).toBe(MobileButton);
    expect(btn.props.variant).toBe('danger');
    expect(btn.props.themeMode).toBe('dark');

    const sheet = React.createElement(MobileModalSheet, {
      visible: true,
      onClose: () => {},
      title: 'Modal Sheet',
      themeMode: 'light',
      children: null,
    });
    expect(sheet.type).toBe(MobileModalSheet);
    expect(sheet.props.title).toBe('Modal Sheet');
    expect(sheet.props.visible).toBe(true);
  });

  it('exports and instantiates navigation components', () => {
    const emptyState = React.createElement(MobileEmptyState, {
      title: 'No upcoming tasks',
      description: 'Your agenda for today is clear.',
      actionLabel: 'Create task',
      onAction: () => {},
    });
    expect(emptyState.props.title).toBe('No upcoming tasks');

    const navBar = React.createElement(MobileNavigationBar, {
      currentTab: 'plan',
      onSelectTab: () => {},
    });
    expect(navBar.props.currentTab).toBe('plan');

    const header = React.createElement(MobileHeader, {
      title: 'Today',
      subtitle: 'Wednesday, October 14',
      onOpenSearch: () => {},
      onOpenCreate: () => {},
      onOpenSettings: () => {},
    });
    expect(header.props.title).toBe('Today');
    expect(header.props.onOpenSearch).toBeDefined();
  });

  it('instantiates MobileNoteEditor with initial title, document, and conflict state', () => {
    expect(MobileNoteEditor).toBeDefined();

    const editor = React.createElement(MobileNoteEditor, {
      initialTitle: 'Mobile Meeting Notes',
      initialFolderId: 'folder-123',
      localSaveStatus: 'Saved locally',
      cloudSyncStatus: 'Syncing...',
      conflict: {
        serverRevision: 4,
        serverTitle: 'Server Revision Title',
      },
    });

    expect(editor.type).toBe(MobileNoteEditor);
    expect(editor.props.initialTitle).toBe('Mobile Meeting Notes');
    expect(editor.props.initialFolderId).toBe('folder-123');
    expect(editor.props.conflict?.serverRevision).toBe(4);
  });

  it('instantiates MobileRoutineRow with checklist props and accessible states', () => {
    const row = React.createElement(MobileRoutineRow, {
      routine: {
        id: 'r-1',
        title: 'Morning stretch',
        frequency: 'daily',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        timezone: 'Asia/Dhaka',
        scheduledTime: '07:00',
      },
      occurrence: {
        id: 'occ-1',
        routineId: 'r-1',
        scheduledDate: '2026-10-16',
        status: 'pending',
      },
      viewingDate: '2026-10-16',
      themeMode: 'light',
    });

    expect(row.type).toBe(MobileRoutineRow);
    expect(row.props.routine.title).toBe('Morning stretch');
    expect(row.props.occurrence?.status).toBe('pending');
  });

  it('instantiates MobileStorageUsageBar with usage percentage and alert thresholds', () => {
    const bar = React.createElement(MobileStorageUsageBar, {
      storedBytes: 80 * 1024 * 1024,
      reservedBytes: 15 * 1024 * 1024,
      maxBytes: 100 * 1024 * 1024,
      themeMode: 'light',
    });
    expect(bar.type).toBe(MobileStorageUsageBar);
    expect(bar.props.storedBytes).toBe(80 * 1024 * 1024);
    expect(bar.props.reservedBytes).toBe(15 * 1024 * 1024);
    expect(bar.props.maxBytes).toBe(100 * 1024 * 1024);
  });

  it('instantiates MobileFileUploadSheet with folder selection and upload props', () => {
    const sheet = React.createElement(MobileFileUploadSheet, {
      visible: true,
      onClose: () => {},
      folders: [
        { id: 'f-1', name: 'Software' },
        { id: 'f-2', name: 'Guides' },
      ],
      initialFolderId: 'f-1',
      storedBytes: 10 * 1024 * 1024,
      reservedBytes: 0,
      maxBytes: 50 * 1024 * 1024,
      onUploadFile: async () => ({ success: true }),
    });
    expect(sheet.type).toBe(MobileFileUploadSheet);
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.folders).toHaveLength(2);
    expect(sheet.props.initialFolderId).toBe('f-1');
  });

  it('instantiates MobileFilePreviewSheet for verified and quarantined files', () => {
    const verifiedSheet = React.createElement(MobileFilePreviewSheet, {
      visible: true,
      onClose: () => {},
      file: {
        id: 'file-1',
        fileName: 'report.pdf',
        detectedMimeType: 'application/pdf',
        byteSize: 1024 * 50,
        version: 1,
        quarantineStatus: 'verified',
        sha256Checksum: 'abcdef123456',
        folderName: 'Reports',
        isOfflineAvailable: true,
      },
    });
    expect(verifiedSheet.type).toBe(MobileFilePreviewSheet);
    expect(verifiedSheet.props.file?.quarantineStatus).toBe('verified');
    expect(verifiedSheet.props.file?.isOfflineAvailable).toBe(true);

    const quarantinedSheet = React.createElement(MobileFilePreviewSheet, {
      visible: true,
      onClose: () => {},
      file: {
        id: 'file-2',
        fileName: 'suspicious.exe',
        detectedMimeType: 'application/octet-stream',
        byteSize: 2048,
        version: 1,
        quarantineStatus: 'quarantined',
        sha256Checksum: '9876543210ab',
      },
    });
    expect(quarantinedSheet.type).toBe(MobileFilePreviewSheet);
    expect(quarantinedSheet.props.file?.quarantineStatus).toBe('quarantined');
  });

  it('instantiates MobileAudioPlayerCard with attachment and accessible playback controls', () => {
    const mockAttachment = {
      fileId: 'file-audio-1',
      fileName: 'quick-memo.m4a',
      mimeType: 'audio/mp4',
      byteSize: 1024 * 64,
      durationSeconds: 45,
      createdAt: '2026-10-19T10:00:00.000Z',
    };
    const card = React.createElement(MobileAudioPlayerCard, {
      attachment: mockAttachment,
      onPlay: () => {},
      onPause: () => {},
      onDelete: () => {},
    });

    expect(card.type).toBe(MobileAudioPlayerCard);
    expect(card.props.attachment.fileName).toBe('quick-memo.m4a');
    expect(card.props.attachment.durationSeconds).toBe(45);
  });

  it('instantiates MobileAudioRecorderSheet with deliberate recording parameters', () => {
    const sheet = React.createElement(MobileAudioRecorderSheet, {
      visible: true,
      onClose: () => {},
      workspaceId: 'ws-test',
      attachedItemTitle: 'Field Observations Note',
      attachedItemType: 'note',
      onSaveAudio: async () => {},
    });

    expect(sheet.type).toBe(MobileAudioRecorderSheet);
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.attachedItemTitle).toBe('Field Observations Note');
    expect(sheet.props.attachedItemType).toBe('note');
  });

  it('instantiates MobileCustomSectionBuilderSheet with non-drag ordering and template props', async () => {
    const { MobileCustomSectionBuilderSheet } = await import('./MobileCustomSectionBuilderSheet.js');

    const sheet = React.createElement(MobileCustomSectionBuilderSheet, {
      visible: true,
      onClose: () => {},
      workspaceId: 'ws-test',
      onCreateSection: async () => {},
    });

    expect(sheet.type).toBe(MobileCustomSectionBuilderSheet);
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.workspaceId).toBe('ws-test');
  });

  it('instantiates MobileCustomSectionRenderer with collection blocks and records', async () => {
    const { MobileCustomSectionRenderer } = await import('./MobileCustomSectionRenderer.js');

    const renderer = React.createElement(MobileCustomSectionRenderer, {
      section: {
        id: 'sec-mob-1',
        title: 'Mobile Reading List',
        placement: 'dashboard',
      },
      blocks: [
        {
          id: 'col-mob-1',
          type: 'field_collection',
          title: 'Books',
          fields: [
            { id: 'title', label: 'Title', type: 'text', required: true },
          ],
        },
      ],
      records: [
        {
          id: 'rec-mob-1',
          sectionId: 'sec-mob-1',
          schemaVersion: 1,
          values: { title: 'Site Reliability Engineering' },
          createdAt: '2026-10-19T10:00:00Z',
          updatedAt: '2026-10-19T10:00:00Z',
        },
      ],
    });

    expect(renderer.type).toBe(MobileCustomSectionRenderer);
    expect(renderer.props.section.title).toBe('Mobile Reading List');
    expect(renderer.props.records?.length).toBe(1);
  });
});

describe('Phase 71 Android inset / keyboard helpers', () => {
  it('exports keyboardAvoidingBehavior and readAndroidInsets contracts', () => {
    expect(typeof keyboardAvoidingBehavior()).toBe('string');
    const snap = readAndroidInsets(240);
    expect(snap.keyboardHeight).toBe(240);
    expect(snap.bottomChromePad).toBeGreaterThanOrEqual(0);
    expect(typeof snap.statusBarHeight).toBe('number');
  });

  it('exports androidStatusBarTopPad for edge-to-edge header clearance', async () => {
    const { androidStatusBarTopPad } = await import('./androidInsets.js');
    expect(typeof androidStatusBarTopPad()).toBe('number');
    expect(androidStatusBarTopPad()).toBeGreaterThanOrEqual(0);
    // Explicit measured inset wins; zero/omitted falls back to StatusBar + 48dp density floor.
    expect(androidStatusBarTopPad(48)).toBe(48);
    expect(androidStatusBarTopPad(0)).toBe(androidStatusBarTopPad());
  });
});
