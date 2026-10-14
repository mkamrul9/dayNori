'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { colors, radii, spacing, touchTargets } from '@daynori/design-tokens';
import { useShell } from './ShellContext';

export const AppSidebar: React.FC = () => {
  const pathname = usePathname();
  const { themeMode } = useShell();
  const palette = colors[themeMode];

  const navItems = [
    { href: '/today', label: 'Today', icon: '☀️', shortcut: 'T' },
    {
      href: '/plan',
      label: 'Plan',
      icon: '📋',
      shortcut: 'P',
      children: [{ href: '/plan/calendar', label: 'Calendar', icon: '📅', shortcut: 'K' }],
    },
    { href: '/library', label: 'Library', icon: '📚', shortcut: 'L' },
    { href: '/journal', label: 'Journal', icon: '📖', shortcut: 'J' },
  ];

  const secondaryItems = [
    { href: '/review', label: 'Component Gallery', icon: '🎨' },
    { href: '/settings', label: 'Settings', icon: '⚙️', shortcut: ',' },
    { href: '/help', label: 'Help & Shortcuts', icon: '❓', shortcut: '?' },
  ];

  const renderNavLink = (
    item: { href: string; label: string; icon: string; shortcut?: string },
    isNested = false
  ) => {
    const isActive = item.href === '/plan' ? pathname === '/plan' : pathname.startsWith(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={isActive ? 'page' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: `${touchTargets.webMin}px`,
          padding: `${spacing.xs}px ${spacing.sm}px ${spacing.xs}px ${
            isNested ? spacing.xl : spacing.sm
          }px`,
          borderRadius: `${radii.sm}px`,
          backgroundColor: isActive ? palette.surfaceRaised : 'transparent',
          color: isActive ? palette.action.primary : palette.text.primary,
          fontWeight: isActive ? 700 : 500,
          textDecoration: 'none',
          fontSize: isNested ? '13px' : '14px',
          borderLeft: isActive ? `3px solid ${palette.action.primary}` : '3px solid transparent',
          marginBottom: '2px',
          boxSizing: 'border-box',
          transition: 'background-color 120ms ease, color 120ms ease',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
          <span aria-hidden="true" style={{ fontSize: isNested ? '14px' : '16px' }}>
            {item.icon}
          </span>
          <span>{item.label}</span>
        </span>
        {item.shortcut && (
          <kbd
            aria-hidden="true"
            style={{
              fontSize: '11px',
              padding: '1px 4px',
              borderRadius: '3px',
              backgroundColor: palette.surface,
              border: `1px solid ${palette.border.subtle}`,
              color: palette.text.secondary,
            }}
          >
            {item.shortcut}
          </kbd>
        )}
      </Link>
    );
  };

  return (
    <nav
      role="navigation"
      aria-label="Desktop Navigation"
      className="desktop-only sidebar-expanded"
      style={{
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: `${spacing.base}px ${spacing.sm}px`,
        backgroundColor: palette.surface,
        borderRight: `1px solid ${palette.border.subtle}`,
        boxSizing: 'border-box',
        minHeight: 'calc(100vh - 60px)',
        flexShrink: 0,
      }}
    >
      {/* Primary Organizer Destinations */}
      <div>
        <div
          style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: palette.text.secondary,
            padding: `0 ${spacing.sm}px ${spacing.xs}px`,
            fontWeight: 700,
          }}
        >
          Organizer
        </div>
        {navItems.map((item) => (
          <React.Fragment key={item.href}>
            {renderNavLink(item)}
            {item.children?.map((child) => renderNavLink(child, true))}
          </React.Fragment>
        ))}
      </div>

      {/* Utility & Review Links */}
      <div
        style={{ borderTop: `1px solid ${palette.border.subtle}`, paddingTop: `${spacing.sm}px` }}
      >
        <div
          style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: palette.text.secondary,
            padding: `0 ${spacing.sm}px ${spacing.xs}px`,
            fontWeight: 700,
          }}
        >
          Workspace
        </div>
        {secondaryItems.map((item) => renderNavLink(item))}
      </div>
    </nav>
  );
};
