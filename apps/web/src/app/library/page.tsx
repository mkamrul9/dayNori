'use client';

import React, { useState } from 'react';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import { Button, Card, Dialog, Feedback, TextField } from '@daynori/ui-web';
import { useShell } from '../../components/ShellContext';

export default function LibraryPage() {
  const { themeMode, openModal } = useShell();
  const palette = colors[themeMode];

  const [typeFilter, setTypeFilter] = useState<'all' | 'notes' | 'knowledge' | 'files'>('all');
  const [selectedFolder, setSelectedFolder] = useState<string>('Software');
  const [isFolderModalOpen, setFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const libraryItems = [
    {
      id: 'i1',
      folder: 'Software',
      title: 'TypeScript handbook reference',
      type: 'knowledge',
      ext: '.md',
    },
    {
      id: 'i2',
      folder: 'Software',
      title: 'Architecture guidelines handbook.pdf',
      type: 'files',
      ext: '.pdf',
    },
    {
      id: 'i3',
      folder: 'Software',
      title: 'New offline sync engine idea',
      type: 'notes',
      ext: '.txt',
    },
    {
      id: 'i4',
      folder: 'Government jobs',
      title: 'Government Application Form.pdf',
      type: 'files',
      ext: '.pdf',
    },
    {
      id: 'i5',
      folder: 'Government jobs',
      title: 'Interview technical prep checklist',
      type: 'notes',
      ext: '.md',
    },
    {
      id: 'i6',
      folder: 'Personal',
      title: 'Morning study routine note',
      type: 'notes',
      ext: '.txt',
    },
    {
      id: 'i7',
      folder: 'Personal',
      title: 'Today I learned - Web Accessibility',
      type: 'knowledge',
      ext: '.md',
    },
    {
      id: 'i8',
      folder: 'Learning',
      title: 'Exam preparation syllabus',
      type: 'knowledge',
      ext: '.pdf',
    },
    {
      id: 'i9',
      folder: 'Inbox',
      title: 'Quick unorganized thought draft',
      type: 'notes',
      ext: '.txt',
    },
  ];

  const folders = ['Inbox', 'Software', 'Government jobs', 'Personal', 'Learning'];

  const filteredItems = libraryItems.filter((item) => {
    if (selectedFolder !== 'All' && item.folder !== selectedFolder) return false;
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;
    return true;
  });

  return (
    <div
      style={{
        maxWidth: '860px',
        margin: '0 auto',
        padding: `${spacing.lg}px ${spacing.base}px`,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
          marginBottom: `${spacing.base}px`,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: `${typography.webScale.welcomeTitle}px`,
              fontWeight: 800,
              color: palette.text.primary,
            }}
          >
            Library
          </h1>
          <p style={{ margin: '4px 0 0 0', color: palette.text.secondary }}>
            One canonical workspace folder hierarchy for notes, reference knowledge, and files.
          </p>
        </div>

        <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
          <Button
            size="compact"
            variant="secondary"
            themeMode={themeMode}
            onClick={() => setFolderModalOpen(true)}
          >
            📁 New Folder
          </Button>
          <Button
            size="compact"
            variant="primary"
            themeMode={themeMode}
            onClick={() => openModal('create')}
          >
            ＋ Add Item
          </Button>
        </div>
      </div>

      {/* Canonical Hierarchy Invariant Notice */}
      <div style={{ marginBottom: `${spacing.base}px` }}>
        <Feedback
          severity="info"
          message="One workspace folder hierarchy is the source of truth. Software can contain notes, files, and tasks together. Filtering by Notes or Files displays matching records within the same canonical folders without moving content."
          themeMode={themeMode}
        />
      </div>

      {/* Module Filters Bar */}
      <div
        role="group"
        aria-label="Filter library records by type"
        style={{
          display: 'flex',
          gap: `${spacing.xs}px`,
          marginBottom: `${spacing.base}px`,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 600, color: palette.text.secondary }}>
          Type Filter:
        </span>
        {(['all', 'notes', 'knowledge', 'files'] as const).map((filter) => (
          <button
            key={filter}
            type="button"
            aria-pressed={typeFilter === filter}
            onClick={() => setTypeFilter(filter)}
            style={{
              padding: '6px 14px',
              borderRadius: `${radii.pill}px`,
              border: `1px solid ${
                typeFilter === filter ? palette.action.primary : palette.border.subtle
              }`,
              backgroundColor: typeFilter === filter ? palette.surfaceRaised : palette.surface,
              color: typeFilter === filter ? palette.action.primary : palette.text.primary,
              fontWeight: typeFilter === filter ? 700 : 500,
              fontSize: '13px',
              cursor: 'pointer',
              minHeight: `${touchTargets.webMin}px`,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {filter === 'all' ? 'All Items' : filter.charAt(0).toUpperCase() + filter.slice(1)}
          </button>
        ))}
      </div>

      {/* Folder Breadcrumb & Navigation */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: `${spacing.base}px`,
        }}
      >
        {/* Left: Folder Picker */}
        <Card themeMode={themeMode}>
          <h2
            style={{
              margin: 0,
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
              marginBottom: `${spacing.sm}px`,
            }}
          >
            Workspace Folders
          </h2>
          <div role="list" aria-label="Workspace folders">
            {folders.map((folder) => {
              const isSelected = selectedFolder === folder;
              return (
                <div
                  key={folder}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: `${touchTargets.webMin}px`,
                    padding: `${spacing.xs}px ${spacing.sm}px`,
                    borderRadius: `${radii.sm}px`,
                    backgroundColor: isSelected ? palette.surfaceRaised : 'transparent',
                    borderLeft: isSelected
                      ? `3px solid ${palette.action.primary}`
                      : '3px solid transparent',
                    cursor: 'pointer',
                    color: isSelected ? palette.action.primary : palette.text.primary,
                    fontWeight: isSelected ? 700 : 500,
                  }}
                  onClick={() => setSelectedFolder(folder)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedFolder(folder);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select folder ${folder}`}
                >
                  <span>📁 {folder}</span>
                  <span style={{ fontSize: '11px', color: palette.text.secondary }}>
                    {libraryItems.filter((i) => i.folder === folder).length} items
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Right: Items in Folder */}
        <Card themeMode={themeMode}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: `${spacing.sm}px`,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: `${typography.webScale.sectionHeading}px`,
                color: palette.text.primary,
              }}
            >
              {selectedFolder}
            </h2>
            <span style={{ fontSize: '12px', color: palette.text.secondary }}>
              {filteredItems.length} matching {typeFilter} records
            </span>
          </div>

          {filteredItems.length === 0 ? (
            <div
              style={{
                padding: `${spacing.lg}px`,
                textAlign: 'center',
                color: palette.text.secondary,
              }}
            >
              No {typeFilter !== 'all' ? typeFilter : ''} items in this folder.
            </div>
          ) : (
            <div role="list" aria-label={`Items in ${selectedFolder}`}>
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: `${touchTargets.webMin}px`,
                    padding: `${spacing.xs}px 0`,
                    borderBottom: `1px solid ${palette.border.subtle}`,
                    gap: `${spacing.sm}px`,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: `${typography.webScale.body}px`,
                        fontWeight: 600,
                        color: palette.text.primary,
                      }}
                    >
                      {item.title}
                    </div>
                    <div style={{ fontSize: '12px', color: palette.text.secondary }}>
                      {item.folder} · {item.ext}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      padding: '2px 8px',
                      borderRadius: `${radii.pill}px`,
                      backgroundColor: palette.surfaceRaised,
                      color: palette.text.secondary,
                      border: `1px solid ${palette.border.subtle}`,
                    }}
                  >
                    {item.type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* New Folder Modal */}
      <Dialog
        isOpen={isFolderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        title="Create Workspace Folder"
        description="Folders can contain notes, guides, and files together in one canonical tree."
        themeMode={themeMode}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          <TextField
            id="new-folder-input"
            label="Folder Name"
            placeholder="e.g. Finance or Personal Projects"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            themeMode={themeMode}
            autoFocus
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: `${spacing.sm}px` }}>
            <Button
              variant="secondary"
              themeMode={themeMode}
              onClick={() => setFolderModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              themeMode={themeMode}
              onClick={() => setFolderModalOpen(false)}
            >
              Create Folder Preview
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
