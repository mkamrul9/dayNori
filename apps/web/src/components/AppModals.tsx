'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { colors, radii, spacing } from '@daynori/design-tokens';
import { Button, Dialog, Feedback, ListRow, TextField } from '@daynori/ui-web';
import { useShell } from './ShellContext';
import { useAuth } from './AuthContext';
import { AuthModal } from './AuthModal';

export const AppModals: React.FC = () => {
  const router = useRouter();
  const { themeMode, activeModal, closeModal, isMobileDrawerOpen, setMobileDrawerOpen } =
    useShell();
  const { user, isAuthenticated, signOut, openAuthModal } = useAuth();

  const palette = colors[themeMode];
  const [searchQuery, setSearchQuery] = useState('');

  const searchableDestinations = [
    {
      title: 'Today',
      subtitle: 'Immediate action, upcoming tasks and daily routines',
      href: '/today',
      icon: '☀️',
    },
    {
      title: 'Plan: Tasks & Routines',
      subtitle: 'Organize tasks, recurring habits, and priorities',
      href: '/plan',
      icon: '📋',
    },
    {
      title: 'Plan: Calendar',
      subtitle: 'Agenda and calendar projection under Plan',
      href: '/plan/calendar',
      icon: '📅',
    },
    {
      title: 'Library: Folders & Files',
      subtitle: 'Workspace folder hierarchy, notes, and documents',
      href: '/library',
      icon: '📚',
    },
    {
      title: 'Files & Storage',
      subtitle: 'Upload files, safe previews, and storage quota',
      href: '/library?type=files',
      icon: '📎',
    },
    {
      title: 'Journal: Reflection Timeline',
      subtitle: 'Date-grouped timeline and private writing',
      href: '/journal',
      icon: '📖',
    },
    {
      title: 'Settings',
      subtitle: 'Theme, text size, motion, and language settings',
      href: '/settings',
      icon: '⚙️',
    },
    {
      title: 'Help & Shortcuts',
      subtitle: 'Keyboard shortcuts and accessible navigation guide',
      href: '/help',
      icon: '❓',
    },
    {
      title: 'Component Review Gallery',
      subtitle: 'Phase 04 design token and primitive test gallery',
      href: '/review',
      icon: '🎨',
    },
  ];

  const filteredDestinations = searchQuery.trim()
    ? searchableDestinations.filter(
        (d) =>
          d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : searchableDestinations;

  const navigateTo = (href: string) => {
    closeModal();
    setMobileDrawerOpen(false);
    router.push(href);
  };

  return (
    <>
      {/* 1. Global Search Dialog */}
      <Dialog
        isOpen={activeModal === 'search'}
        onClose={closeModal}
        title="Search Organizer"
        description="Search across navigation views, tasks, notes, and journal entries."
        themeMode={themeMode}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          <Feedback
            severity="info"
            message="Phase 05 Navigation Shell — Search index and authorized queries will be finalized in Phase 33. Shell destinations are searchable below."
            themeMode={themeMode}
          />

          <TextField
            id="search-input"
            label="Search Query"
            placeholder="Search views, tasks, folders, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            themeMode={themeMode}
            autoFocus
          />

          <div
            role="list"
            aria-label="Search results"
            style={{
              maxHeight: '260px',
              overflowY: 'auto',
              border: `1px solid ${palette.border.subtle}`,
              borderRadius: `${radii.sm}px`,
            }}
          >
            {filteredDestinations.length > 0 ? (
              filteredDestinations.map((item) => (
                <ListRow
                  key={item.href}
                  title={`${item.icon} ${item.title}`}
                  subtitle={item.subtitle}
                  onClick={() => navigateTo(item.href)}
                  themeMode={themeMode}
                />
              ))
            ) : (
              <div
                style={{
                  padding: `${spacing.lg}px`,
                  textAlign: 'center',
                  color: palette.text.secondary,
                }}
              >
                No matching organizer items found.
              </div>
            )}
          </div>

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', marginTop: `${spacing.sm}px` }}
          >
            <Button variant="secondary" themeMode={themeMode} onClick={closeModal}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 2. Global Create Dialog */}
      <Dialog
        isOpen={activeModal === 'create'}
        onClose={closeModal}
        title="Create Item"
        description="Add a new task, routine, note, or entry to your workspace."
        themeMode={themeMode}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
          <Feedback
            severity="info"
            message="Phase 05 Navigation Shell — Creation preview. Persistent storage for tasks, routines, and notes will be wired in Phase 07 and subsequent feature phases."
            themeMode={themeMode}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}>
            <ListRow
              title="📝 New Task"
              subtitle="Add a one-off task with optional deadline and priority"
              onClick={() => navigateTo('/plan')}
              themeMode={themeMode}
            />
            <ListRow
              title="🔄 New Routine"
              subtitle="Add a recurring daily or weekday habit with independent completion"
              onClick={() => navigateTo('/plan')}
              themeMode={themeMode}
            />
            <ListRow
              title="📄 New Note"
              subtitle="Save reference knowledge, guides, or rich documents"
              onClick={() => navigateTo('/library?create=note')}
              themeMode={themeMode}
            />
            <ListRow
              title="📎 Upload File"
              subtitle="Upload PDFs, images, or documents to workspace folders"
              onClick={() => navigateTo('/library?create=file')}
              themeMode={themeMode}
            />
            <ListRow
              title="📖 New Journal Entry"
              subtitle="Open a quiet writing surface for reflection"
              onClick={() => navigateTo('/journal')}
              themeMode={themeMode}
            />
            <ListRow
              title="📁 New Folder"
              subtitle="Create a workspace folder to group tasks and documents"
              onClick={() => navigateTo('/library')}
              themeMode={themeMode}
            />
          </div>

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', marginTop: `${spacing.sm}px` }}
          >
            <Button variant="secondary" themeMode={themeMode} onClick={closeModal}>
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 3. Global Help & Shortcuts Dialog */}
      <Dialog
        isOpen={activeModal === 'help'}
        onClose={closeModal}
        title="Keyboard Shortcuts & Navigation"
        description="Quickly navigate Daynori using single-key shortcuts."
        themeMode={themeMode}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ borderBottom: `2px solid ${palette.border.strong}` }}>
                <th style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>Shortcut</th>
                <th style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {[
                { key: '?', action: 'Open Keyboard Shortcuts and Help' },
                { key: '/', action: 'Open Search modal' },
                { key: 'C', action: 'Open Create item modal' },
                { key: 'T', action: 'Navigate to Today view' },
                { key: 'P', action: 'Navigate to Plan view' },
                { key: 'K', action: 'Navigate to Calendar under Plan' },
                { key: 'L', action: 'Navigate to Library' },
                { key: 'J', action: 'Navigate to Journal' },
                { key: ',', action: 'Navigate to Settings' },
                { key: 'Esc', action: 'Close dialog, menu, or drawer' },
              ].map((row) => (
                <tr key={row.key} style={{ borderBottom: `1px solid ${palette.border.subtle}` }}>
                  <td style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>
                    <kbd
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: palette.surfaceRaised,
                        border: `1px solid ${palette.border.strong}`,
                        fontWeight: 700,
                        color: palette.text.primary,
                      }}
                    >
                      {row.key}
                    </kbd>
                  </td>
                  <td style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Feedback
            severity="info"
            message="Shortcuts are suppressed while typing in inputs, textareas, or editable note content."
            themeMode={themeMode}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" themeMode={themeMode} onClick={closeModal}>
              Got It
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 4. Global Account / Workspace Dialog */}
      <Dialog
        isOpen={activeModal === 'account'}
        onClose={closeModal}
        title="Workspace Profile"
        description="Current workspace scope and membership."
        themeMode={themeMode}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          <div
            style={{
              padding: `${spacing.base}px`,
              backgroundColor: palette.surfaceRaised,
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
            }}
          >
            {isAuthenticated && user ? (
              <>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>
                  {user.displayName || user.email}
                </div>
                <div style={{ fontSize: '13px', color: palette.text.secondary, marginTop: '4px' }}>
                  User ID: {user.id}
                </div>
                <div style={{ fontSize: '13px', color: palette.text.secondary, marginTop: '2px' }}>
                  Email: {user.email} | Verified Session
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>Not Signed In</div>
                <div style={{ fontSize: '13px', color: palette.text.secondary, marginTop: '4px' }}>
                  Operating in local offline mode.
                </div>
                <div style={{ fontSize: '13px', color: palette.text.secondary, marginTop: '2px' }}>
                  Sign in or create an account to synchronize across devices.
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: `${spacing.sm}px`, justifyContent: 'flex-end' }}>
            {isAuthenticated ? (
              <Button
                variant="secondary"
                themeMode={themeMode}
                onClick={async () => {
                  await signOut();
                  closeModal();
                }}
              >
                Sign Out
              </Button>
            ) : (
              <Button
                variant="primary"
                themeMode={themeMode}
                onClick={() => {
                  closeModal();
                  openAuthModal();
                }}
              >
                Sign In / Sign Up
              </Button>
            )}
            <Button
              variant="secondary"
              themeMode={themeMode}
              onClick={() => navigateTo('/settings')}
            >
              Workspace Settings
            </Button>
            <Button variant="primary" themeMode={themeMode} onClick={closeModal}>
              Done
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 5. Mobile Navigation Drawer */}
      <Dialog
        isOpen={isMobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        title="Navigation Menu"
        description="All organizer sections and workspace tools."
        themeMode={themeMode}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}>
          <ListRow
            title="☀️ Today"
            subtitle="Immediate action, due tasks and routines"
            onClick={() => navigateTo('/today')}
            themeMode={themeMode}
          />
          <ListRow
            title="📋 Plan: Tasks & Routines"
            subtitle="Task backlog, scheduled routines, and filters"
            onClick={() => navigateTo('/plan')}
            themeMode={themeMode}
          />
          <ListRow
            title="📅 Plan: Calendar"
            subtitle="Agenda and month projections under Plan"
            onClick={() => navigateTo('/plan/calendar')}
            themeMode={themeMode}
          />
          <ListRow
            title="📚 Library"
            subtitle="Folder hierarchy, notes, and files"
            onClick={() => navigateTo('/library')}
            themeMode={themeMode}
          />
          <ListRow
            title="📖 Journal"
            subtitle="Reflective date timeline and entry editor"
            onClick={() => navigateTo('/journal')}
            themeMode={themeMode}
          />
          <div
            style={{
              borderTop: `1px solid ${palette.border.subtle}`,
              margin: `${spacing.xs}px 0`,
            }}
          />
          <ListRow
            title="🎨 Component Gallery"
            subtitle="Phase 04 design system and primitive test gallery"
            onClick={() => navigateTo('/review')}
            themeMode={themeMode}
          />
          <ListRow
            title="⚙️ Settings"
            subtitle="Theme, text scaling, language, and motion"
            onClick={() => navigateTo('/settings')}
            themeMode={themeMode}
          />
          <ListRow
            title="❓ Help & Shortcuts"
            subtitle="Keyboard guide and accessibility details"
            onClick={() => navigateTo('/help')}
            themeMode={themeMode}
          />
        </div>
      </Dialog>

      {/* 6. Accessible Auth Modal */}
      <AuthModal />
    </>
  );
};
