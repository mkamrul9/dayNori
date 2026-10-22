'use client';

import React from 'react';
import { RouteAnnouncer, SkipLink } from '@daynori/ui-web';
import { AppBottomNav } from './AppBottomNav';
import { AppHeader } from './AppHeader';
import { AppModals } from './AppModals';
import { AppSidebar } from './AppSidebar';
import { useShell } from './ShellContext';
import { corePreviewNotice, isCorePreview } from '../config/preview';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { themeMode, routeAnnouncement } = useShell();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* 1. Skip Navigation Link */}
      <SkipLink targetId="main-content" label="Skip to main content" themeMode={themeMode} />

      {/* 2. Accessible Route Change Announcer */}
      <RouteAnnouncer message={routeAnnouncement} />

      {/* 3. Header Banner */}
      <AppHeader />
      {isCorePreview && (
        <aside
          aria-label="Testing preview limitations"
          style={{ padding: '12px 20px', background: '#fff1c2', color: '#332c1a', fontSize: 14 }}
        >
          {corePreviewNotice}
        </aside>
      )}

      {/* 4. Desktop Sidebar + Main Content Layout */}
      <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
        <AppSidebar />

        <main
          id="main-content"
          role="main"
          tabIndex={-1}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            outline: 'none',
            boxSizing: 'border-box',
            width: '100%',
            // Add padding bottom on mobile so bottom navigation never covers content
            paddingBottom: '80px',
          }}
        >
          {children}
        </main>
      </div>

      {/* 5. Mobile Compact Navigation */}
      <AppBottomNav />

      {/* 6. Accessible Global Modals & Drawers */}
      <AppModals />
    </div>
  );
};
