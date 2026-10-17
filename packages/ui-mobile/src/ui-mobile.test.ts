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
});
