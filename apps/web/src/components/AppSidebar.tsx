'use client';

import { Icon } from '@daynori/ui-web';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { colors, density, radii, spacing, touchTargets } from '@daynori/design-tokens';
import { useShell } from './ShellContext';
import { useFeatureNavigation } from '../navigation/useFeatureNavigation';

export const AppSidebar: React.FC = () => {
  const pathname = usePathname();
  const { themeMode } = useShell();
  const palette = colors[themeMode];
  const { primaryTabs, pins, isOperator } = useFeatureNavigation();

  const utilityItems = [
    { href: '/features', label: 'All features', icon: 'sliders' },
    { href: '/help', label: 'Help & tutorial', icon: 'help' },
    { href: '/support', label: 'Support', icon: 'user' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
    ...(isOperator ? [{ href: '/developer', label: 'Developer', icon: 'code' }] : []),
  ];

  const renderNavLink = (
    item: { href: string; label: string; icon: string },
    isNested = false
  ) => {
    const isActive =
      item.href === '/plan'
        ? pathname === '/plan' || pathname.startsWith('/plan/')
        : pathname === item.href || pathname.startsWith(item.href + '/');

    return (
      <Link
        key={item.href + item.label}
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
            <Icon name={item.icon} />
          </span>
          <span>{item.label}</span>
        </span>
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
        minHeight: `calc(100vh - ${density.headerHeight}px)`,
        flexShrink: 0,
        gap: `${spacing.md}px`,
      }}
    >
      <div>
        <div
          style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: palette.text.muted,
            padding: `0 ${spacing.sm}px ${spacing.xs}px`,
            fontWeight: 700,
          }}
        >
          Primary
        </div>
        {primaryTabs.map((tab) =>
          renderNavLink({ href: tab.webPath, label: tab.label, icon: tab.icon })
        )}
        <div
          style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: palette.text.muted,
            padding: `${spacing.md}px ${spacing.sm}px ${spacing.xs}px`,
            fontWeight: 700,
          }}
        >
          Pins
        </div>
        {pins.length > 0 ? (
          pins.map((pin) =>
            renderNavLink({ href: pin.webPath, label: pin.label, icon: pin.icon }, true)
          )
        ) : (
          <p
            style={{
              margin: `0 ${spacing.sm}px`,
              fontSize: 12,
              color: palette.text.secondary,
            }}
          >
            Pin modules from All features
          </p>
        )}
      </div>

      <div
        style={{ borderTop: `1px solid ${palette.border.subtle}`, paddingTop: `${spacing.sm}px` }}
      >
        <div
          style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: palette.text.muted,
            padding: `0 ${spacing.sm}px ${spacing.xs}px`,
            fontWeight: 700,
          }}
        >
          Utilities
        </div>
        {utilityItems.map((item) => renderNavLink(item))}
      </div>
    </nav>
  );
};
