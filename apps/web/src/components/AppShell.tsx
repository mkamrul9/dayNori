'use client';

import React from 'react';
import { RouteAnnouncer, SkipLink } from '@daynori/ui-web';
import { AppBottomNav } from './AppBottomNav';
import { AppHeader } from './AppHeader';
import { AppModals } from './AppModals';
import { AppSidebar } from './AppSidebar';
import { PreviewNotice } from './PreviewNotice';
import { AppStatusBanners } from './AppStatusBanners';
import { useShell } from './ShellContext';
import { isCorePreview } from '../config/preview';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { themeMode, routeAnnouncement } = useShell();

  return (
    <div className="daynori-app-root" style={{ display: 'flex', flexDirection: 'column' }}>
      <SkipLink targetId="main-content" label="Skip to main content" themeMode={themeMode} />
      <RouteAnnouncer message={routeAnnouncement} />
      <AppHeader />
      {isCorePreview && <PreviewNotice themeMode={themeMode} />}

      <div style={{ display: 'flex', flex: 1, position: 'relative', minWidth: 0 }}>
        <AppSidebar />

        <main
          id="main-content"
          role="main"
          tabIndex={-1}
          className="daynori-main-scroll"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            outline: 'none',
            boxSizing: 'border-box',
            width: '100%',
            minWidth: 0,
          }}
        >
          {children}
        </main>
      </div>

      <AppBottomNav />
      <AppStatusBanners />
      <AppModals />
    </div>
  );
};
