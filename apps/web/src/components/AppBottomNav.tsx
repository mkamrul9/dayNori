'use client';

import { Icon } from '@daynori/ui-web';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { colors, spacing, touchTargets } from '@daynori/design-tokens';
import { useShell } from './ShellContext';

export const AppBottomNav: React.FC = () => {
  const pathname = usePathname();
  const { themeMode } = useShell();
  const palette = colors[themeMode];

  const primaryTabs = [
    { href: '/today', label: 'Today', icon: 'sun' },
    { href: '/plan', label: 'Plan', icon: 'clipboard' },
    { href: '/library', label: 'Library', icon: 'library' },
    { href: '/journal', label: 'Journal', icon: 'book' },
  ];

  return (
    <nav
      role="navigation"
      aria-label="Compact Navigation"
      className="mobile-only"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '60px',
        backgroundColor: palette.surface,
        borderTop: `1px solid ${palette.border.subtle}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 100,
        padding:
          '0 env(safe-area-inset-right, 0) env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0)',
        boxSizing: 'border-box',
      }}
    >
      {primaryTabs.map((tab) => {
        const isActive =
          tab.href === '/plan' ? pathname.startsWith('/plan') : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: `${touchTargets.webMin}px`,
              minWidth: `${touchTargets.webMin}px`,
              padding: `4px ${spacing.sm}px`,
              textDecoration: 'none',
              color: isActive ? palette.action.primary : palette.text.secondary,
              fontWeight: isActive ? 700 : 500,
              fontSize: '12px',
              borderTop: isActive ? `3px solid ${palette.action.primary}` : '3px solid transparent',
              boxSizing: 'border-box',
              flex: 1,
              textAlign: 'center',
              transition: 'color 120ms ease',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '18px', marginBottom: '2px' }}>
              <Icon name={tab.icon} />
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};
