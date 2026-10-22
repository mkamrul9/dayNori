'use client';

import { Icon } from '@daynori/ui-web';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { colors, touchTargets } from '@daynori/design-tokens';
import { useShell } from './ShellContext';

export const AppBottomNav: React.FC = () => {
  const pathname = usePathname();
  const { themeMode } = useShell();
  const palette = colors[themeMode];

  const primaryTabs = [
    { href: '/today', label: 'Today', icon: 'sun' as const },
    { href: '/plan', label: 'Plan', icon: 'clipboard' as const },
    { href: '/library', label: 'Library', icon: 'library' as const },
    { href: '/journal', label: 'Journal', icon: 'book' as const },
  ];

  return (
    <nav
      role="navigation"
      aria-label="Main"
      className="mobile-only"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        minHeight: 'var(--daynori-bottom-nav-height)',
        backgroundColor: palette.surface,
        borderTop: `1px solid ${palette.border.subtle}`,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-around',
        zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
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
            className="daynori-break"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: `${touchTargets.webMin}px`,
              minWidth: 0,
              maxWidth: '100%',
              padding: '6px 1px',
              textDecoration: 'none',
              color: isActive ? palette.action.primary : palette.text.secondary,
              fontWeight: isActive ? 700 : 500,
              fontSize: '10px',
              lineHeight: 1.15,
              borderTop: isActive ? `3px solid ${palette.action.primary}` : '3px solid transparent',
              boxSizing: 'border-box',
              flex: '1 1 0',
              textAlign: 'center',
              transition: 'color 120ms ease',
              overflow: 'hidden',
            }}
          >
            <span aria-hidden="true" style={{ display: 'inline-flex', marginBottom: '2px', flexShrink: 0 }}>
              <Icon name={tab.icon} size={18} />
            </span>
            <span
              className="daynori-break daynori-bottom-nav-label"
              style={{
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};
