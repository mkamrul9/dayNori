'use client';

import { Icon } from '@daynori/ui-web';
import React from 'react';
import Link from 'next/link';
import { colors, radii, spacing, touchTargets } from '@daynori/design-tokens';
import { useShell } from './ShellContext';
import { TourTarget } from '../tours/TourTarget';

/**
 * Compact mobile chrome: one header row without horizontal scrolling for essentials.
 * Create stays labeled; Search/Settings/Account use accessible names; Help/theme live
 * in the drawer and Settings subpages on narrow widths.
 */
export const AppHeader: React.FC = () => {
  const { themeMode, toggleTheme, openModal, isMobileDrawerOpen, setMobileDrawerOpen } = useShell();
  const palette = colors[themeMode];

  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: `${touchTargets.webMin}px`,
    minWidth: `${touchTargets.webMin}px`,
    padding: `0 ${spacing.sm}px`,
    borderRadius: `${radii.sm}px`,
    border: `1px solid ${palette.border.subtle}`,
    backgroundColor: palette.surface,
    color: palette.text.primary,
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'background-color 150ms ease, border-color 150ms ease',
    flexShrink: 0,
  };

  return (
    <header
      role="banner"
      className="daynori-app-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: `${spacing.xs}px`,
        padding: `${spacing.xs}px ${spacing.base}px`,
        minHeight: 'var(--daynori-header-height)',
        backgroundColor: palette.surface,
        borderBottom: `1px solid ${palette.border.subtle}`,
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxSizing: 'border-box',
        width: '100%',
        paddingTop: `max(${spacing.xs}px, env(safe-area-inset-top, 0px))`,
        paddingLeft: `max(${spacing.base}px, env(safe-area-inset-left, 0px))`,
        paddingRight: `max(${spacing.base}px, env(safe-area-inset-right, 0px))`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, minWidth: 0 }}>
        <button
          type="button"
          aria-label="Toggle navigation drawer"
          aria-expanded={isMobileDrawerOpen}
          aria-controls="mobile-nav-drawer"
          onClick={() => setMobileDrawerOpen(!isMobileDrawerOpen)}
          style={{
            ...buttonStyle,
            display: 'flex',
          }}
          className="mobile-only"
        >
          <span aria-hidden="true" style={{ fontSize: '18px' }}>
            <Icon name="menu" />
          </span>
        </button>

        <a
          href="/today"
          style={{
            textDecoration: 'none',
            color: palette.text.primary,
            display: 'flex',
            alignItems: 'center',
            minHeight: `${touchTargets.webMin}px`,
            lineHeight: `${touchTargets.webMin}px`,
            flexShrink: 0,
          }}
        >
          <img
            className="desktop-only"
            src={`/brand/daynori-${themeMode === 'dark' ? 'logo-inverse' : 'logo'}.svg`}
            alt="Daynori"
            width={125}
            height={36}
            style={{ display: 'block', flexShrink: 0 }}
          />
          <img
            className="mobile-only"
            src={`/brand/daynori-symbol${themeMode === 'dark' ? '-inverse' : ''}.svg`}
            alt="Daynori"
            width={32}
            height={32}
            style={{ display: 'none', flexShrink: 0 }}
          />
        </a>
      </div>

      <div
        role="toolbar"
        aria-label="Quick actions"
        className="daynori-header-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: `${spacing.xs}px`,
          flex: '0 1 auto',
          minWidth: 0,
          justifyContent: 'flex-end',
          flexWrap: 'nowrap',
        }}
      >
        <TourTarget id="shell.all-features">
          <Link
            href="/features"
            id="global-all-features-btn"
            aria-label="All features directory"
            style={{ ...buttonStyle, textDecoration: 'none' }}
            className="daynori-header-all-features hide-below-380"
          >
            <span aria-hidden="true">
              <Icon name="sliders" />
            </span>
            <span className="desktop-only" style={{ marginLeft: '4px' }}>
              All features
            </span>
          </Link>
        </TourTarget>

        <TourTarget id="shell.search">
        <button
          type="button"
          id="global-search-btn"
          aria-label="Search items (Shortcut /)"
          onClick={() => openModal('search')}
          style={buttonStyle}
        >
          <span aria-hidden="true">
            <Icon name="search" />
          </span>
          <span className="desktop-only" style={{ marginLeft: '4px' }}>
            Search
          </span>
          <kbd
            className="desktop-only"
            style={{
              marginLeft: '6px',
              fontSize: '11px',
              padding: '2px 5px',
              borderRadius: '4px',
              backgroundColor: palette.surfaceRaised,
              border: `1px solid ${palette.border.strong}`,
              color: palette.text.secondary,
            }}
          >
            /
          </kbd>
        </button>
        </TourTarget>

        <TourTarget id="shell.create">
        <button
          type="button"
          id="global-create-btn"
          aria-label="Create item (Shortcut C)"
          onClick={() => openModal('create')}
          style={{
            ...buttonStyle,
            backgroundColor: palette.action.primary,
            color: palette.action.label,
            borderColor: palette.action.primary,
            padding: `0 ${spacing.base}px`,
          }}
        >
          <span aria-hidden="true" style={{ fontWeight: 'bold' }}>
            <Icon name="plus" />
          </span>
          <span style={{ marginLeft: '4px' }}>Create</span>
          <kbd
            className="desktop-only"
            style={{
              marginLeft: '6px',
              fontSize: '11px',
              padding: '2px 5px',
              borderRadius: '4px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: palette.action.label,
            }}
          >
            C
          </kbd>
        </button>
        </TourTarget>

        <Link
          href="/settings"
          id="global-settings-btn"
          aria-label="Settings"
          className="mobile-only daynori-header-settings hide-below-380"
          style={{ ...buttonStyle, textDecoration: 'none', display: 'none' }}
        >
          <span aria-hidden="true">
            <Icon name="settings" />
          </span>
        </Link>

        <button
          type="button"
          id="global-theme-toggle"
          className="desktop-only"
          aria-label={`Switch to ${themeMode === 'light' ? 'dark' : 'light'} theme`}
          onClick={toggleTheme}
          style={{ ...buttonStyle, display: 'none' }}
        >
          <span aria-hidden="true">
            <Icon name={themeMode === 'light' ? 'moon' : 'sun'} />
          </span>
        </button>

        <button
          type="button"
          id="global-help-btn"
          className="desktop-only"
          aria-label="Help and keyboard shortcuts (Shortcut ?)"
          onClick={() => openModal('help')}
          style={{ ...buttonStyle, display: 'none' }}
        >
          <span aria-hidden="true">
            <Icon name="help" />
          </span>
        </button>

        <button
          type="button"
          id="global-account-btn"
          aria-label="Account and workspace profile"
          onClick={() => openModal('account')}
          style={buttonStyle}
        >
          <span aria-hidden="true">
            <Icon name="user" />
          </span>
        </button>
      </div>
    </header>
  );
};
